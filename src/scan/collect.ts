/**
 * SEC-6 filesystem containment traversal + SEC-7 honest degradation.
 *
 * `collect` walks a repository directory and returns a deterministic,
 * lexicographically-sorted `Fileset` of readable text files, plus a
 * `degradations` list recording every place coverage was reduced by a
 * security limit (SEC-7 — silent truncation is a defect).
 *
 * Guarantees:
 * - **SEC-6 containment.** Symlinks are `lstat`-detected and never followed;
 *   any symlink whose `realpath` escapes the repo root is rejected and
 *   recorded (`symlink_escape`). Binary files are skipped. A per-file byte
 *   cap (2 MB) and per-repo file-count cap (50k) are enforced, plus an
 *   overall traversal-entry budget acting as the timeout analogue.
 * - **Read-only.** Nothing is written, and no repository code is ever
 *   executed — this is pure static reading (SEC-1).
 * - **Deterministic.** Directory entries are visited in sorted order and the
 *   returned arrays are sorted; the result depends only on the directory
 *   contents (no clock, no randomness). This is what lets detectors and the
 *   §9 harness produce byte-identical reports (AT-23).
 *
 * Limits are injectable so tests can exercise the caps without writing
 * multi-megabyte files or 50k entries; production defaults are the SEC-6
 * values.
 */
import { type Dirent, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** SEC-6 per-file byte cap: 2 MB. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** SEC-6 per-repo file-count cap: 50k files. */
export const MAX_FILES = 50_000;
/**
 * Overall traversal budget: the maximum number of filesystem entries the
 * walk will visit before stopping. Acts as the deterministic analogue of the
 * SEC-6 scan timeout (a hostile tree cannot make the walk unbounded).
 */
export const TRAVERSAL_BUDGET = 200_000;

/**
 * Directories excluded from the walk as a deliberate scope decision (not a
 * security truncation): VCS internals and vendored dependencies are never
 * repository signal. Their exclusion is intentional and therefore not
 * recorded as a SEC-7 degradation.
 */
const IGNORED_DIRS: ReadonlySet<string> = new Set(['.git', 'node_modules']);

/** A readable text file collected from the repository. */
export interface CollectedFile {
  /** Repo-relative POSIX path (forward slashes), e.g. `app/api/webhook/route.ts`. */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Full UTF-8 file contents. */
  content: string;
  /** Byte size on disk. */
  size: number;
}

/** Why a path was skipped or truncated (SEC-7). */
export type DegradationReason =
  | 'binary' // non-text file skipped
  | 'too_large' // exceeded MAX_FILE_BYTES
  | 'symlink_escape' // symlink resolving outside the repo root (SEC-6)
  | 'file_cap_exceeded' // hit MAX_FILES
  | 'traversal_budget_exceeded' // hit TRAVERSAL_BUDGET
  | 'unreadable'; // stat/read failure

export interface Degradation {
  /** Repo-relative POSIX path of the skipped entry. */
  path: string;
  reason: DegradationReason;
  /** Human-readable explanation for the scan output (SEC-7). */
  note: string;
}

export interface Fileset {
  /** Canonical absolute realpath of the scanned root. */
  root: string;
  /** Collected text files, sorted by `path`. */
  files: CollectedFile[];
  /** Coverage reductions, sorted by `(path, reason)` (SEC-7). */
  degradations: Degradation[];
  /** True when any degradation reduced coverage. */
  truncated: boolean;
}

export interface CollectOptions {
  maxFileBytes?: number;
  maxFiles?: number;
  traversalBudget?: number;
}

/** Locale-independent code-unit string comparison. */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Repo-relative POSIX path for an absolute path under `root`. */
function toRepoRelative(root: string, absPath: string): string {
  const rel = relative(root, absPath);
  return sep === '/' ? rel : rel.split(sep).join('/');
}

/**
 * Heuristic binary detection: a NUL byte in the first 8 KB marks the file as
 * binary (the classic git heuristic). Detectors only reason about text, and
 * skipping binaries keeps untrusted blobs out of the pipeline (SEC-6).
 */
function looksBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8192);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

interface WalkState {
  root: string;
  maxFileBytes: number;
  maxFiles: number;
  traversalBudget: number;
  files: CollectedFile[];
  degradations: Degradation[];
  visited: number;
  stopped: boolean;
  fileCapRecorded: boolean;
}

function record(state: WalkState, path: string, reason: DegradationReason, note: string): void {
  state.degradations.push({ path, reason, note });
}

