import { describe, expect, it } from 'vitest';

import type { InferenceRequest, InferenceResult } from '../../src/model/client.js';
import {
  MODEL_CONFIDENCE_CAP,
  capConfidence,
  resolveCitedEvidence,
  runInferenceContract,
} from '../../src/model/inference.js';
import type { InferencePresentation } from '../../src/model/inference.js';
import type { Evidence } from '../../src/schema/index.js';

const EXC_A: Evidence = { path: 'h.ts', startLine: 5, endLine: 5, excerpt: 'a', kind: 'code' };
const EXC_B: Evidence = { path: 'h.ts', startLine: 10, endLine: 12, excerpt: 'b', kind: 'code' };

function req(overrides: Partial<InferenceRequest> = {}): InferenceRequest {
  return {
    checkId: 'LG-006',
    question: 'q',
    excerpts: [EXC_A, EXC_B],
    responseSchema: { name: 's', verdicts: ['fail', 'pass'], fields: {} },
    supportingFacts: [],
    ...overrides,
  };
}

function res(overrides: Partial<InferenceResult> = {}): InferenceResult {
  return {
    answer: { verdict: 'fail', rationale: 'r' },
    confidence: 0.8,
    citedEvidence: [{ path: 'h.ts', startLine: 5 }],
    ...overrides,
  };
}

/** A trivial presentation; LG-006 severity/title still come from the registry. */
const PRES: InferencePresentation = {
  seq: 1,
  outcomeForVerdict: (v) => (v === 'fail' ? 'fail' : 'pass'),
  summarize: ({ verdict, classification }) => `${classification}:${verdict}`,
};

describe('inference D→M contract — cite-or-discard (§4.2 rule 2)', () => {
  it('resolves only cited refs present in the surfaced excerpts, discarding the rest', () => {
    const cited = resolveCitedEvidence(
      req(),
      res({
        citedEvidence: [
          { path: 'h.ts', startLine: 5 }, // present → kept
          { path: 'h.ts', startLine: 999 }, // absent line → discarded
          { path: 'other.ts', startLine: 5 }, // absent file → discarded
        ],
      }),
    );
    expect(cited).toEqual([EXC_A]);
  });

  it('is no_usable_judgment when NO cited ref matches a surfaced excerpt', () => {
    const out = runInferenceContract(req(), res({ citedEvidence: [{ path: 'h.ts', startLine: 999 }] }), PRES);
    expect(out.kind).toBe('no_usable_judgment');
  });
});

describe('inference D→M contract — confidence cap (§4.2 rule 3 / §6.1)', () => {
  it('capConfidence hard-caps at 0.9 and floors non-finite/negative to [0, 0.9]', () => {
    expect(capConfidence(0.99)).toBe(MODEL_CONFIDENCE_CAP);
    expect(capConfidence(1)).toBe(0.9);
    expect(capConfidence(-1)).toBe(0);
    expect(capConfidence(Number.NaN)).toBe(0);
    expect(capConfidence(0.42)).toBe(0.42);
  });

  it('never emits confidence > 0.9 and never emits confidence 1.0 / confirmed for a model result', () => {
    const out = runInferenceContract(req(), res({ confidence: 0.99 }), PRES);
    expect(out.kind).toBe('finding');
    if (out.kind === 'finding') {
      expect(out.finding.confidence).toBeLessThanOrEqual(0.9);
      expect(out.finding.confidence).toBe(0.9);
      expect(out.finding.confidence).not.toBe(1);
      expect(out.finding.classification).not.toBe('confirmed');
    }
  });
});

describe('inference D→M contract — classification', () => {
  it('classifies inferred with a valid cited claim, drawing severity from the registry (blocker)', () => {
    const out = runInferenceContract(req(), res(), PRES);
    expect(out.kind).toBe('finding');
    if (out.kind === 'finding') {
      expect(out.finding.classification).toBe('inferred');
      expect(out.finding.outcome).toBe('fail');
      expect(out.finding.severity).toBe('blocker'); // LG-006 ceiling from registry
      expect(out.finding.confidence).toBe(0.8);
      expect(out.finding.evidence).toEqual([EXC_A]);
    }
  });

  it('classifies contradictory when the model verdict conflicts with a supporting fact (fact wins)', () => {
    const out = runInferenceContract(
      req({ supportingFacts: [{ id: 'fact:x', statement: '…', establishesVerdict: 'fail' }] }),
      res({ answer: { verdict: 'pass', rationale: 'r' }, citedEvidence: [{ path: 'h.ts', startLine: 5 }] }),
      PRES,
    );
    expect(out.kind).toBe('finding');
    if (out.kind === 'finding') {
      expect(out.finding.classification).toBe('contradictory');
      // C1: the outcome is forced to `fail` even though the model said `pass`.
      // §7 rule 5 filters on `outcome === 'fail' && classification ===
      // 'contradictory'`, so a contradictory PASS would otherwise fire no rule
      // at all and render as "LG-006: pass" on a repo the deterministic layer
      // says is broken.
      expect(out.finding.outcome).toBe('fail');
      expect(out.finding.confidence).toBeLessThanOrEqual(0.9);
      expect(out.contradictedFact?.id).toBe('fact:x');
    }
  });

  it('does NOT consult outcomeForVerdict for a contradictory judgment', () => {
    const consulted: Array<'fail' | 'pass'> = [];
    const spyPres: InferencePresentation = {
      ...PRES,
      outcomeForVerdict: (v) => {
        consulted.push(v);
        return v === 'fail' ? 'fail' : 'pass';
      },
    };
    const out = runInferenceContract(
      req({ supportingFacts: [{ id: 'fact:x', statement: '…', establishesVerdict: 'fail' }] }),
      res({ answer: { verdict: 'pass', rationale: 'r' }, citedEvidence: [{ path: 'h.ts', startLine: 5 }] }),
      spyPres,
    );
    expect(consulted).toEqual([]);
    expect(out.kind).toBe('finding');
    if (out.kind === 'finding') expect(out.finding.outcome).toBe('fail');
  });

  it('still consults outcomeForVerdict for a NON-contradictory judgment', () => {
    const consulted: Array<'fail' | 'pass'> = [];
    const spyPres: InferencePresentation = {
      ...PRES,
      outcomeForVerdict: (v) => {
        consulted.push(v);
        return v === 'fail' ? 'fail' : 'pass';
      },
    };
    const out = runInferenceContract(
      req(),
      res({ answer: { verdict: 'pass', rationale: 'r' } }),
      spyPres,
    );
    expect(consulted).toEqual(['pass']);
    expect(out.kind).toBe('finding');
    if (out.kind === 'finding') {
      expect(out.finding.classification).toBe('inferred');
      expect(out.finding.outcome).toBe('pass');
    }
  });

  it('stays inferred (no downgrade) at a low confidence — the §7 engine reclassifies, not the contract', () => {
    const out = runInferenceContract(req(), res({ confidence: 0.5 }), PRES);
    expect(out.kind).toBe('finding');
    if (out.kind === 'finding') {
      expect(out.finding.classification).toBe('inferred');
      expect(out.finding.classification).not.toBe('requires_confirmation');
      expect(out.finding.confidence).toBe(0.5);
    }
  });
});
