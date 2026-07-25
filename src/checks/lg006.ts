/**
 * LG-006 — Missing cancellation handling (§3, Layer D+M, External = No).
 *
 * The question: in the Stripe webhook handlers, does the subscription-cancellation
 * path (`customer.subscription.deleted`, or `customer.subscription.updated` with
 * a canceled status) reach an entitlement downgrade / access removal? A missing
 * branch, or a branch that never downgrades, fails as a blocker.
 *
 * §3 makes this a **disjunction across two layers**, and the two disjuncts are
 * answered by different machinery:
 *
 * | Case | Layer | Outcome |
 * |---|---|---|
 * | No cancellation signal anywhere in the REPO | **D** — deterministic event-name detection | `fail`, `confirmed`, 1.0, blocker — stands under `--offline` |
 * | Cancellation handled somewhere, downgrade unproven | **M** — model-assisted path confirmation | model → `inferred` fail/pass (cap 0.9) or `contradictory`; `--offline`/unconfigured → `unknown` |
 * | No webhook handler at all | D | `not_applicable` (LG-003 owns the missing handler) |
 *
 * The first row is scoped to the REPOSITORY, not to the handler file. A route
 * that verifies the signature and delegates (`await handleStripeEvent(event)`)
 * keeps its cancellation branch in a lib module, and that is the dominant
 * Next.js/Stripe shape. Gating an unappealable `confirmed` blocker on
 * handler-file absence would fail correct repositories.
 *
 * §4.3 is what forces the first row: *"A check may not silently substitute
 * model judgment where the spec requires a deterministic signal."* A fully
 * missing branch is settled by reading event names — offering it to the model
 * is exactly the substitution §4.3 forbids, and it made a required blocker
 * evaporate under `--offline`.
 *
 * Two pure functions, split along the §4 layer boundary:
 *
 * - {@link surfaceLg006Candidates} — **Layer D.** Locates EVERY Stripe webhook
 *   handler via the shared locator (the SAME set LG-004 locates, but asking a
 *   different question — this never evaluates signature verification, so LG-004
 *   and LG-006 do not overlap), enumerates handled event names, deterministically
 *   detects whether a cancellation branch exists in any of them, and gathers the
 *   redacted handler excerpts + the bounded question + any deterministic
 *   supporting facts into an `InferenceRequest`. No webhook handler at all → a
 *   terminal `not_applicable` signal (LG-003 owns the *missing handler*; LG-006
 *   is non-external and attaches no external marker).
 *
 * - {@link interpretLg006} — assembles the §5 Finding. Branch absent → the
 *   Layer-D `fail` above, with no model result produced, needed or fabricated.
 *   Otherwise, no judgment (offline / model unconfigured) → outcome `unknown`
 *   with the reason "model layer disabled" (AT-27), no external marker; judgment
 *   present → the pure D→M contract (`inference.ts`) → `inferred` fail/pass (or
 *   `contradictory` on disagreement), confidence capped at 0.9, severity
 *   `blocker` from the registry. The detector NEVER downgrades a low-confidence
 *   inferred blocker to `requires_confirmation` — it emits `inferred` and lets
 *   the §7 engine (rule 4) reclassify.
 *
 * Layer M is EMIT-ONLY here: this file calls no model client and opens no
 * network. The async model call lives in the online scanner composition; this
 * detector only surfaces excerpts (Layer D) and interprets an already-resolved
 * judgment.
 */
import { fileLines, isCodeFile } from '../scan/collect.js';
import type { CollectedFile, Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence } from '../scan/redact.js';
import { locateWebhookHandlers } from '../scan/webhook.js';
import type { Evidence, Finding } from '../schema/index.js';
import type { InferenceRequest, InferenceResult, ResponseSchemaDescriptor, SupportingFact } from '../model/client.js';
import { runInferenceContract } from '../model/inference.js';
import type { InferencePresentation } from '../model/inference.js';
import { makeFinding } from './detectorKit.js';

