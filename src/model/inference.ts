/**
 * The pure Deterministic→Model (D→M) contract enforcer (§4.2).
 *
 * Given an already-resolved `InferenceResult` and the `InferenceRequest` that
 * produced it, this module turns a model answer into a §5 `Finding` — or into a
 * "no usable judgment" signal — WITHOUT any I/O, network, clock, or client.
 * It is the single place the §4.2 bounds are mechanically enforced, so they
 * hold no matter which client produced the result:
 *
 * - **Cite-or-discard (rule 2).** Every cited ref must match a surfaced excerpt
 *   (by `path` + `startLine`); refs that do not are discarded. If NO cited ref
 *   survives, there is no usable judgment — the caller emits `unknown`.
 * - **Confidence cap (rule 3 / §6.1).** Model confidence is hard-capped at 0.9
 *   and never becomes 1.0; a model result can never be classified `confirmed`.
 * - **Contradiction (rule 4).** When the model verdict disagrees with a
 *   supporting fact that establishes a verdict, the deterministic fact wins and
 *   the finding is `contradictory`; otherwise the finding is `inferred`.
 *   A contradictory finding's OUTCOME is forced to `fail`, whatever the model
 *   said — see {@link runInferenceContract}.
 *
 * The §6.1 blocker-downgrade (inferred blocker fail with confidence < 0.7 →
 * `requires_confirmation`) is NOT applied here — the detector emits `inferred`
 * with the capped confidence and the §7 decision engine reclassifies. This
 * module only EMITS.
 */
import { makeFinding } from '../checks/detectorKit.js';
import type { CheckOutcome, Evidence, Finding } from '../schema/index.js';
import type { InferenceRequest, InferenceResult, SupportingFact } from './client.js';

/** §4.2 rule 3 / §6.1: model-derived confidence is hard-capped at 0.9. */
export const MODEL_CONFIDENCE_CAP = 0.9;

/** How a check presents a resolved judgment as a §5 Finding. */
export interface InferencePresentation {
  /** 1-based sequence within the check for the finding id. */
  seq: number;
  /**
   * Maps the model verdict to the check's `CheckOutcome`.
   *
   * Consulted **only for non-contradictory judgments**. A `contradictory`
   * judgment always carries outcome `fail` (the deterministic fact won), so
   * this mapper is bypassed entirely in that case.
   */
  outcomeForVerdict: (verdict: 'fail' | 'pass') => CheckOutcome;
  /** Builds the one-sentence §5 summary for the resolved judgment. */
  summarize: (ctx: {
    verdict: 'fail' | 'pass';
    classification: 'inferred' | 'contradictory';
    rationale: string;
    contradictedFact?: SupportingFact;
  }) => string;
  /** Optional §5 external-verification marker (LG-006 carries none). */
  externalVerification?: Finding['externalVerification'];
}

export type InferenceContractResult =
  | { kind: 'no_usable_judgment'; reason: string }
  | {
      kind: 'finding';
      finding: Finding;
      classification: 'inferred' | 'contradictory';
      confidence: number;
      contradictedFact?: SupportingFact;
    };

/**
 * Maps the result's cited refs back to the FULL redacted excerpts they cite,
 * discarding any ref not present among the surfaced excerpts (cite-or-discard).
 * Deduplicated, order-preserving.
 */
export function resolveCitedEvidence(request: InferenceRequest, result: InferenceResult): Evidence[] {
  const cited: Evidence[] = [];
  for (const ref of result.citedEvidence) {
    const match = request.excerpts.find((e) => e.path === ref.path && e.startLine === ref.startLine);
    if (match !== undefined && !cited.includes(match)) cited.push(match);
  }
  return cited;
}

/** Caps a model confidence into [0, 0.9] (§4.2 rule 3 / §6.1); non-finite → 0. */
export function capConfidence(confidence: number): number {
  const raw = Number.isFinite(confidence) ? confidence : 0;
  return Math.max(0, Math.min(raw, MODEL_CONFIDENCE_CAP));
}

/**
 * Classifies the judgment: `contradictory` when any supporting fact establishes
 * a verdict the model disagreed with (the deterministic fact wins, §4.2 rule 4);
 * otherwise `inferred`.
 */
function classifyAgainstFacts(
  request: InferenceRequest,
  result: InferenceResult,
): { classification: 'inferred' | 'contradictory'; contradictedFact?: SupportingFact } {
  for (const fact of request.supportingFacts ?? []) {
    if (fact.establishesVerdict !== undefined && fact.establishesVerdict !== result.answer.verdict) {
      return { classification: 'contradictory', contradictedFact: fact };
    }
  }
  return { classification: 'inferred' };
}

/**
 * Runs the D→M contract over a resolved result and builds the §5 Finding via
 * `makeFinding` (severity from the registry). Returns `no_usable_judgment` when
 * the model cited nothing present in the surfaced excerpts.
 *
 * **A contradictory judgment always yields outcome `fail`.** §7 rule 5 routes
 * contradictory findings on blocker-capable checks to rule-4 treatment
 * (`requires_confirmation`, counted as a warning, listed under "needs your
 * confirmation"), and the engine selects them with
 * `outcome === 'fail' && classification === 'contradictory'`. A contradictory
 * *pass* carrying outcome `pass` therefore fired NO rule at all, and the human
 * report rendered it as a plain pass — on precisely the repositories where the
 * deterministic layer holds evidence to the contrary. Forcing the outcome is
 * what makes the disagreement visible to the §7 rules.
 *
 * This cannot manufacture a blocker: rule 2 requires `confirmed` and rule 3
 * requires `inferred`, so a `contradictory` fail can only ever reach rule 5.
 */
export function runInferenceContract(
  request: InferenceRequest,
  result: InferenceResult,
  presentation: InferencePresentation,
): InferenceContractResult {
  const evidence = resolveCitedEvidence(request, result);
  if (evidence.length === 0) {
    return {
      kind: 'no_usable_judgment',
      reason: 'the model cited no evidence present in the surfaced excerpts',
    };
  }

  const confidence = capConfidence(result.confidence);
  const { classification, contradictedFact } = classifyAgainstFacts(request, result);
  const verdict = result.answer.verdict;

  // The deterministic fact won, so the finding reports a failure regardless of
  // the model's verdict; `outcomeForVerdict` is bypassed, not overridden.
  const outcome: CheckOutcome = classification === 'contradictory' ? 'fail' : presentation.outcomeForVerdict(verdict);

  const finding = makeFinding({
    checkId: request.checkId,
    seq: presentation.seq,
    outcome,
    summary: presentation.summarize({ verdict, classification, rationale: result.answer.rationale, contradictedFact }),
    evidence,
    classification,
    confidence,
    externalVerification: presentation.externalVerification,
  });

  return { kind: 'finding', finding, classification, confidence, contradictedFact };
}
