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
 * Commit 1 implements the `scan` command; the `eval` command is added in
 * Commit 2.
 */
import { join, resolve } from 'node:path';

import { serializeReport } from '../report/serialize.js';
import { exitCodeForDecision, SCAN_ERROR_EXIT_CODE } from '../eval/harness.js';
import { createScanner } from '../scan/scanner.js';
import type { Report } from '../schema/index.js';
import { parseArgs } from './args.js';
import type { CliFlags } from './args.js';
import type { Io } from './io.js';

/**
 * Resolves the directory to scan: the positional path against cwd, then the
 * optional `--app` sub-path against that (repointing the scan into a monorepo
 * sub-app when given).
 */
function resolveScanTarget(io: Io, path: string, flags: CliFlags): string {
  const base = resolve(io.cwd(), path);
  return flags.app !== undefined ? resolve(base, flags.app) : base;
}

/** Minimal Commit-1 human decision line (the rich banner arrives in Commit 2). */
function decisionLine(report: Report): string {
  return `DECISION — ${report.counts.blockers} blockers, ${report.counts.warnings} warnings\n`;
}

/** Runs the `scan` command and returns its exit code. */
function runScan(target: string, flags: CliFlags, io: Io): number {
  let report: Report;
  try {
    // `checks` and `now` are the only tunables; when `checks` is undefined the
    // scanner runs every detector, byte-identically to a bare createScanner.
    report = createScanner({ now: () => io.now(), checks: flags.checks })(target);
  } catch (error) {
    io.stderr(`launchgraph: scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return SCAN_ERROR_EXIT_CODE;
  }

  const exitCode = exitCodeForDecision(report.decision.value);

  if (flags.json) {
    // --json: canonical report to stdout only (includes its trailing newline);
    // no files are written.
    io.stdout(serializeReport(report));
    return exitCode;
  }

  // Default mode: write report.json into the output directory (--out, else
  // <target>/.launchgraph) and print a human decision line. Writes are confined
  // to the output directory (SEC-6).
  const outDir = flags.out !== undefined ? resolve(io.cwd(), flags.out) : join(target, '.launchgraph');
  io.writeFile(join(outDir, 'report.json'), serializeReport(report));
  io.stdout(decisionLine(report));
  return exitCode;
}

/**
 * Entry point: parse argv and dispatch. Pure and synchronous — all effects go
 * through `io`. Returns the process exit code.
 */
export function run(argv: string[], io: Io): number {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    io.stderr(`launchgraph: ${parsed.error}\n`);
    return SCAN_ERROR_EXIT_CODE;
  }

  if (parsed.command === 'scan') {
    return runScan(resolveScanTarget(io, parsed.path, parsed.flags), parsed.flags, io);
  }

  // 'eval' is wired to the fixture harness in Commit 2.
  io.stderr('launchgraph: `eval` is not available in this build\n');
  return SCAN_ERROR_EXIT_CODE;
}