const SUB_DELETED_RE = /customer\.subscription\.deleted/;
const SUB_UPDATED_RE = /customer\.subscription\.updated/;
const CANCELED_STATUS_RE = /canceled|cancelled|cancel_at_period_end|cancel_at\b/;
/** Dotted event-name string literals, e.g. `customer.subscription.deleted`. */
const EVENT_NAME_RE = /['"`]([a-z_]+(?:\.[a-z_]+)+)['"`]/g;

const RESPONSE_SCHEMA: ResponseSchemaDescriptor = {
  name: 'lg006.cancellation-downgrade-verdict',
  verdicts: ['fail', 'pass'],
  fields: {
    verdict:
      "'fail' when the cancellation path is missing or never reaches an entitlement downgrade / access removal; 'pass' when it does.",
    rationale: 'One sentence citing the surfaced handler lines that justify the verdict.',
  },
};

const QUESTION =
  'In the surfaced Stripe webhook handlers AND the surfaced delegated modules they hand events to, ' +
  'does the subscription-cancellation path ' +
  '(customer.subscription.deleted, or customer.subscription.updated with a canceled status) ' +
  'reach an entitlement downgrade or access removal? ' +
  'The handling need not be in the handler file itself — a handler that delegates to a module ' +
  'which performs the downgrade satisfies this.';

/**
 * How many non-handler code files carrying a cancellation signal are surfaced
 * alongside the handlers. Bounded so the prompt cannot grow with repo size; the
 * elision is always disclosed rather than silent (SEC-7's honesty principle).
 */
const MAX_DELEGATED_EXCERPTS = 5;

/**
 * Discloses a capped surface to the MODEL.
 *
 * This has to ride on the question, not on an excerpt `note`: the SEC-5
 * envelope (`buildUntrustedDataEnvelope`) transmits only each excerpt's
 * `path:startLine-endLine (kind)` locator and its redacted text — `note` never
 * reaches the model. A disclosure written into a note is visible to a human
 * reading the request object and to nobody else, which is precisely where
 * disclosure does not matter.
 *
 * The wording deliberately does NOT argue that many mentions imply the
 * repository handles cancellation. Five files can all be ordinary UI copy
 * carrying an analytics label while the real handler is the elided one, so the
 * honest statement is that the surface is incomplete and silence is not
 * evidence of absence.
 */
function elisionDisclosure(elided: number): string {
  if (elided <= 0) return '';
  return (
    ` NOTE ON COMPLETENESS: ${elided} further code file(s) in this repository also reference subscription ` +
    `cancellation but were NOT surfaced to you (at most ${MAX_DELEGATED_EXCERPTS} are included). ` +
    'The code performing the entitlement downgrade may be in one of them. ' +
    'Treat the surfaced set as incomplete: the absence of a downgrade in what you can see is not evidence that none exists.'
  );
}
/** Window around the first matching line in a delegated file. */
const WINDOW_BEFORE = 10;
const WINDOW_AFTER = 30;

/** How LG-006 presents a resolved model judgment as a §5 Finding. */
const LG006_PRESENTATION: InferencePresentation = {
  seq: 1,
  outcomeForVerdict: (verdict) => (verdict === 'fail' ? 'fail' : 'pass'),
  summarize: ({ verdict, classification, rationale, contradictedFact }) => {
    if (classification === 'contradictory') {
      return (
        'Model judgment on the subscription-cancellation path conflicts with a deterministic fact ' +
        `(${contradictedFact?.id ?? 'unknown'}); flagged contradictory for human review. Model rationale: ${rationale}`
      );
    }
    return verdict === 'fail'
      ? `The subscription-cancellation path does not reach an entitlement downgrade (model-inferred): ${rationale}`
      : `The subscription-cancellation path reaches an entitlement downgrade (model-inferred): ${rationale}`;
  },
  // LG-006 is non-external (§3) — no externalVerification marker.
};

export interface Lg006Applicable {
  applicable: true;
  /**
   * Every located webhook handler, in the shared locator's deterministic order.
   * LG-006 asks whether the REPOSITORY handles cancellation, so it must see all
   * of them: a repo that splits handling across files satisfies §3 if the branch
   * exists in any one of them.
   */
  handlerPaths: string[];
  /**
   * Deterministic: a customer.subscription.deleted / updated-canceled branch
   * exists in AT LEAST ONE located handler FILE. Drives what is offered to the
   * model layer (the focused branch excerpt and the fail-establishing
   * supporting fact) — NOT the deterministic blocker, which needs the wider
   * {@link hasCancellationSignalAnywhere}.
   */
  hasCancellationBranch: boolean;
  /**
   * Deterministic: a cancellation signal appears ANYWHERE in the repository,
   * not merely inside a handler file. This — not `hasCancellationBranch` — is
   * what gates the confirmed blocker, because the dominant idiom is a route
   * that verifies and delegates (`await handleStripeEvent(event)`) with the
   * switch living in a lib module. Gating on handler-file absence would emit
   * `fail`/`confirmed`/1.0 → `not_ready` on a repository that handles
   * cancellation correctly, and §7 gives Phase 1 no override mechanism.
   */
  hasCancellationSignalAnywhere: boolean;
  /**
   * Deterministic: a cancellation signal appears in at least one **code** file.
   * Gates the fail-establishing supporting fact — when every mention is prose
   * (README, agent spec, a SQL comment, a commented-out branch), the
   * deterministic layer has a real and defensible opinion that nothing
   * executable handles cancellation, and a model that answers `pass` is
   * genuinely contradicting it.
   */
  hasCodeCancellationSignal: boolean;
  /** Dotted event names handled across all located handlers, deduplicated and sorted. */
  handledEvents: string[];
  /** The bounded request for the model layer (excerpts already redacted). */
  request: InferenceRequest;
  /**
   * A light single-line anchor per located handler, in the same deterministic
   * order as `handlerPaths`. The first is the finding anchor.
   */
  anchors: Evidence[];
}
export interface Lg006NotApplicable {
  applicable: false;
}
export type Lg006Candidates = Lg006Applicable | Lg006NotApplicable;

/** Deduplicated, sorted dotted event names referenced in the handlers. */
function enumerateEvents(handlers: readonly CollectedFile[]): string[] {
  const events = new Set<string>();
  for (const handler of handlers) {
    for (const match of handler.content.matchAll(EVENT_NAME_RE)) {
      const name = match[1];
      if (name !== undefined) events.add(name);
    }
  }
  return [...events].sort();
}

/** Deterministic: does THIS file carry a subscription-cancellation signal? */
function mentionsCancellationBranch(content: string): boolean {
  const hasDeleted = SUB_DELETED_RE.test(content);
  const hasUpdatedCanceled = SUB_UPDATED_RE.test(content) && CANCELED_STATUS_RE.test(content);
  return hasDeleted || hasUpdatedCanceled;
}

/**
 * Layer D: locate EVERY webhook handler and gather the redacted candidate
 * bundle across all of them. Returns `not_applicable` when there is no webhook
 * handler at all.
 *
 * All-handlers (not first-match) is a correctness requirement, not tidiness:
 * §3 scopes LG-006 to whether the repository handles cancellation at all, so a
 * repo that splits handling across files satisfies it if the branch exists in
 * any handler. Stopping at the first match would let a blocker-capable check
 * report "absent" from a file that simply is not the one doing the work.
 */
export function surfaceLg006Candidates(fileset: Fileset): Lg006Candidates {
  const handlers = locateWebhookHandlers(fileset);
  if (handlers.length === 0) {
    return { applicable: false };
  }

  const hasCancellationBranch = handlers.some((h) => mentionsCancellationBranch(h.content));
  // Deliberately the WHOLE fileset, not just handlers and not just code files.
  // The blocker below is unappealable, so its gate is the widest signal we can
  // read: any file mentioning cancellation handling suppresses it. That
  // under-warns (a README naming the event is enough), which is the safe
  // direction; the alternative — resolving imports out of the handler — still
  // manufactures the same false blocker on path aliases, barrel re-exports and
  // multi-hop delegation, which are all ordinary Next.js shapes.
  const hasCancellationSignalAnywhere = fileset.files.some((f) => mentionsCancellationBranch(f.content));
  // Narrower: only executable code counts. Prose that merely NAMES the event
  // keeps the unappealable blocker off (above) but does not stop the
  // deterministic layer from telling the model that nothing in code handles it.
  const hasCodeCancellationSignal = fileset.files.some(
    (f) => isCodeFile(f.path) && mentionsCancellationBranch(f.content),
  );
  const handledEvents = enumerateEvents(handlers);

  // Per handler: the whole handler (context for the model), then — when that
  // handler itself branches on cancellation — a focused line at the branch, so
  // the model has a precise citation target distinct from the whole-handler
  // excerpt. Handler count is structurally tiny, so surfacing all of them
  // cannot grow unboundedly.
  const excerpts: Evidence[] = [];
  const anchors: Evidence[] = [];
  for (const handler of handlers) {
    const lines = fileLines(handler);
    excerpts.push(
      buildEvidence({
        path: handler.path,
        startLine: 1,
        endLine: lines.length,
        rawExcerpt: handler.content,
        kind: 'code',
        note: 'Stripe webhook handler surfaced for subscription-cancellation-path analysis (does cancellation reach an entitlement downgrade?).',
      }),
    );
    const branchIdx = lines.findIndex((l) => SUB_DELETED_RE.test(l) || SUB_UPDATED_RE.test(l));
    if (mentionsCancellationBranch(handler.content) && branchIdx > 0) {
      excerpts.push(
        buildEvidence({
          path: handler.path,
          startLine: branchIdx + 1,
          endLine: branchIdx + 1,
          rawExcerpt: lines[branchIdx] ?? '',
          kind: 'code',
          note: 'Subscription-cancellation event branch.',
        }),
      );
    }
    anchors.push(
      buildEvidence({
        path: handler.path,
        startLine: 1,
        endLine: 1,
        rawExcerpt: lines[0] ?? '',
        kind: 'code',
        note: 'Stripe webhook handler located for subscription-cancellation analysis.',
      }),
    );
  }

  // The question is scoped to the REPOSITORY's cancellation handling, so the
  // surface must follow the question rather than the handler file. A route that
  // verifies and delegates keeps its branch in a lib module; surfacing only the
  // handler asks the model about code it was never shown. Bounded, windowed,
  // path-sorted (the collector's order) and CODE-ONLY — see `isCodeFile`, which
  // is what keeps a scanned repo's README / agent specs out of the prompt.
  const handlerPathSet = new Set(handlers.map((h) => h.path));
  const delegated = fileset.files.filter(
    (f) => !handlerPathSet.has(f.path) && isCodeFile(f.path) && mentionsCancellationBranch(f.content),
  );
  const surfaced = delegated.slice(0, MAX_DELEGATED_EXCERPTS);
  const elided = delegated.length - surfaced.length;
  surfaced.forEach((file, i) => {
    const lines = fileLines(file);
    const matchIdx = lines.findIndex((l) => SUB_DELETED_RE.test(l) || SUB_UPDATED_RE.test(l));
    const anchorIdx = matchIdx >= 0 ? matchIdx : 0;
    const start = Math.max(0, anchorIdx - WINDOW_BEFORE);
    const end = Math.min(lines.length - 1, anchorIdx + WINDOW_AFTER);
    const isLast = i === surfaced.length - 1;
    const elisionNote =
      isLast && elided > 0
        ? ` ${elided} more code file(s) carrying a cancellation signal were not surfaced (cap: ${MAX_DELEGATED_EXCERPTS}).`
        : '';
    excerpts.push(
      buildEvidence({
        path: file.path,
        startLine: start + 1,
        endLine: end + 1,
        rawExcerpt: lines.slice(start, end + 1).join('\n'),
        kind: 'code',
        note:
          'Non-handler code file carrying a subscription-cancellation signal, surfaced because the webhook handler may delegate the downgrade to it.' +
          elisionNote,
      }),
    );
  });

  const supportingFacts: SupportingFact[] = [];
  if (!hasCodeCancellationSignal) {
    // Deliberately CODE-scoped, not handler-scoped. The retired
    // `fact:lg006.no-cancellation-branch` asserted a handler-file claim that was
    // simply false on the delegating idiom, so a model answering correctly was
    // marked contradictory against a wrong fact. This claim is true whenever it
    // is emitted: nothing executable in the repository handles cancellation.
    supportingFacts.push({
      id: 'fact:lg006.no-code-cancellation-signal',
      statement:
        'No code file in the repository references a customer.subscription.deleted (or updated-canceled) branch; any mentions found were in non-code files (documentation, comments or configuration), which cannot revoke access.',
      establishesVerdict: 'fail',
    });
  }

  const request: InferenceRequest = {
    checkId: 'LG-006',
    // The elision disclosure rides here because `question` is transmitted
    // verbatim while excerpt `note`s are not (see `elisionDisclosure`).
    question: QUESTION + elisionDisclosure(elided),
    excerpts,
    responseSchema: RESPONSE_SCHEMA,
    supportingFacts,
  };

  return {
    applicable: true,
    handlerPaths: handlers.map((h) => h.path),
    hasCancellationBranch,
    hasCancellationSignalAnywhere,
    hasCodeCancellationSignal,
    handledEvents,
    request,
    anchors,
  };
}

/**
 * True when the deterministic layer has already settled LG-006 and no model
 * judgment can change the answer — either no webhook handler exists
 * (`not_applicable`) or nothing in the repository handles cancellation
 * (the Layer-D `fail`).
 *
 * Callers on the online path use this to skip the model call entirely: §4.1
 * requires the deterministic layer to run first, and a settled check must not
 * spend a model round-trip, must not surface repository text to a third party,
 * and must not create the opportunity for a judgment to be applied where §4.3
 * forbids it. `interpretLg006` enforces the same rule independently, so a
 * caller that ignores this predicate still gets the correct finding.
 */
export function isLg006SettledDeterministically(candidates: Lg006Candidates): boolean {
  return !candidates.applicable || !candidates.hasCancellationSignalAnywhere;
}

/**
 * Assembles the LG-006 Finding from surfaced candidates and an optional resolved
 * judgment. The Layer-D disjunct is evaluated FIRST and a supplied judgment can
 * never override it. Otherwise: no judgment → `unknown` ("model layer disabled",
 * AT-27); judgment → the pure D→M contract.
 */
export function interpretLg006(candidates: Lg006Candidates, judgment?: InferenceResult): Finding[] {
  if (!candidates.applicable) {
    return [
      makeFinding({
        checkId: 'LG-006',
        seq: 1,
        outcome: 'not_applicable',
        summary: 'No Stripe webhook handler detected; the subscription-cancellation-handling check does not apply.',
        evidence: [],
      }),
    ];
  }

  // LAYER-D DISJUNCT, evaluated BEFORE any judgment is consulted (§4.1: "the
  // deterministic layer runs first, always"). No cancellation signal ANYWHERE
  // in the repository settles the check by itself: nothing can route a
  // cancellation to a downgrade, and reading event names proves it.
  //
  // The hoist above `judgment === undefined` is the point. Evaluating this only
  // when no judgment exists lets a model decide a question the deterministic
  // layer has already answered — precisely the substitution §4.3 forbids — and
  // it is what allowed a model `pass` to overturn a required blocker online
  // while the same repository scanned offline reported `fail`. Making the hoist
  // conditional on `judgment === undefined` would restore that defect while
  // leaving the suite green; it must stay unconditional.
  //
  // AT-27 is untouched: no model result is produced, needed, or fabricated in
  // this branch, so its anti-fabrication clause is satisfied a fortiori.
  //
  // The gate is repo-wide, NOT handler-file-scoped. A route that verifies and
  // delegates is the dominant idiom, and its cancellation branch lives in a
  // lib module; a handler-file gate would emit this confirmed/1.0 blocker on
  // a repository that is actually correct, which §7 leaves no way to appeal.
  if (!candidates.hasCancellationSignalAnywhere) {
    const evidence: Evidence[] = [];
    for (const anchor of candidates.anchors) {
      evidence.push(anchor);
      evidence.push(
        buildAbsenceEvidence({
          path: anchor.path,
          note:
            'Expected a customer.subscription.deleted (or customer.subscription.updated with a canceled status) ' +
            'branch reachable from this handler; no subscription-cancellation handling was found anywhere in the repository.',
        }),
      );
    }
    return [
      makeFinding({
        checkId: 'LG-006',
        seq: 1,
        outcome: 'fail',
        summary:
          'No file in the repository handles subscription cancellation ' +
          '(customer.subscription.deleted, or customer.subscription.updated with a canceled status), ' +
          'so a cancellation can never reach an entitlement downgrade — canceled customers keep their access.',
        evidence,
      }),
    ];
  }

  if (judgment === undefined) {
    // M-LAYER DISJUNCT, and the only one AT-27 binds: cancellation is handled
    // somewhere, but whether that path reaches a downgrade is unproven. Offline
    // / model unconfigured — the deterministic surface ran, but no model
    // judgment is available, so report unknown with the documented reason
    // (AT-27), no external marker. The `confirmed`/1.0 classification describes
    // the deterministic surface (a handler WAS located and the repository DOES
    // reference cancellation handling); the `unknown` OUTCOME is what carries
    // "we could not confirm that path reaches a downgrade".
    return [
      makeFinding({
        checkId: 'LG-006',
        seq: 1,
        outcome: 'unknown',
        summary:
          'Model layer disabled (offline or unconfigured); a Stripe webhook handler was surfaced deterministically and the repository does reference subscription-cancellation handling, but whether that path reaches an entitlement downgrade was not evaluated.',
        evidence: candidates.anchors.slice(0, 1),
      }),
    ];
  }

  const contract = runInferenceContract(candidates.request, judgment, LG006_PRESENTATION);
  if (contract.kind === 'no_usable_judgment') {
    return [
      makeFinding({
        checkId: 'LG-006',
        seq: 1,
        outcome: 'unknown',
        summary: `Model layer returned no usable cited evidence (${contract.reason}); the subscription-cancellation path is left unverified.`,
        evidence: [],
      }),
    ];
  }

  return [contract.finding];
}
