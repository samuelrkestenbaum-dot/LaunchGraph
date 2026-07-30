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
  /**
   * Optional ranking. Selected files matching `prefers` fill the cap FIRST;
   * the rest follow. Path order is preserved *within* each band, so the result
   * stays a pure function of the tree (AT-23).
   *
   * This exists because a path-ordered cap is a **biased** sampler, not a
   * random one. Repository layout puts `app/**` before `lib/**`, and guards
   * live in `lib/**` — so when the cap binds it discards precisely the file
   * that would exonerate the repository. On a blocker-capable model-assisted
   * check that is not a sampling inefficiency, it is a false-blocker
   * generator: the model is handed a surface from which the only available
   * conclusion is the wrong one.
   *
   * Omitting `prefers` leaves selection and ordering exactly as they were, so
   * a caller that does not rank is unaffected.
   *
   * **Ordered bands.** Each predicate is a band, tried in order: band 0 fills
   * the cap first, then band 1, and so on, with everything unmatched last. A
   * file belongs to the FIRST band it matches, so bands need not be disjoint.
   * The one-band case is byte-identical to the previous single-predicate form
   * by construction — one band produces exactly `[matches, non-matches]`.
   */
  prefers?: readonly ((content: string) => boolean)[];
}

export interface DelegatedSurface {
  /** Windowed, redacted excerpts in the collector's path-sorted order. */
  excerpts: Evidence[];
  /** How many selected files the cap excluded. Callers MUST disclose this. */
  elided: number;
  /**
   * How many files the cap excluded, per band, indexed as `prefers` — with one
   * extra trailing entry for files matching no band. Always
   * `prefers.length + 1` long (or length 1 when `prefers` is omitted), and it
   * always sums to {@link elided}.
   *
   * A caller can use this to tell *what kind* of evidence went missing. That
   * matters when the elided band is the one that would have exonerated the
   * repository: losing generic matches is noise, losing the specific band means
   * the surface can no longer support a confident negative verdict.
   */
  elidedByBand: readonly number[];
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
  // Rank before capping, so a binding cap drops the least-relevant files rather
  // than the ones latest in path order. Implemented as successive `filter`
  // passes over the remainder — which preserves the collector's path order
  // within every band, and makes the one-band case literally the same two
  // concatenated filters as before rather than a sort whose stability would
  // have to be argued.
  const bands = opts.prefers ?? [];
  const bandOf = new Map<CollectedFile, number>();
  const ranked: CollectedFile[] = [];
  let rest = selected;
  bands.forEach((matches, band) => {
    const hit = rest.filter((f) => matches(f.content));
    for (const f of hit) bandOf.set(f, band);
    ranked.push(...hit);
    rest = rest.filter((f) => !matches(f.content));
  });
  for (const f of rest) bandOf.set(f, bands.length);
  ranked.push(...rest);

  const surfaced = ranked.slice(0, opts.cap);
  const elided = ranked.length - surfaced.length;
  const elidedByBand = new Array<number>(bands.length + 1).fill(0);
  for (const f of ranked.slice(opts.cap)) {
    const band = bandOf.get(f) ?? bands.length;
    elidedByBand[band] = (elidedByBand[band] ?? 0) + 1;
  }

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

  return { excerpts, elided, elidedByBand };
}

export interface ElisionDisclosureParams {
  /** How many selected files the cap excluded. Zero yields the empty string. */
  elided: number;
  /** The cap that did the excluding. */
  cap: number;
  /** Plural noun for the excluded files, e.g. `code file(s)` / `source file(s)`. */
  fileNoun: string;
  /** Verb phrase, e.g. `reference subscription cancellation`. */
  referencePhrase: string;
  /** One sentence naming what might be in them, e.g. `The guard may be in one of them.` */
  mayBeThere: string;
  /** Noun for what is absent, e.g. `a downgrade` / `a guard`. */
  absenceNoun: string;
}

/**
 * Discloses cap-elided source files **to the model**.
 *
 * This has to ride on `InferenceRequest.question`, not on an excerpt `note`:
 * `buildUntrustedDataEnvelope` transmits only each excerpt's
 * `path:startLine-endLine (kind)` locator and its redacted text, so a
 * note-borne disclosure is visible to a human inspecting the request object and
 * to nobody else — precisely where disclosure does not matter.
 *
 * The wording argues completeness in NEITHER direction. It must never suggest
 * that many matches imply the repository does the right thing: a capped band
 * can be entirely ordinary UI copy or CRUD while the file that answers the
 * question is the one that was dropped.
 */
export function elisionDisclosure(p: ElisionDisclosureParams): string {
  if (p.elided <= 0) return '';
  return (
    ` NOTE ON COMPLETENESS: ${p.elided} further ${p.fileNoun} in this repository also ${p.referencePhrase} ` +
    `but were NOT surfaced to you (at most ${p.cap} are included). ${p.mayBeThere} ` +
    `Treat the surfaced set as incomplete: the absence of ${p.absenceNoun} in what you can see is not evidence that none exists.`
  );
}

export interface WithheldNonSourceParams {
  /** How many non-source carriers were withheld. Zero yields the empty string. */
  count: number;
  /** Verb phrase, matching {@link ElisionDisclosureParams.referencePhrase}. */
  referencePhrase: string;
  /** Clause explaining why such a file could matter, ending WITHOUT trailing punctuation-space. */
  whyItMatters: string;
}

/**
 * Discloses files withheld because they are not source code — chiefly `.sql`
 * migrations and `.prisma` schemas, which the SEC-5 prompt bound excludes.
 *
 * These are exactly the files a "nothing in this repository does X" claim would
 * be wrong about: a unique constraint or a trigger genuinely can act. Since the
 * surface cannot show them and the deterministic layer cannot honestly discount
 * them, the only truthful move is to say they exist and that their contents are
 * unknown.
 */
export function withheldNonSourceDisclosure(p: WithheldNonSourceParams): string {
  if (p.count <= 0) return '';
  return (
    ` NOTE ON COMPLETENESS: ${p.count} non-source file(s) in this repository (for example database migrations ` +
    `or schema definitions) also ${p.referencePhrase} but were NOT surfaced to you, because only source code ` +
    `is sent to the model. ${p.whyItMatters} so treat their contents as unknown rather than as absent.`
  );
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
