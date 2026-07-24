/**
 * The injected I/O boundary for the CLI.
 *
 * `run()` (src/cli/run.ts) is a pure, synchronous function that performs every
 * side effect through an `Io` it is handed — writing to stdout/stderr, reading
 * the clock, reading the working directory, and writing output files. Tests
 * pass a fake `Io` that captures those effects, so the whole CLI is exercised
 * programmatically without a subprocess, a build, or a real clock (determinism,
 * AT-23).
 *
 * The scanned repository is read directly by `collect` (SEC-6 containment lives
 * there); the ONLY write surface is `Io.writeFile`, which is exactly what tests
 * capture to prove SEC-6 output confinement. `Io` exposes no way to read host
 * credentials or the environment (SEC-3) — the clock and cwd are the only host
 * inputs, and neither carries secrets.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Io {
  /** Writes a string to standard output verbatim (no added newline). */
  stdout(s: string): void;
  /** Writes a string to standard error verbatim (no added newline). */
  stderr(s: string): void;
  /** Returns the current time; injected so tests can fix the clock. */
  now(): Date;
  /** Returns the working directory used to resolve relative paths. */
  cwd(): string;
  /** Writes `data` to `absPath`, creating parent directories as needed. */
  writeFile(absPath: string, data: string): void;
}

/** The production `Io`, wired to the real process, clock, and filesystem. */
export const realIo: Io = {
  stdout(s: string): void {
    process.stdout.write(s);
  },
  stderr(s: string): void {
    process.stderr.write(s);
  },
  now(): Date {
    return new Date();
  },
  cwd(): string {
    return process.cwd();
  },
  writeFile(absPath: string, data: string): void {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, data);
  },
};
