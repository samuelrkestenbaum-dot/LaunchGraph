/**
 * LG-005 — Non-idempotent webhook processing (§3, Layer D+M, External = No).
 *
 * The question: if Stripe delivers the same event twice — which it does, by
 * design, on retry — does the handler path do the work twice? A handler that
 * grants entitlement, sends mail, or charges on every delivery without
 * persisting or looking up `event.id`, without an upsert or unique constraint
 * on processed events, and without any other dedup guard, fails as a blocker.
 *
 * ## Layer assignment: candidates, NOT a verdict
 *
 * §3 assigns LG-005 "deterministic **candidates**; model-assisted
 * **judgment**" — deliberately unlike LG-006, whose D layer is assigned
 * event-name *detection* and therefore owes a deterministic verdict, and unlike
 * LG-009, where absence of evidence fails the check. LG-005's deterministic
 * layer surfaces and stops. It attaches **no `establishesVerdict` fact** and
 * **no Layer-D blocker**, and that is not caution — it is the only defensible
 * reading, because the tempting deterministic rule is false:
 *
 *   "no `event.id` / upsert / dedup marker anywhere ⇒ non-idempotent"
 *
 * is falsified by the ordinary state-reconciliation handler, which is
 * idempotent *by construction*:
 *
 *   UPDATE subscriptions SET status = $1 WHERE stripe_sub_id = $2
 *
 * Replaying that statement changes nothing. It carries no `event.id`, no
 * upsert, and no dedup helper, so a repo-wide "no signal ⇒ confirmed blocker"
 * gate would emit an unappealable `not_ready` (§7 offers Phase 1 no override)
 * on a correct repository. A heuristic may under-warn; it must never
 * manufacture a false blocker.
 *
 * ## Consequence: this is the product's first PURE-MODEL blocker
 *
 * With no deterministic disjunct and no establishing fact, `not_ready` for
 * LG-005 can rest on nothing but a model judgment at confidence ≥ 0.7 (§7 rule
 * 3, which explicitly authorizes exactly that). The single structural defence
 * is therefore the SURFACE: the model must be shown the code that would change
 * its mind. That is why this detector surfaces the delegated modules and why it
 * discloses, in the transmitted question, both the files the cap elided and the
 * non-source files the SEC-5 bound withheld — a unique constraint in a `.sql`
 * migration is a *canonical* correct guard, and it is exactly what cannot be
 * shown.
 *
 * Layer M is EMIT-ONLY here: this file calls no model client and opens no
 * network. The async call lives in the online scanner composition.
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { hasLocalRuntimeImport, topLevelDirectories } from '../scan/imports.js';
import { buildEvidence } from '../scan/redact.js';
import {
  elisionDisclosure,
  partitionWithheldCarriers,
  surfaceDelegatedCandidates,
  withheldNonSourceDisclosure,
} from '../scan/surface.js';
import { locateWebhookHandlers } from '../scan/webhook.js';
import type { Evidence, Finding } from '../schema/index.js';
import type { InferenceRequest, InferenceResult, ResponseSchemaDescriptor } from '../model/client.js';
import { runInferenceContract } from '../model/inference.js';
import type { InferencePresentation } from '../model/inference.js';
import type { ModelCheck } from '../model/modelCheck.js';
import { makeFinding } from './detectorKit.js';

/**
 * Markers that are specifically about **webhook event deduplication**: keying
 * on the Stripe event id, or a named idempotency / processed-event mechanism.
 * A file carrying one of these is very likely the file that answers the
 * question.
 */
const WEBHOOK_DEDUP_RE =
  /\b(?:event|evt)\.id\b|idempoten|processed[_-]?events?|ProcessedEvent|webhook[_-]?events?|\bdedup|alreadyProcessed|hasProcessed/i;

/**
 * Markers of general write-persistence that *can* constitute a guard — a
 * unique constraint or a conflict-aware write — but are not about webhooks at
 * all. `upsert` in particular is the single most common Prisma idiom, so
 * ordinary CRUD routes match it in quantity.
 */
