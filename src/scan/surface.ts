/**
 * The shared Deterministic→Model **surfacing** contract (§4.2).
 *
 * Several D+M checks ask a question whose scope is the *repository*, while the
 * code that answers it usually lives outside the file the check located. A
 * webhook route that verifies a signature and immediately delegates
 * (`await handleStripeEvent(event)`) keeps its cancellation branch — and its
 * idempotency guard — in a lib module. Surfacing only the located handler asks
 * the model about code it was never shown, and on a blocker-capable check that
 * produces `not_ready` on a repository that is actually correct.
 *
 * This module owns the one answer to "which other files does the model get to
 * see, and how much of each?", so the answer cannot drift between consumers.
 *
 * ## Two predicates, deliberately not one
 *
 * `selects` chooses FILES and `anchor` chooses the LINE to window around. They
 * are separate parameters because they are genuinely different questions and a
 * caller may reasonably make selection stricter than anchoring. LG-006 does
 * exactly that: a file counts only if it names the `deleted` event *or* names
 * the `updated` event *together with* a canceled status (conjunctive), while
 * the window may anchor on either event name (disjunctive). Collapsing them
 * into a single regex silently widens file selection — a behaviour change that
 * neither the fixture corpus nor the serialized report can detect, because
 * `request.excerpts` and `request.supportingFacts` are never serialized.
 *
 * ## Why the extension gate is its own predicate
 *
 * `isModelSurfaceableFile` is `isCodeFile` plus `.mts`/`.cts`. It is NOT
 * `isCodeFile` itself, and widening `isCodeFile` would be wrong: `isCodeFile`
 * also gates `isWebhookHandler`, and the Next.js App Router resolves
 * `route.ts|tsx|js|jsx` only — `route.mts` is not a route, so the handler
 * locator's narrower set is correct as it stands. The prompt surface and the
 * route-resolution rule are different questions that happen to have overlapped.
 *
 * Pure and offline: no clock, no randomness, no I/O. The returned list follows
 * the collector's path-sorted order, so two scans of a tree are byte-identical
 * (AT-23).
 */
import { fileLines, isCodeFile } from './collect.js';
import type { CollectedFile, Fileset } from './collect.js';
import { buildEvidence } from './redact.js';
import type { Evidence } from '../schema/index.js';

/** Module-only source extensions that `isCodeFile` deliberately does not carry. */
const EXTRA_SURFACEABLE_EXT_RE = /\.(?:mts|cts)$/;

/**
 * Positively recognised **prose** extensions — text whose only power is to
 * describe. Used as an allowlist, never as a denylist: a file that is not on
 * this list is not assumed inert. A `.sql` migration or a `.prisma` schema can
 * enforce real behaviour (a unique constraint, a trigger), so it must never be
 * lumped in with documentation and asserted to be incapable of acting.
 */
const PROSE_EXT_RE = /\.(?:md|mdx|markdown|txt|rst)$/;

/**
 * True for a file the D→M surface is allowed to send to the model:
 * `isCodeFile` ∪ `{.mts, .cts}`.
 *
 * This is a **security** boundary as much as a classification. Everything
 * outside it — a scanned repository's `README.md`, `CLAUDE.md`, agent specs,
 * `.env` files — is never placed in a prompt. The SEC-5 envelope fences
 * untrusted text, but the correct bound is not to surface it at all.
 */
export function isModelSurfaceableFile(path: string): boolean {
  const lower = path.toLowerCase();
  return isCodeFile(lower) || EXTRA_SURFACEABLE_EXT_RE.test(lower);
}

/** True for a documentary text file (see {@link PROSE_EXT_RE}). */
export function isProseFile(path: string): boolean {
  return PROSE_EXT_RE.test(path.toLowerCase());
}

export interface DelegatedSurfaceOptions {
  /** Located handlers — excluded from the delegated set (already surfaced whole). */
  handlers: readonly CollectedFile[];
  /** FILE-selection predicate over raw content. May be stricter than `anchor`. */
  selects: (content: string) => boolean;
  /** LINE-level window anchor. Distinct from `selects` — see the module docs. */
  anchor: RegExp;
  /** Maximum number of delegated files surfaced. */
  cap: number;
  /** Lines of context kept before the anchor line. */
  windowBefore: number;
  /** Lines of context kept after the anchor line. */
  windowAfter: number;
  /** Note attached to every surfaced excerpt, explaining why it was included. */
  note: string;
  /** Short noun phrase for the signal, used in the elision note (e.g. `cancellation signal`). */
  signalLabel: string;
}

export interface DelegatedSurface {
  /** Windowed, redacted excerpts in the collector's path-sorted order. */
  excerpts: Evidence[];
  /** How many selected files the cap excluded. Callers MUST disclose this. */
  elided: number;
}

/**
 * Selects non-handler files carrying the caller's signal, caps them, and
 * windows each around its first anchor match.
 *
 * The elision count is returned rather than only noted, because the excerpt
 * `note` is **not transmitted** to the model: `buildUntrustedDataEnvelope`
 * sends each excerpt's `path:startLine-endLine (kind)` locator and its redacted
 * text and nothing else. The note is kept for humans inspecting the request;
 * the caller is responsible for putting the real disclosure somewhere the model
 * actually reads, which in practice means `InferenceRequest.question`.
 */
export function surfaceDelegatedCandidates(fileset: Fileset, opts: DelegatedSurfaceOptions): DelegatedSurface {
  const handlerPaths = new Set(opts.handlers.map((h) => h.path));
  const selected = fileset.files.filter(
    (f) => !handlerPaths.has(f.path) && isModelSurfaceableFile(f.path) && opts.selects(f.content),
  );
  const surfaced = selected.slice(0, opts.cap);
  const elided = selected.length - surfaced.length;

  const excerpts: Evidence[] = [];
  surfaced.forEach((file, i) => {
    const lines = fileLines(file);
    const matchIdx = lines.findIndex((l) => opts.anchor.test(l));
    const anchorIdx = matchIdx >= 0 ? matchIdx : 0;
    const start = Math.max(0, anchorIdx - opts.windowBefore);
    const end = Math.min(lines.length - 1, anchorIdx + opts.windowAfter);
    const isLast = i === surfaced.length - 1;
    const elisionNote =
      isLast && elided > 0
        ? ` ${elided} more code file(s) carrying a ${opts.signalLabel} were not surfaced (cap: ${opts.cap}).`
        : '';
    excerpts.push(
      buildEvidence({
        path: file.path,
        startLine: start + 1,
        endLine: end + 1,
        rawExcerpt: lines.slice(start, end + 1).join('\n'),
        kind: 'code',
        note: opts.note + elisionNote,
      }),
    );
  });

  return { excerpts, elided };
}

/**
 * Files carrying the signal that the surface is **not allowed** to send,
 * partitioned by whether they are recognised prose.
 *
 * `prose` can honestly be described as incapable of acting. `other` cannot —
 * it is where `.sql` migrations and `.prisma` schemas land — so a caller must
 * neither assert those files are inert nor pretend they were seen.
 */
export function partitionWithheldCarriers(
  fileset: Fileset,
  selects: (content: string) => boolean,
): { prose: CollectedFile[]; other: CollectedFile[] } {
  const prose: CollectedFile[] = [];
  const other: CollectedFile[] = [];
  for (const file of fileset.files) {
    if (isModelSurfaceableFile(file.path) || !selects(file.content)) continue;
    if (isProseFile(file.path)) prose.push(file);
    else other.push(file);
  }
  return { prose, other };
}
