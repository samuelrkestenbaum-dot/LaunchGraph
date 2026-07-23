/**
 * §9 fixture evaluation harness (library only — the `launchgraph eval` CLI
 * arrives in a later slice).
 *
 * Discovers fixture repositories under a fixtures root, runs an injected
 * scanner over each, and diffs the results against the fixture's
 * ground-truth manifest. The scanner is injected so the harness is fully
 * testable without any real scanner, and the harness never installs,
 * builds, or executes fixture code (SEC-1) — fixtures are inert data read
 * only by the scanner under test.
 *
 * ## Manifest format — `fixtures/<name>/expected.json`
 *
 * ```json
 * {
 *   "decision": "not_ready",
 *   "exitCode": 1,
 *   "findings": [
 *     {
 *       "checkId": "LG-004",
 *       "outcome": "fail",
 *       "evidencePathContains": ["webhook/route.ts"]
 *     }
 *   ]
 * }
 * ```
 *
 * - `decision` — the expected `Report.decision.value`
 *   (`ready | ready_with_warnings | not_ready | not_evaluated`).
 * - `exitCode` — the expected §11.4 CLI exit code
 *   (`0` ready / ready_with_warnings, `1` not_ready, `2` scan error,
 *   `3` not_evaluated).
 * - `findings` — the expected fail/warning findings, each identified by
 *   `checkId` + `outcome`. Optional `evidencePathContains` lists
 *   substrings that must each appear in at least one cited evidence path
 *   for the finding to count as correct (§9.2: a finding only counts as
 *   correct if it cites an expected file).
 *
 * ## Matching and metrics (§9.2)
 *
 * Actual findings with outcome `fail` or `warning` are matched greedily
 * against expected findings (same checkId, same outcome, all evidence-path
 * substrings satisfied; one actual per expected). Matched pairs are true
 * positives; unmatched expected entries are false negatives (missed);
 * unmatched actual fail/warning findings are false positives (spurious).
 * Blocker false positives are spurious blocker-severity `fail` findings.
 * Per-check precision and recall aggregate over all fixtures; an
 * undefined ratio (0/0) scores 1.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHECK_OUTCOMES,
  DECISION_VALUES,
  validateReport,
} from '../schema/index.js';
import type { CheckOutcome, DecisionValue, Finding, Report } from '../schema/index.js';

/** A scanner produces a §5 report for a fixture directory. */
export type ScannerFn = (fixtureDir: string) => Report;

export interface ExpectedFinding {
  checkId: string;
  outcome: CheckOutcome;
  /** Substrings that must each appear in >=1 cited evidence path. */
  evidencePathContains?: string[];
}

export interface FixtureExpectation {
  decision: DecisionValue;
  exitCode: number;
  findings: ExpectedFinding[];
}

export interface FixtureCase {
  name: string;
  dir: string;
  expectation: FixtureExpectation;
}

export interface FixtureResult {
  name: string;
  /** Error message when the scanner threw; null otherwise. */
  scanError: string | null;
  /** §5 schema validity of the produced report (AT-25 groundwork). */
  reportValid: boolean;
  reportErrors: string[];
  expectedDecision: DecisionValue;
  actualDecision: DecisionValue | null;
  decisionCorrect: boolean;
  expectedExitCode: number;
  actualExitCode: number;
  exitCodeCorrect: boolean;
  /** Expected findings the scanner produced correctly (true positives). */
  matched: ExpectedFinding[];
  /** Expected findings the scanner failed to produce (false negatives). */
  missed: ExpectedFinding[];
  /** Unexpected fail/warning findings the scanner produced (false positives). */
  spurious: Finding[];
  /** Spurious blocker-severity fail findings (§9.2). */
  blockerFalsePositives: number;
}

export interface CheckMetrics {
  checkId: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}

