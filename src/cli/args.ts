/**
 * §11.1 CLI argument parser — pure argv → parsed result.
 *
 * Turns a raw `argv` (already stripped of `node`/script by the caller) into a
 * discriminated `ParseResult`: a `scan`/`eval` command with resolved flags, or
 * a `{ error }` describing a usage mistake. This function performs NO I/O — it
 * neither reads the filesystem nor the environment — so it is trivially
 * testable and can never mutate anything (SEC-3: inputs are argv only).
 *
 * Supported grammar (§11.1):
 *
 *   sugarbee scan [path]
 *     --json            emit JSON report to stdout
 *     --out <dir>       output directory
 *     --offline         deterministic layer only; no network at all
 *     --checks <ids>    run a subset (comma-separated, e.g. LG-001,LG-004)
 *     --app <path>      select the app in a monorepo
 *   sugarbee eval
 */

/** Resolved flags shared by both commands. */
export interface CliFlags {
  /** `--json`: serialize the report to stdout instead of writing files. */
  json: boolean;
  /** `--offline`: deterministic layer only (honest flag; no model layer exists yet). */
  offline: boolean;
  /** `--out <dir>`: output directory for report files. */
  out?: string;
  /** `--checks <ids>`: subset of check ids to run, comma-split and trimmed. */
  checks?: readonly string[];
  /** `--app <path>`: monorepo sub-app to scan, relative to the scan path. */
  app?: string;
}

export interface ScanCommand {
  command: 'scan';
  /** Positional scan path; defaults to `.`. */
  path: string;
  flags: CliFlags;
}

export interface EvalCommand {
  command: 'eval';
  flags: CliFlags;
}

export interface ParseError {
  error: string;
}

export type ParseResult = ScanCommand | EvalCommand | ParseError;

/** Flags that consume the following token as their value. */
const VALUE_FLAGS: ReadonlySet<string> = new Set(['--out', '--checks', '--app']);

interface MutableFlags {
  json: boolean;
  offline: boolean;
  out?: string;
  checks?: readonly string[];
  app?: string;
}

/**
 * Parses `argv` (without the leading `node script`) into a `ParseResult`.
 * Never throws: every malformed input becomes a `{ error }` result.
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  if (argv.length === 0) {
    return { error: 'no command given; expected `scan [path]` or `eval`' };
  }

  const command = argv[0];
  if (command !== 'scan' && command !== 'eval') {
    return { error: `unknown command "${String(command)}"; expected \`scan\` or \`eval\`` };
  }

  const flags: MutableFlags = { json: false, offline: false };
  const positionals: string[] = [];

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    if (token === '--json') {
      flags.json = true;
      continue;
    }
    if (token === '--offline') {
      flags.offline = true;
      continue;
    }
    if (VALUE_FLAGS.has(token)) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { error: `flag ${token} requires a value` };
      }
      i += 1;
      if (token === '--out') flags.out = value;
      else if (token === '--app') flags.app = value;
      else {
        // --checks: comma-split, trim, drop empties.
        flags.checks = value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
      }
      continue;
    }
    if (token.startsWith('-')) {
      return { error: `unknown flag "${token}"` };
    }
    positionals.push(token);
  }

  if (command === 'eval') {
    if (positionals.length > 0) {
      return { error: `eval takes no positional arguments (got "${positionals[0]}")` };
    }
    return { command: 'eval', flags };
  }

  if (positionals.length > 1) {
    return { error: `scan takes at most one path (got ${positionals.length})` };
  }
  return { command: 'scan', path: positionals[0] ?? '.', flags };
}