const GENERIC_PERSISTENCE_RE = /\bupsert\b|onConflict|ON\s+CONFLICT|DO\s+NOTHING|UNIQUE\s+INDEX|@@unique|@unique/i;

/**
 * Markers of an idempotency guard. Used to CHOOSE WHICH FILES the model is
 * shown — never to decide the outcome. Deliberately broad: a false positive
 * here only means the model sees one more file, whereas a miss means it judges
 * without the evidence that would exonerate the repository.
 *
 * Breadth alone is not enough, because the surface is capped. Selection is the
 * union of both bands, but the cap is filled from {@link WEBHOOK_DEDUP_RE}
 * first — see the `prefers` option in `src/scan/surface.ts`. Without that,
 * path order fills the cap with `app/**` CRUD routes matching `upsert` and
 * discards the `lib/**` guard, which is the exact shape of an ordinary correct
 * Next.js + Prisma application.
 */
const IDEMPOTENCY_SIGNAL_RE = new RegExp(`${WEBHOOK_DEDUP_RE.source}|${GENERIC_PERSISTENCE_RE.source}`, 'i');

/** How many non-handler source files carrying an idempotency signal are surfaced. */
const MAX_DELEGATED_EXCERPTS = 5;
const WINDOW_BEFORE = 10;
const WINDOW_AFTER = 30;

const RESPONSE_SCHEMA: ResponseSchemaDescriptor = {
  name: 'lg005.webhook-idempotency-verdict',
  verdicts: ['fail', 'pass'],
  fields: {
    verdict:
      "'fail' when a redelivered Stripe event would repeat its side effects (no event-id persistence or lookup, no unique constraint or upsert on processed events, and no other dedup guard); 'pass' when redelivery is safe.",
    rationale: 'One sentence citing the surfaced lines that justify the verdict.',
  },
};

const QUESTION =
  'Stripe redelivers the same webhook event on retry. In the surfaced Stripe webhook handlers AND the ' +
  'surfaced modules they delegate to, would processing the SAME event twice repeat its side effects ' +
  '(granting entitlement, sending mail, creating a charge or a record) — or is the handler path idempotent? ' +
  'A guard may take several forms: persisting and then looking up event.id, an upsert or unique constraint ' +
  'on processed events, a dedup helper, or a handler that is idempotent by construction because it only ' +
  'reconciles state (for example an UPDATE that sets a row to the event\'s value rather than incrementing it). ' +
  'The guard need not live in the handler file — a handler that delegates to a module performing the check satisfies this.';

/** How LG-005 presents a resolved model judgment as a §5 Finding. */
const LG005_PRESENTATION: InferencePresentation = {
  seq: 1,
  outcomeForVerdict: (verdict) => (verdict === 'fail' ? 'fail' : 'pass'),
  summarize: ({ verdict, classification, rationale, contradictedFact }) => {
    if (classification === 'contradictory') {
      return (
        'Model judgment on webhook idempotency conflicts with a deterministic fact ' +
        `(${contradictedFact?.id ?? 'unknown'}); flagged contradictory for human review. Model rationale: ${rationale}`
      );
    }
    return verdict === 'fail'
      ? `Redelivery of the same Stripe event would repeat the handler's side effects (model-inferred): ${rationale}`
      : `The webhook handler path is idempotent under redelivery (model-inferred): ${rationale}`;
  },
  // LG-005 is non-external (§3) — no externalVerification marker on any branch.
};

export interface Lg005Applicable {
  applicable: true;
  /** Every located webhook handler, in the shared locator's deterministic order. */
  handlerPaths: string[];
  /**
   * Paths of located handlers whose full raw content carries at least one
   * LOCAL RUNTIME import — the delegated-opacity guard's input (H-001), a
   * subset of {@link handlerPaths} in the same deterministic order. When
   * non-empty, `interpretLg005` demotes a model `fail` to `unknown`: the
   * handler may delegate its side-effect path to a local module that the
   * marker-based `selects` predicate excluded, so the model cannot have been
   * shown the code that distinguishes a safe delegate from one that repeats
   * side effects on every delivery. See {@link hasLocalRuntimeImport} for the
   * predicate and the recall cost.
   */
  handlersWithLocalRuntimeImports: string[];
  /** The bounded request for the model layer (excerpts already redacted). */
  request: InferenceRequest;
  /** A single-line anchor per located handler; the first is the finding anchor. */
  anchors: Evidence[];
}
export interface Lg005NotApplicable {
  applicable: false;
}
export type Lg005Candidates = Lg005Applicable | Lg005NotApplicable;

