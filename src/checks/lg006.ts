/**
 * LG-006 — Missing cancellation handling (§3, Layer D+M, External = No).
 *
 * The question: in the Stripe webhook handler, does the subscription-cancellation
 * path (`customer.subscription.deleted`, or `customer.subscription.updated` with
 * a canceled status) reach an entitlement downgrade / access removal? A missing
 * branch, or a branch that never downgrades, fails as a blocker.
 *
 * Two pure functions, split along the §4 layer boundary:
 *
 * - {@link surfaceLg006Candidates} — **Layer D.** Locates the Stripe webhook
 *   handler (the SAME handler LG-004 locates, but asking a different question —
 *   this never evaluates signature verification, so LG-004 and LG-006 do not
 *   overlap), enumerates handled event names, deterministically detects whether
 *   a cancellation branch exists, and gathers the redacted handler excerpts +
 *   the bounded question + any deterministic supporting facts into an
 *   `InferenceRequest`. No webhook handler at all → a terminal `not_applicable`
 *   signal (LG-003 owns the *missing handler*; LG-006 is non-external and
 *   attaches no external marker).
 *
 * - {@link interpretLg006} — assembles the §5 Finding. No judgment
 *   (offline / model unconfigured) → outcome `unknown` with the reason
 *   "model layer disabled" (AT-27), no external marker. Judgment present → the
 *   pure D→M contract (`inference.ts`) → `inferred` fail/pass (or `contradictory`
 *   on disagreement), confidence capped at 0.9, severity `blocker` from the
 *   registry. The detector NEVER downgrades a low-confidence inferred blocker to
 *   `requires_confirmation` — it emits `inferred` and lets the §7 engine (rule 4)
 *   reclassify.
 *
 * Layer M is EMIT-ONLY here: this file calls no model client and opens no
 * network. The async model call lives in the online scanner composition; this
 * detector only surfaces excerpts (Layer D) and interprets an already-resolved
 * judgment.
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { buildEvidence } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import type { InferenceRequest, InferenceResult, ResponseSchemaDescriptor, SupportingFact } from '../model/client.js';
import { runInferenceContract } from '../model/inference.js';
import type { InferencePresentation } from '../model/inference.js';
import { makeFinding } from './detectorKit.js';

const CODE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Mirrors `lg004`'s `isWebhookHandler` (frozen; not exported) — the SAME
 * handler-locate predicate (app/api webhook `route.ts` files plus `pages/api`
 * handlers), intentionally identical so LG-006 asks its different question of
 * the same handler. Duplicated rather than imported because lg004 is frozen and
 * does not export the predicate.
 */
function isWebhookHandler(path: string): boolean {
  const lower = path.toLowerCase();
  if (!CODE_EXT_RE.test(lower)) return false;
  if (!lower.includes('webhook')) return false;
  return lower.includes('/api/') || lower.startsWith('api/') || lower.includes('route.') || lower.includes('pages/api');
}

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
  'In the surfaced Stripe webhook handler, does the subscription-cancellation path ' +
  '(customer.subscription.deleted, or customer.subscription.updated with a canceled status) ' +
  'reach an entitlement downgrade or access removal?';

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
  handlerPath: string;
  /** Deterministic: a customer.subscription.deleted / updated-canceled branch exists. */
  hasCancellationBranch: boolean;
  /** Dotted event names handled by the webhook, sorted. */
  handledEvents: string[];
  /** The bounded request for the model layer (excerpts already redacted). */
  request: InferenceRequest;
  /** A light single-line handler anchor for the offline `unknown` finding. */
  anchor: Evidence;
}
export interface Lg006NotApplicable {
  applicable: false;
}
export type Lg006Candidates = Lg006Applicable | Lg006NotApplicable;

/** Deduplicated, sorted dotted event names referenced in the handler. */
function enumerateEvents(content: string): string[] {
  const events = new Set<string>();
  for (const match of content.matchAll(EVENT_NAME_RE)) {
    const name = match[1];
    if (name !== undefined) events.add(name);
  }
  return [...events].sort();
}

/**
 * Layer D: locate the webhook handler and gather the redacted candidate bundle.
 * Returns `not_applicable` when there is no webhook handler at all.
 */
export function surfaceLg006Candidates(fileset: Fileset): Lg006Candidates {
  const handler = fileset.files.find((f) => isWebhookHandler(f.path));
  if (handler === undefined) {
    return { applicable: false };
  }

  const lines = fileLines(handler);
  const content = handler.content;
  const hasDeleted = SUB_DELETED_RE.test(content);
  const hasUpdatedCanceled = SUB_UPDATED_RE.test(content) && CANCELED_STATUS_RE.test(content);
  const hasCancellationBranch = hasDeleted || hasUpdatedCanceled;
  const handledEvents = enumerateEvents(content);

  // Excerpt 0: the whole handler (context for the model). Excerpt 1 (optional):
  // a focused line at the cancellation branch, so the model has a precise
  // citation target distinct from the whole-handler excerpt.
  const excerpts: Evidence[] = [
    buildEvidence({
      path: handler.path,
      startLine: 1,
      endLine: lines.length,
      rawExcerpt: content,
      kind: 'code',
      note: 'Stripe webhook handler surfaced for subscription-cancellation-path analysis (does cancellation reach an entitlement downgrade?).',
    }),
  ];
  const branchIdx = lines.findIndex((l) => SUB_DELETED_RE.test(l) || SUB_UPDATED_RE.test(l));
  if (hasCancellationBranch && branchIdx > 0) {
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

  const supportingFacts: SupportingFact[] = [];
  if (!hasCancellationBranch) {
    supportingFacts.push({
      id: 'fact:lg006.no-cancellation-branch',
      statement:
        'The webhook handler has no customer.subscription.deleted (or updated-canceled) branch, so no cancellation path can reach an entitlement downgrade.',
      establishesVerdict: 'fail',
    });
  }

  const request: InferenceRequest = {
    checkId: 'LG-006',
    question: QUESTION,
    excerpts,
    responseSchema: RESPONSE_SCHEMA,
    supportingFacts,
  };

  const anchor = buildEvidence({
    path: handler.path,
    startLine: 1,
    endLine: 1,
    rawExcerpt: lines[0] ?? '',
    kind: 'code',
    note: 'Stripe webhook handler located for subscription-cancellation analysis.',
  });

  return { applicable: true, handlerPath: handler.path, hasCancellationBranch, handledEvents, request, anchor };
}

/**
 * Assembles the LG-006 Finding from surfaced candidates and an optional resolved
 * judgment. No judgment → `unknown` ("model layer disabled", AT-27). Judgment →
 * the pure D→M contract.
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

  if (judgment === undefined) {
    // Offline / model unconfigured: the deterministic surface ran, but no model
    // judgment is available — report unknown with the documented reason (AT-27),
    // no external marker. The `confirmed`/1.0 classification describes the
    // deterministic surface (a handler WAS located); the `unknown` OUTCOME is
    // what carries "we could not evaluate the cancellation path".
    return [
      makeFinding({
        checkId: 'LG-006',
        seq: 1,
        outcome: 'unknown',
        summary:
          'Model layer disabled (offline or unconfigured); the Stripe webhook handler was surfaced deterministically but its subscription-cancellation path was not evaluated for an entitlement downgrade.',
        evidence: [candidates.anchor],
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