export interface EvalSummary {
  results: FixtureResult[];
  /** Per-check metrics aggregated over all fixtures, sorted by checkId. */
  perCheck: CheckMetrics[];
  decisionsCorrect: number;
  fixtureCount: number;
  allDecisionsCorrect: boolean;
  blockerFalsePositives: number;
}

/** §11.4 exit-code mapping for a completed scan. */
export function exitCodeForDecision(value: DecisionValue): number {
  switch (value) {
    case 'ready':
    case 'ready_with_warnings':
      return 0;
    case 'not_ready':
      return 1;
    case 'not_evaluated':
      return 3;
  }
}

/** §11.4: exit code for a scan that errored before producing a decision. */
export const SCAN_ERROR_EXIT_CODE = 2;

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Loads and validates a fixture's `expected.json` manifest. */
export function loadExpectation(fixtureDir: string): FixtureExpectation {
  const manifestPath = join(fixtureDir, 'expected.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${fixtureDir}: missing expected.json manifest`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`${manifestPath}: invalid JSON — ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${manifestPath}: expected a JSON object`);
  }
  const decision = parsed['decision'];
  if (typeof decision !== 'string' || !(DECISION_VALUES as readonly string[]).includes(decision)) {
    throw new Error(`${manifestPath}: "decision" must be one of ${DECISION_VALUES.join(', ')}`);
  }
  const exitCode = parsed['exitCode'];
  if (typeof exitCode !== 'number' || !Number.isInteger(exitCode) || exitCode < 0) {
    throw new Error(`${manifestPath}: "exitCode" must be a non-negative integer`);
  }
  const rawFindings = parsed['findings'];
  if (!Array.isArray(rawFindings)) {
    throw new Error(`${manifestPath}: "findings" must be an array`);
  }
  const findings = rawFindings.map((entry, i): ExpectedFinding => {
    if (!isRecord(entry)) {
      throw new Error(`${manifestPath}: findings[${i}] must be an object`);
    }
    const checkId = entry['checkId'];
    if (typeof checkId !== 'string' || checkId.length === 0) {
      throw new Error(`${manifestPath}: findings[${i}].checkId must be a non-empty string`);
    }
    const outcome = entry['outcome'];
    if (typeof outcome !== 'string' || !(CHECK_OUTCOMES as readonly string[]).includes(outcome)) {
      throw new Error(`${manifestPath}: findings[${i}].outcome must be one of ${CHECK_OUTCOMES.join(', ')}`);
    }
    const substrings = entry['evidencePathContains'];
    if (substrings !== undefined) {
      if (!Array.isArray(substrings) || substrings.some((s) => typeof s !== 'string' || s.length === 0)) {
        throw new Error(`${manifestPath}: findings[${i}].evidencePathContains must be an array of non-empty strings`);
      }
    }
    return {
      checkId,
      outcome: outcome as CheckOutcome,
      ...(substrings !== undefined ? { evidencePathContains: substrings as string[] } : {}),
    };
  });
  return { decision: decision as DecisionValue, exitCode, findings };
}

/**
 * Discovers fixture cases: every directory under `fixturesRoot` containing
 * an `expected.json` manifest, sorted by name.
 */