/**
 * Layer D: locate every webhook handler and gather the redacted candidate
 * bundle — the handlers whole, plus the bounded delegated surface. Returns
 * `not_applicable` when there is no webhook handler at all (a *missing* handler
 * is LG-003's concern).
 *
 * Note what this function does NOT do: it never decides anything, and it never
 * attaches a fact asserting a verdict. See the module docs.
 */
export function surfaceLg005Candidates(fileset: Fileset): Lg005Candidates {
  const handlers = locateWebhookHandlers(fileset);
  if (handlers.length === 0) {
    return { applicable: false };
  }

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
        note: 'Stripe webhook handler surfaced for idempotency analysis (would processing the same event twice repeat its side effects?).',
      }),
    );
    anchors.push(
      buildEvidence({
        path: handler.path,
        startLine: 1,
        endLine: 1,
        rawExcerpt: lines[0] ?? '',
        kind: 'code',
        note: 'Stripe webhook handler located for idempotency analysis.',
      }),
    );
  }

  // `selects` and `anchor` coincide for LG-005 — unlike LG-006, whose selection
  // is conjunctive — but they are passed as the two distinct parameters they
  // are, so that a later change to one cannot silently move the other.
  //
  // `prefers` is what keeps a binding cap from discarding the answering file.
  // Selection stays broad (a unique constraint IS a real guard), but the cap is
  // filled with webhook-dedup-specific matches before generic ORM ones.
  const delegated = surfaceDelegatedCandidates(fileset, {
    handlers,
    selects: (content) => IDEMPOTENCY_SIGNAL_RE.test(content),
    anchor: IDEMPOTENCY_SIGNAL_RE,
    prefers: [(content) => WEBHOOK_DEDUP_RE.test(content)],
    cap: MAX_DELEGATED_EXCERPTS,
    windowBefore: WINDOW_BEFORE,
    windowAfter: WINDOW_AFTER,
    note: 'Non-handler source file carrying an idempotency / event-id signal, surfaced because the webhook handler may delegate the dedup guard to it.',
    signalLabel: 'idempotency signal',
  });
  excerpts.push(...delegated.excerpts);

  const withheld = partitionWithheldCarriers(fileset, (content) => IDEMPOTENCY_SIGNAL_RE.test(content));

  const request: InferenceRequest = {
    checkId: 'LG-005',
    question:
      QUESTION +
      elisionDisclosure({
        elided: delegated.elided,
        cap: MAX_DELEGATED_EXCERPTS,
        fileNoun: 'source file(s)',
        referencePhrase: 'reference idempotency or event-id handling',
        mayBeThere: 'The guard may be in one of them.',
        absenceNoun: 'a guard',
      }) +
      withheldNonSourceDisclosure({
        count: withheld.other.length,
        referencePhrase: 'reference idempotency or event-id handling',
        whyItMatters:
          'A unique constraint declared in such a file is a standard and sufficient idempotency guard,',
      }),
    excerpts,
    responseSchema: RESPONSE_SCHEMA,
    // DELIBERATELY EMPTY. §3 assigns LG-005's deterministic layer candidates,
    // not a verdict, so there is no deterministic claim to put a thumb on the
    // scale with — and the only available claim would be false (see the module
    // docs on state reconciliation).
    supportingFacts: [],
  };

  // Delegated-opacity guard input (H-001; predicate shared via
  // `src/scan/imports.ts` since H-003), computed here because this is where
  // the handlers' full raw content lives.
  const topLevelDirs = topLevelDirectories(fileset);
  const handlersWithLocalRuntimeImports = handlers
    .filter((h) => hasLocalRuntimeImport(h.content, topLevelDirs))
    .map((h) => h.path);

  return {
    applicable: true,
    handlerPaths: handlers.map((h) => h.path),
    handlersWithLocalRuntimeImports,
    request,
    anchors,
  };
}

