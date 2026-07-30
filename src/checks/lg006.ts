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
import { fileLines } from '../scan/collect.js';
import type { CollectedFile, Fileset } from '../scan/collect.js';
import { hasLocalRuntimeImport, topLevelDirectories } from '../scan/imports.js';
import { buildAbsenceEvidence, buildEvidence } from '../scan/redact.js';
import {
  elisionDisclosure,
  isModelSurfaceableFile,
  partitionWithheldCarriers,
  surfaceDelegatedCandidates,
  withheldNonSourceDisclosure,
} from '../scan/surface.js';
import { locateWebhookHandlers } from '../scan/webhook.js';
import type { Evidence, Finding } from '../schema/index.js';
import type { InferenceRequest, InferenceResult, ResponseSchemaDescriptor, SupportingFact } from '../model/client.js';
import { runInferenceContract } from '../model/inference.js';
import type { InferencePresentation } from '../model/inference.js';
import type { ModelCheck } from '../model/modelCheck.js';
import { makeFinding } from './detectorKit.js';

const SUB_DELETED_RE = /customer\.subscription\.deleted/;
const SUB_UPDATED_RE = /customer\.subscription\.updated/;
const CANCELED_STATUS_RE = /canceled|cancelled|cancel_at_period_end|cancel_at\b/;
/**
 * LINE-level window anchor — deliberately DISJUNCTIVE, unlike the conjunctive
 * file-selection predicate {@link mentionsCancellationBranch}. Once a file has
 * been selected, either event name is a good place to centre the window.
 */
const SUB_EVENT_ANCHOR_RE = /customer\.subscription\.(?:deleted|updated)/;
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