export function discoverFixtures(fixturesRoot: string): FixtureCase[] {
  if (!existsSync(fixturesRoot)) {
    throw new Error(`fixtures root not found: ${fixturesRoot}`);
  }
  const cases: FixtureCase[] = [];
  for (const entry of readdirSync(fixturesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(fixturesRoot, entry.name);
    if (!existsSync(join(dir, 'expected.json'))) continue;
    cases.push({ name: entry.name, dir, expectation: loadExpectation(dir) });
  }
  return cases.sort((a, b) => compareStrings(a.name, b.name));
}

function matchesExpected(actual: Finding, expected: ExpectedFinding): boolean {
  if (actual.checkId !== expected.checkId || actual.outcome !== expected.outcome) {
    return false;
  }
  for (const substring of expected.evidencePathContains ?? []) {
    if (!actual.evidence.some((e) => e.path.includes(substring))) {
      return false;
    }
  }
  return true;
}

/** Runs the injected scanner over one fixture and diffs against its manifest. */
export function evaluateFixture(fixture: FixtureCase, scan: ScannerFn): FixtureResult {
  const { expectation } = fixture;

  let report: Report | null = null;
  let scanError: string | null = null;
  try {
    report = scan(fixture.dir);
  } catch (error) {
    scanError = error instanceof Error ? error.message : String(error);
  }

  if (report === null) {
    return {
      name: fixture.name,
      scanError,
      reportValid: false,
      reportErrors: [`scan error: ${scanError ?? 'unknown'}`],
      expectedDecision: expectation.decision,
      actualDecision: null,
      decisionCorrect: false,
      expectedExitCode: expectation.exitCode,
      actualExitCode: SCAN_ERROR_EXIT_CODE,
      exitCodeCorrect: expectation.exitCode === SCAN_ERROR_EXIT_CODE,
      matched: [],
      missed: [...expectation.findings],
      spurious: [],
      blockerFalsePositives: 0,
    };
  }

  const validation = validateReport(report);

  // Greedy one-to-one matching of expected findings against actual
  // fail/warning findings.
  const relevant = report.findings.filter((f) => f.outcome === 'fail' || f.outcome === 'warning');
  const unmatched = new Set(relevant);
  const matched: ExpectedFinding[] = [];
  const missed: ExpectedFinding[] = [];
  for (const expected of expectation.findings) {
    const hit = [...unmatched].find((actual) => matchesExpected(actual, expected));
    if (hit === undefined) {
      missed.push(expected);
    } else {
      unmatched.delete(hit);
      matched.push(expected);
    }
  }
  const spurious = relevant.filter((f) => unmatched.has(f));

  const actualDecision = report.decision.value;
  const actualExitCode = exitCodeForDecision(actualDecision);
  return {
    name: fixture.name,
    scanError: null,
    reportValid: validation.ok,
    reportErrors: validation.errors,
    expectedDecision: expectation.decision,
    actualDecision,
    decisionCorrect: actualDecision === expectation.decision,
    expectedExitCode: expectation.exitCode,
    actualExitCode,
    exitCodeCorrect: actualExitCode === expectation.exitCode,
    matched,
    missed,
    spurious,
    blockerFalsePositives: spurious.filter((f) => f.severity === 'blocker' && f.outcome === 'fail').length,
  };
}

/** Runs the scanner across every discovered fixture and aggregates §9.2 metrics. */
export function runEvaluation(fixturesRoot: string, scan: ScannerFn): EvalSummary {
  const results = discoverFixtures(fixturesRoot).map((fixture) => evaluateFixture(fixture, scan));

  const tallies = new Map<string, { tp: number; fp: number; fn: number }>();
  const tally = (checkId: string): { tp: number; fp: number; fn: number } => {
    let entry = tallies.get(checkId);
    if (entry === undefined) {
      entry = { tp: 0, fp: 0, fn: 0 };
      tallies.set(checkId, entry);
    }
    return entry;
  };
  for (const result of results) {
    for (const expected of result.matched) tally(expected.checkId).tp += 1;
    for (const expected of result.missed) tally(expected.checkId).fn += 1;
    for (const finding of result.spurious) tally(finding.checkId).fp += 1;
  }

  const perCheck: CheckMetrics[] = [...tallies.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([checkId, { tp, fp, fn }]) => ({
      checkId,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: tp + fp === 0 ? 1 : tp / (tp + fp),
      recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    }));

  const decisionsCorrect = results.filter((r) => r.decisionCorrect).length;
  return {
    results,
    perCheck,
    decisionsCorrect,
    fixtureCount: results.length,
    allDecisionsCorrect: decisionsCorrect === results.length,
    blockerFalsePositives: results.reduce((sum, r) => sum + r.blockerFalsePositives, 0),
  };
}