/**
 * Assembles the LG-005 Finding. No handler → `not_applicable`. No judgment
 * (offline / model unconfigured) → `unknown` with the documented reason
 * (AT-27). Judgment → the pure D→M contract: `inferred` fail/pass capped at
 * 0.9, severity `blocker` from the registry, never `confirmed`.
 *
 * There is deliberately no settled-deterministic branch here. LG-005 has no
 * settled state except `not_applicable`.
 */
export function interpretLg005(candidates: Lg005Candidates, judgment?: InferenceResult): Finding[] {
  if (!candidates.applicable) {
    return [
      makeFinding({
        checkId: 'LG-005',
        seq: 1,
        outcome: 'not_applicable',
        summary: 'No Stripe webhook handler detected; the webhook-idempotency check does not apply.',
        evidence: [],
      }),
    ];
  }

  if (judgment === undefined) {
    return [
      makeFinding({
        checkId: 'LG-005',
        seq: 1,
        outcome: 'unknown',
        summary:
          'Model layer disabled (offline or unconfigured); the Stripe webhook handler was surfaced deterministically but whether redelivery of the same event would repeat its side effects was not evaluated.',
        evidence: candidates.anchors.slice(0, 1),
      }),
    ];
  }

  const contract = runInferenceContract(candidates.request, judgment, LG005_PRESENTATION);
  if (contract.kind === 'no_usable_judgment') {
    return [
      makeFinding({
        checkId: 'LG-005',
        seq: 1,
        outcome: 'unknown',
        summary: `Model layer returned no usable cited evidence (${contract.reason}); webhook idempotency is left unverified.`,
        evidence: [],
      }),
    ];
  }

  // The delegated-opacity guard (H-001) — asymmetric by design, judgment
  // branch only, `fail` only. A handler carrying a local runtime import may
  // delegate its side-effect path to a module the marker-based surface never
  // showed the model (a helper idempotent by construction carries no marker
  // at all, and with zero matches no elision disclosure transmits either), so
  // a `fail` judged over that surface cannot be trusted. A `pass` is
  // unaffected: an opaque surface cannot invent a guard. The offline branch
  // above is untouched — this runs only when a judgment exists.
  const opaque = candidates.handlersWithLocalRuntimeImports;
  if (contract.finding.outcome === 'fail' && opaque.length > 0) {
    return [
      makeFinding({
        checkId: 'LG-005',
        seq: 1,
        outcome: 'unknown',
        summary:
          `Webhook idempotency could not be judged from the surfaced code: ${opaque.length} of ` +
          `${candidates.handlerPaths.length} located handler(s) carry local runtime imports ` +
          `(${opaque.join(', ')}), so the side-effect path may live in a local module the marker-based ` +
          'surface did not show the model. Reported unknown rather than failed, because a delegated helper ' +
          'that is idempotent by construction carries no dedup marker and is exactly what the surface excludes.',
        evidence: contract.finding.evidence,
      }),
    ];
  }

  return [contract.finding];
}

/**
 * LG-005 as a {@link ModelCheck}.
 *
 * LG-005's only settled state is `not_applicable` — §3 assigns its
 * deterministic layer candidates, not a verdict, so whenever a webhook handler
 * exists the model is asked. Expressing settledness as a withheld `request`
 * is what makes that difference from LG-006 a data difference rather than a
 * polarity a caller could get backwards.
 */
export const lg005ModelCheck: ModelCheck = {
  checkId: 'LG-005',
  surface(fileset) {
    const candidates = surfaceLg005Candidates(fileset);
    return {
      request: candidates.applicable ? candidates.request : undefined,
      interpret: (judgment) => interpretLg005(candidates, judgment),
    };
  },
};