/** Window around the first anchor match in a delegated file. */
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
   * Paths of located handlers whose full raw content carries at least one
   * LOCAL RUNTIME import — the delegated-opacity guard's input (H-003, the
   * same class LG-005 guards since H-001), a subset of {@link handlerPaths}
   * in the same deterministic order. When non-empty, `interpretLg006`
   * demotes a model-asserted (`inferred`) `fail` to `unknown`: the handler
   * may delegate the downgrade to a local module that the conjunctive
   * cancellation-marker `selects` predicate excluded, so the model cannot
   * have been shown the code that performs the downgrade without naming a
   * cancellation event. See {@link hasLocalRuntimeImport} for the predicate
   * and the recall cost. The deterministic blocker and the offline branch
   * never consult this field.
   */
  handlersWithLocalRuntimeImports: string[];
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
   * Deterministic: a cancellation signal appears in at least one file the D→M
   * surface is allowed to show the model (`isModelSurfaceableFile`).
   *
   * Half of the fail-establishing fact's gate. The other half is a **prose
   * allowlist**: the fact may only be asserted when every mention the surface
   * could not show is positively recognised documentation. A `.sql` migration
   * or `.prisma` schema is withheld but is NOT inert, so it suppresses the
   * fact rather than supporting it.
   */
  hasSurfaceableCancellationSignal: boolean;
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
  // Narrower: only source the model can actually be shown counts.
  const hasSurfaceableCancellationSignal = fileset.files.some(
    (f) => isModelSurfaceableFile(f.path) && mentionsCancellationBranch(f.content),
  );
  // Everything carrying the signal that the prompt bound excludes, split by
  // whether it is recognised prose. This is an ALLOWLIST: a file is only
  // treated as incapable of acting if it is positively identified as
  // documentation. `.sql` / `.prisma` land in `other` and block the fact.
  const withheld = partitionWithheldCarriers(fileset, mentionsCancellationBranch);
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
  // handler asks the model about code it was never shown. `selects` is
  // deliberately the CONJUNCTIVE predicate while `anchor` is disjunctive — see
  // `src/scan/surface.ts`; collapsing them would widen file selection.
  const delegatedSurface = surfaceDelegatedCandidates(fileset, {
    handlers,
    selects: mentionsCancellationBranch,
    anchor: SUB_EVENT_ANCHOR_RE,
    cap: MAX_DELEGATED_EXCERPTS,
    windowBefore: WINDOW_BEFORE,
    windowAfter: WINDOW_AFTER,
    note: 'Non-handler code file carrying a subscription-cancellation signal, surfaced because the webhook handler may delegate the downgrade to it.',
    signalLabel: 'cancellation signal',
  });
  excerpts.push(...delegatedSurface.excerpts);
  const elided = delegatedSurface.elided;

  const supportingFacts: SupportingFact[] = [];
  if (!hasSurfaceableCancellationSignal && withheld.other.length === 0) {
    // PROSE ALLOWLIST, not a code denylist. The fact may only be asserted when
    // every mention the surface could not show is positively recognised prose —
    // documentation genuinely cannot revoke access. The previous code-denylist
    // form also fired for `.sql` migrations and `.prisma` schemas and told the
    // model they "cannot revoke access", which is false: a constraint or
    // trigger can. That biased the model toward agreeing with a wrong claim on
    // a correct repository, on a blocker-capable check.
    supportingFacts.push({
      id: 'fact:lg006.no-code-cancellation-signal',
      statement:
        'No source file in the repository references a customer.subscription.deleted (or updated-canceled) branch; the only mentions found were in non-code documentation files (Markdown or plain text), which cannot revoke access.',
      establishesVerdict: 'fail',
    });
  }

  const request: InferenceRequest = {
    checkId: 'LG-006',
    // Both disclosures ride here because `question` is transmitted verbatim
    // while excerpt `note`s are not (see `elisionDisclosure`).
    question:
      QUESTION +
      elisionDisclosure({
        elided,
        cap: MAX_DELEGATED_EXCERPTS,
        fileNoun: 'code file(s)',
        referencePhrase: 'reference subscription cancellation',
        mayBeThere: 'The code performing the entitlement downgrade may be in one of them.',
        absenceNoun: 'a downgrade',
      }) +
      withheldNonSourceDisclosure({
        count: withheld.other.length,
        referencePhrase: 'reference subscription cancellation',
        whyItMatters:
          'Such a file can enforce real behaviour — a database constraint or trigger can remove access —',
      }),
    excerpts,
    responseSchema: RESPONSE_SCHEMA,
    supportingFacts,
  };

  // Delegated-opacity guard input (H-003; the shared predicate lives in
  // `src/scan/imports.ts`), computed here because this is where the handlers'
  // full raw content lives — and computed AFTER the request is fully
  // assembled above, because it feeds interpretation only and must not move
  // a transmitted byte.
  const topLevelDirs = topLevelDirectories(fileset);
  const handlersWithLocalRuntimeImports = handlers
    .filter((h) => hasLocalRuntimeImport(h.content, topLevelDirs))
    .map((h) => h.path);

  return {
    applicable: true,
    handlerPaths: handlers.map((h) => h.path),
    handlersWithLocalRuntimeImports,
    hasCancellationBranch,
    hasCancellationSignalAnywhere,
    hasSurfaceableCancellationSignal,
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

  // The delegated-opacity guard (H-003 — the same class LG-005 guards since
  // H-001) — asymmetric by design, judgment branch only, `fail` only, and
  // ONLY for fails the model itself asserted (`classification ===
  // 'inferred'`). A handler carrying a local runtime import may delegate the
  // downgrade to a module that performs it WITHOUT naming any cancellation
  // event — exactly the file the conjunctive `selects` predicate excludes,
  // and with zero matches no elision disclosure transmits either — so a
  // `fail` judged over that surface cannot be trusted. A `pass` is
  // unaffected: an opaque surface cannot invent a downgrade.
  //
  // The `inferred` conjunct is load-bearing, not decoration. On the live
  // M-branch a prose-only-signal repository carries the fail-establishing
  // `fact:lg006.no-code-cancellation-signal`; a model `pass` then classifies
  // `contradictory` and `runInferenceContract` forces the outcome to `fail`
  // (engine rule 5's requires_confirmation path). That fail is the
  // deterministic fact winning, not a model assertion — the guard must not
  // touch it.
  //
  // Unreachable, provably, from: the deterministic no-signal-anywhere
  // blocker (hoisted above the judgment check and untouched — it remains the
  // check's offline teeth), the offline/AT-27 return (returns before any
  // contract exists), and settled repositories (whose request is withheld).
  //
  // RECALL COST, disclosed: LG-006's online M-branch inferred-fail is now
  // reachable only on handlers whose cancellation path is inline (no local
  // runtime imports) — per the shared predicate's own contract, a heuristic
  // may under-warn; it must never manufacture a false blocker.
  const opaque = candidates.handlersWithLocalRuntimeImports;
  if (contract.finding.outcome === 'fail' && contract.classification === 'inferred' && opaque.length > 0) {
    return [
      makeFinding({
        checkId: 'LG-006',
        seq: 1,
        outcome: 'unknown',
        summary:
          `The subscription-cancellation downgrade could not be judged from the surfaced code: ${opaque.length} of ` +
          `${candidates.handlerPaths.length} located handler(s) carry local runtime imports ` +
          `(${opaque.join(', ')}), so the downgrade path may live in a local module the cancellation-marker ` +
          'surface did not show the model. Reported unknown rather than failed, because a delegated module that ' +
          'performs the downgrade without naming a cancellation event is exactly what the surface excludes.',
        evidence: contract.finding.evidence,
      }),
    ];
  }

  return [contract.finding];
}

/**
 * LG-006 as a {@link ModelCheck}.
 *
 * `request` is withheld exactly when the deterministic layer has settled the
 * check — which for LG-006 means either no webhook handler exists, or nothing
 * in the repository handles cancellation at all (§4.3: that required
 * deterministic signal must not be routed through a model).
 *
 * The `applicable &&` conjunct is TYPE NARROWING, not logic:
 * `isLg006SettledDeterministically` already returns `true` for the
 * inapplicable case, so the conjunct cannot change the result. That redundancy
 * is pinned by a test rather than assumed.
 */
export const lg006ModelCheck: ModelCheck = {
  checkId: 'LG-006',
  surface(fileset) {
    const candidates = surfaceLg006Candidates(fileset);
    const settled = isLg006SettledDeterministically(candidates);
    return {
      request: candidates.applicable && !settled ? candidates.request : undefined,
      interpret: (judgment) => interpretLg006(candidates, judgment),
    };
  },
};