function walk(state: WalkState, dir: string): void {
  if (state.stopped) return;

  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    record(state, toRepoRelative(state.root, dir), 'unreadable', 'Directory could not be read; skipped.');
    return;
  }

  // Deterministic order: sort entries by name before descending.
  const sorted = [...entries].sort((a, b) => compareStrings(a.name, b.name));

  for (const entry of sorted) {
    if (state.stopped) return;

    state.visited += 1;
    if (state.visited > state.traversalBudget) {
      record(
        state,
        toRepoRelative(state.root, dir),
        'traversal_budget_exceeded',
        `Traversal budget of ${state.traversalBudget} entries exceeded; remaining files were not scanned.`,
      );
      state.stopped = true;
      return;
    }

    const abs = join(dir, entry.name);
    const rel = toRepoRelative(state.root, abs);

    if (entry.isSymbolicLink()) {
      // SEC-6: never follow symlinks. Reject any that resolve outside root.
      let realTarget: string | null = null;
      try {
        realTarget = realpathSync(abs);
      } catch {
        realTarget = null;
      }
      if (realTarget === null) {
        record(state, rel, 'unreadable', 'Symlink target could not be resolved; not followed.');
        continue;
      }
      const contained = realTarget === state.root || realTarget.startsWith(state.root + sep);
      if (!contained) {
        record(
          state,
          rel,
          'symlink_escape',
          'Symlink resolves outside the repository root; rejected and not followed (SEC-6).',
        );
      }
      // Contained symlinks are not followed either (the real entry, if under
      // root, is visited directly), so nothing more to do.
      continue;
    }

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(state, abs);
      continue;
    }

    if (!entry.isFile()) continue; // sockets, FIFOs, devices — ignored.

    if (state.files.length >= state.maxFiles) {
      if (!state.fileCapRecorded) {
        record(
          state,
          rel,
          'file_cap_exceeded',
          `Per-repository file cap of ${state.maxFiles} reached; remaining files were not scanned.`,
        );
        state.fileCapRecorded = true;
      }
      state.stopped = true;
      return;
    }

    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      record(state, rel, 'unreadable', 'File could not be stat-ed; skipped.');
      continue;
    }
    if (size > state.maxFileBytes) {
      record(
        state,
        rel,
        'too_large',
        `File size ${size} bytes exceeds the ${state.maxFileBytes}-byte per-file cap; skipped.`,
      );
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = readFileSync(abs);
    } catch {
      record(state, rel, 'unreadable', 'File could not be read; skipped.');
      continue;
    }
    if (looksBinary(buffer)) {
      record(state, rel, 'binary', 'Binary (non-text) file skipped; only text sources are scanned.');
      continue;
    }

    state.files.push({ path: rel, absPath: abs, content: buffer.toString('utf8'), size });
  }
}

/**
 * Walks `rootDir` under SEC-6 containment and returns a deterministic
 * `Fileset`. Never writes, never executes, never follows a symlink out of
 * root. The result is a pure function of the directory contents.
 */
export function collect(rootDir: string, options: CollectOptions = {}): Fileset {
  const root = realpathSync(rootDir);
  const state: WalkState = {
    root,
    maxFileBytes: options.maxFileBytes ?? MAX_FILE_BYTES,
    maxFiles: options.maxFiles ?? MAX_FILES,
    traversalBudget: options.traversalBudget ?? TRAVERSAL_BUDGET,
    files: [],
    degradations: [],
    visited: 0,
    stopped: false,
    fileCapRecorded: false,
  };

  walk(state, root);

  state.files.sort((a, b) => compareStrings(a.path, b.path));
  state.degradations.sort((a, b) => compareStrings(a.path, b.path) || compareStrings(a.reason, b.reason));

  return {
    root,
    files: state.files,
    degradations: state.degradations,
    truncated: state.degradations.length > 0,
  };
}

/** Convenience: split a collected file's content into 1-based lines. */
export function fileLines(file: CollectedFile): string[] {
  return file.content.split('\n');
}

/** Source-code file extensions this scanner reasons about. */
const CODE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * True for a source-code file (by extension, case-insensitively).
 *
 * The shared predicate for the sites that currently consume it —
 * `scan/webhook.ts` and `checks/lg006.ts`. It is **not yet** the single source
 * of truth for the whole scanner: `checks/lg003.ts`, `checks/lg010.ts` and
 * `checks/lg015.ts` still carry their own private `CODE_EXT_RE` copies.
 * **Widening this regex (e.g. to add `.mts`) therefore does NOT widen those
 * three checks** — they must be updated in the same change, or they will
 * silently keep the narrower definition. Consolidating them is tracked as
 * follow-up work.
 *
 * This is also a **security** boundary, not just a classification: detectors
 * that surface repository text into a model prompt use it to guarantee that
 * prose files — a scanned repo's `README.md`, `CLAUDE.md`, agent specs — are
 * never fed to the model. The SEC-5 envelope fences untrusted text, but the
 * correct bound is not to surface it at all.
 */
export function isCodeFile(path: string): boolean {
  return CODE_EXT_RE.test(path.toLowerCase());
}
