/**
 * `run(argv, io)` — the pure, synchronous CLI core (§11).
 *
 * Parses argv, drives the frozen detector library, and returns the §11.4 exit
 * code. Every side effect flows through the injected `Io`, so the command is
 * fully testable programmatically (no subprocess, no build) and deterministic
 * under a fixed clock (AT-23).
 *
 * Reuse, never reimplement: the report is produced by `createScanner`, made
 * canonical by `serializeReport`, and the exit code comes from the harness's
 * `exitCodeForDecision` / `SCAN_ERROR_EXIT_CODE` — this file restates none of
 * that logic.
 *
 * Exit-code contract (identical in `--json` and default modes; driven only by
 * `decision.value`):
 *   0  ready / ready_with_warnings
 *   1  not_ready
 *   2  scan error (or usage/parse error)
 *   3  not_evaluated (unsupported stack)
 *
 * The `scan` command emits the canonical JSON report plus the §11.3 human
 * report.md and §11.2 banner; the `eval` command wraps the §9 fixture harness.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializeReport } from '../report/serialize.js';
import { exitCodeForDecision, runEvaluation, SCAN_ERROR_EXIT_CODE } from '../eval/harness.js';
import type { EvalSummary } from '../eval/harness.js';
import type { ModelClient } from '../model/client.js';
import { createScanner, scanWithModel } from '../scan/scanner.js';
import type { Report } from '../schema/index.js';
import { parseArgs } from './args.js';
import type { CliFlags } from './args.js';
import { renderBanner } from './banner.js';
import type { Io } from './io.js';
import { renderReportMd } from './reportMd.js';

/**
 * The vendored fixtures live at `<repo>/fixtures` — two levels up from this
 * module (`src/cli/run.ts`). A module-relative constant, not a host input, so
 * the `eval` command stays deterministic and reads no environment (SEC-3).
 */
const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

/**
 * Resolves the directory to scan: the positional path against cwd, then the
 * optional `--app` sub-path against that (repointing the scan into a monorepo
 * sub-app when given).
 */
function resolveScanTarget(io: Io, path: string, flags: CliFlags): string {
  const base = resolve(io.cwd(), path);
  return flags.app !== undefined ? resolve(base, flags.app) : base;
}

/**
 * Emits a completed report and returns the exit code. Shared by the sync and
 * online scan paths so their output behavior is identical: `--json` writes the
 * canonical report to stdout (no files); default mode writes report.json +
 * report.md into the output directory (--out, else `<target>/.sugarbee`) and
 * prints the banner. Writes are confined to the output directory (SEC-6); the
 * renderers consume only already-redacted evidence (SEC-4).
 */
function emitReport(report: Report, target: string, flags: CliFlags, io: Io): number {
  const exitCode = exitCodeForDecision(report.decision.value);

  if (flags.json) {
    io.stdout(serializeReport(report));
    return exitCode;
  }

  const outDir = flags.out !== undefined ? resolve(io.cwd(), flags.out) : join(target, '.sugarbee');
  const reportJsonPath = join(outDir, 'report.json');
  const reportMdPath = join(outDir, 'report.md');
  io.writeFile(reportJsonPath, serializeReport(report));
  io.writeFile(reportMdPath, renderReportMd(report));
  io.stdout(renderBanner(report));
  io.stdout(`\nReport: ${reportMdPath} · ${reportJsonPath}\n`);
  return exitCode;
}

/** Runs the deterministic (sync, model-less) `scan` and returns its exit code. */
function runScan(target: string, flags: CliFlags, io: Io): number {
  let report: Report;
  try {
    // `checks` and `now` are the only tunables; when `checks` is undefined the
    // scanner runs every detector, byte-identically to a bare createScanner.
    report = createScanner({ now: () => io.now(), checks: flags.checks })(target);
  } catch (error) {
    io.stderr(`sugarbee: scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return SCAN_ERROR_EXIT_CODE;
  }
  return emitReport(report, target, flags, io);
}

/** Runs the online `scan` (model layer enabled) and returns its exit code. */
async function runScanOnline(target: string, flags: CliFlags, io: Io, model: ModelClient): Promise<number> {
  let report: Report;
  try {
    report = await scanWithModel(target, model, { now: () => io.now(), checks: flags.checks });
  } catch (error) {
    io.stderr(`sugarbee: scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return SCAN_ERROR_EXIT_CODE;
  }
  return emitReport(report, target, flags, io);
}

/** Formats the §9.2 evaluation summary for the terminal (deterministic). */
function renderEvalSummary(summary: EvalSummary): string {
  const lines: string[] = [`sugarbee eval — ${summary.fixtureCount} fixture(s)`, ''];
  for (const r of summary.results) {
    const tag = r.decisionCorrect && r.exitCodeCorrect && r.reportValid ? 'OK' : 'XX';
    const actual = r.actualDecision ?? `scan error: ${r.scanError ?? 'unknown'}`;
    lines.push(`[${tag}] ${r.name} — expected ${r.expectedDecision}, got ${actual}`);
  }
  lines.push(
    '',
    `Decisions correct: ${summary.decisionsCorrect}/${summary.fixtureCount}`,
    `Blocker false positives: ${summary.blockerFalsePositives}`,
  );
  const pass = summary.allDecisionsCorrect && summary.blockerFalsePositives === 0;
  lines.push('', pass ? 'PASS' : 'FAIL');
  return `${lines.join('\n')}\n`;
}

/** Runs the `eval` command over the vendored fixtures and returns its exit code. */
function runEval(io: Io): number {
  const summary = runEvaluation(FIXTURES_ROOT, createScanner({ now: () => io.now() }));
  io.stdout(renderEvalSummary(summary));
  return summary.allDecisionsCorrect && summary.blockerFalsePositives === 0 ? 0 : 1;
}

/**
 * Entry point: parse argv and dispatch. All effects go through `io`.
 *
 * Two-arg `run(argv, io)` is the pure, SYNCHRONOUS core (unchanged): no model,
 * so `scan` runs the deterministic path (LG-006 `unknown`, AT-27). The bin uses
 * the three-arg `run(argv, io, model)` overload — returning a `Promise` — only
 * when a model endpoint is configured; even then, `--offline` still routes to
 * the sync path (the sole async branch is a configured, non-offline `scan`).
 */
export function run(argv: string[], io: Io): number;
export function run(argv: string[], io: Io, model: ModelClient): Promise<number>;
export function run(argv: string[], io: Io, model?: ModelClient): number | Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    io.stderr(`sugarbee: ${parsed.error}\n`);
    return model !== undefined ? Promise.resolve(SCAN_ERROR_EXIT_CODE) : SCAN_ERROR_EXIT_CODE;
  }

  if (parsed.command === 'eval') {
    const code = runEval(io);
    return model !== undefined ? Promise.resolve(code) : code;
  }

  const target = resolveScanTarget(io, parsed.path, parsed.flags);
  if (model === undefined) {
    return runScan(target, parsed.flags, io);
  }
  if (parsed.flags.offline) {
    // Model configured but --offline: honor offline — deterministic path only,
    // zero egress. Promise-wrapped to satisfy the online overload's contract.
    return Promise.resolve(runScan(target, parsed.flags, io));
  }
  return runScanOnline(target, parsed.flags, io, model);
}
