import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { exitCodeForDecision, runEvaluation } from '../../src/eval/harness.js';
import { FakeModelClient } from '../../src/model/fakeClient.js';
import type { InferenceRequest, InferenceResult } from '../../src/model/client.js';
import { serializeReport } from '../../src/report/serialize.js';
import { createScanner, scanWithModel } from '../../src/scan/scanner.js';
import type { Finding, Report } from '../../src/schema/index.js';
import { validateReport } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const FIXED = (): Date => new Date('2026-07-23T00:00:00.000Z');

const NEXT_PKG = JSON.stringify({ name: 'app', private: true, dependencies: { next: '14.2.3' } });
const PROD_ENV = 'NEXT_PUBLIC_SITE_URL=https://app.example.com\n';

/** A verified handler with NO subscription-cancellation branch at all. */
const HANDLER_NO_CANCELLATION = `import Stripe from 'stripe';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
  return new Response('ok');
}
`;

/** A verified handler whose cancellation branch downgrades entitlement. */
const HANDLER_WITH_DOWNGRADE = `import Stripe from 'stripe';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  switch (event.type) {
    case 'customer.subscription.deleted':
      await db.orgs.update({ where: { id: event.data.object.customer }, data: { plan: 'free', entitlement: 'revoked' } });
      break;
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
  return new Response('ok');
}
`;

/** An otherwise-clean Next app whose webhook has NO cancellation branch. */
function brokenCancellationRepo(): string {
  return makeRepo({
    'package.json': NEXT_PKG,
    'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
    '.env.production': PROD_ENV,
  }).root;
}

/** An otherwise-clean Next app whose webhook HAS a cancellation branch. */
function correctCancellationRepo(): string {
  return makeRepo({
    'package.json': NEXT_PKG,
    'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE,
    '.env.production': PROD_ENV,
  }).root;
}

/** A verified handler that DELEGATES event handling out of the route file. */
const HANDLER_DELEGATING = `import Stripe from 'stripe';
import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`;

/** The delegated module, where the cancellation branch actually lives. */
const EVENTS_MODULE = `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'customer.subscription.deleted':
      await db.orgs.update({ where: { id: event.data.object.customer }, data: { plan: 'free' } });
      break;
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
}
`;

/**
 * A CORRECT Next app in the dominant idiom: the route verifies and delegates,
 * and the cancellation branch lives in a lib module rather than in the handler
 * file itself.
 */
function delegatingCancellationRepo(): string {
  return makeRepo({
    'package.json': NEXT_PKG,
    'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING,
    'lib/events.ts': EVENTS_MODULE,
    '.env.production': PROD_ENV,
  }).root;
}

/**
 * A repo whose ONLY cancellation mention is prose in a non-code file. No code
 * file handles cancellation, so `fact:lg006.no-code-cancellation-signal` is
 * live and true — but the mention is enough to keep the deterministic blocker
 * off, so the model is legitimately asked and can honestly disagree.
 */
function proseOnlySignalRepo(): string {
  return makeRepo({
    'package.json': NEXT_PKG,
    'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
    'README.md': '# Billing\n\nWe handle customer.subscription.deleted by revoking access.\n',
    '.env.production': PROD_ENV,
  }).root;
}

function lg005(report: Report): Finding | undefined {
  return report.findings.find((f) => f.checkId === 'LG-005');
}

function lg006(report: Report): Finding | undefined {
  return report.findings.find((f) => f.checkId === 'LG-006');
}

/**
 * TRAP 4: `FakeModelClient.infer` REJECTS an unscripted check id, so from the
 * moment LG-005 is wired into `scanWithModel` every construction in this file
 * must script it too — otherwise an LG-005 rejection destroys the scan and
 * surfaces as an LG-006 failure. One helper so a third model check cannot
 * reintroduce the same trap piecemeal.
 */
function scriptFor(verdict: 'fail' | 'pass', confidence: number): Record<string, (r: InferenceRequest) => InferenceResult> {
  const respond = (r: InferenceRequest): InferenceResult => ({
    answer: { verdict, rationale: 'test rationale' },
    confidence,
    citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
  });
  return { 'LG-006': respond, 'LG-005': respond };
}

/** A scripted judgment that cites the request's first surfaced excerpt. */
function judgment(verdict: 'fail' | 'pass', confidence: number) {
  const fake = new FakeModelClient(scriptFor(verdict, confidence));
  return fake;
}

describe('AT-27 — offline / model-unconfigured degradation', () => {
  // LG-006 is a D+M check, so AT-27 binds its M-LAYER portion: the path
  // confirmation. That portion is what degrades to `unknown`, and it is only
  // load-bearing when a cancellation branch EXISTS but its downgrade is
  // unproven. When the branch is absent entirely the outcome is settled by the
  // Layer-D disjunct and no model result is produced, needed, or fabricated.
  it('the sync scanner emits LG-006 unknown "model layer disabled" when the branch EXISTS but is unconfirmed', () => {
    const report = createScanner({ now: FIXED })(correctCancellationRepo());
    const finding = lg006(report);
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(finding?.externalVerification).toBeUndefined();
    // Unknown on a blocker-capable check holds the §7 ceiling, never not_ready.
    expect(report.decision.value).toBe('ready_with_warnings');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('the sync scanner emits a DETERMINISTIC confirmed blocker fail when the branch is absent (§4.3, AT-06)', () => {
    const report = createScanner({ now: FIXED })(brokenCancellationRepo());
    const finding = lg006(report);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    expect(finding?.severity).toBe('blocker');
    expect(finding?.evidence.length).toBeGreaterThan(0);
    expect(finding?.externalVerification).toBeUndefined();
    // A required deterministic signal stands under --offline; it is not
    // fabricated from a model result, it never asked for one.
    expect(report.decision.value).toBe('not_ready');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('NEVER manufactures a blocker on a correct repo that delegates handling out of the route file', () => {
    // The deterministic blocker is gated on repo-wide absence of the
    // cancellation signal, not on absence from the handler FILE. A heuristic
    // may under-warn; it must never produce a confirmed/1.0 not_ready — which
    // §7 gives no override mechanism — on a repository that is actually fine.
    const report = createScanner({ now: FIXED })(delegatingCancellationRepo());
    const finding = lg006(report);
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.outcome).toBe('unknown');
    expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail')).toEqual([]);
    expect(report.decision.value).toBe('ready_with_warnings');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('marks LG-006 unknown on broken-lg-004 because that fixture HAS a cancellation branch (it isolates LG-004)', () => {
    const report = createScanner({ now: FIXED })(join(fixturesRoot, 'broken-lg-004'));
    expect(lg006(report)?.outcome).toBe('unknown');
    expect(report.decision.value).toBe('not_ready'); // LG-004 confirmed blocker still drives it
    // The fixture seeds EXACTLY LG-004 — LG-006 must not add a second blocker.
    expect(report.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail').map((f) => f.checkId)).toEqual(
      ['LG-004'],
    );
  });

  it('marks LG-006 not_applicable on a repo with no webhook handler (clean-min)', () => {
    const report = createScanner({ now: FIXED })(join(fixturesRoot, 'clean-min'));
    expect(lg006(report)?.outcome).toBe('not_applicable');
  });

  it('two offline runs of the same commit produce byte-identical reports (AT-23 preserved)', () => {
    const dir = brokenCancellationRepo();
    const scan = createScanner({ now: FIXED });
    expect(serializeReport(scan(dir))).toBe(serializeReport(scan(dir)));
    for (const name of ['broken-lg-004', 'broken-lg-006']) {
      const fixture = join(fixturesRoot, name);
      expect(serializeReport(scan(fixture)), name).toBe(serializeReport(scan(fixture)));
    }
  });

  it('the model-less sync ScannerFn keeps the fixture eval green (11/11 decisions, 0 blocker FPs)', () => {
    const summary = runEvaluation(fixturesRoot, createScanner({ now: FIXED }));
    expect(summary.decisionsCorrect).toBe(summary.fixtureCount);
    expect(summary.allDecisionsCorrect).toBe(true);
    expect(summary.blockerFalsePositives).toBe(0);
  });
});

/**
 * AT-06's DETERMINISTIC half. The model-assisted half — a cancellation branch
 * that exists but never reaches a downgrade — is not provable by a fixture
 * under `--offline`; it stays proven by the FakeModelClient integration tests
 * below and in tests/checks/lg006.test.ts.
 */
describe('AT-06 — broken-lg-006 fixture, scanned offline', () => {
  const report = (): Report => createScanner({ now: FIXED })(join(fixturesRoot, 'broken-lg-006'));

  it('yields a confirmed blocker LG-006 fail citing the handler, and NO other blocker finding', () => {
    const r = report();
    const finding = lg006(r);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    expect(finding?.severity).toBe('blocker');
    expect(finding?.evidence.some((e) => e.path.includes('webhook/route.ts'))).toBe(true);
    // AT-26: the deterministic fail carries an absence entry (§5).
    expect(finding?.evidence.some((e) => e.kind === 'absence')).toBe(true);
    expect(finding?.externalVerification).toBeUndefined();
    // The AT-01…AT-15 clause: exactly one blocker, the seeded one.
    expect(r.findings.filter((f) => f.severity === 'blocker' && f.outcome === 'fail').map((f) => f.checkId)).toEqual([
      'LG-006',
    ]);
    expect(r.decision.value).toBe('not_ready');
    expect(validateReport(r).errors).toEqual([]);
  });

  it('keeps its distractors clean — LG-004 passes because the handler DOES verify the signature', () => {
    const lg004 = report().findings.find((f) => f.checkId === 'LG-004');
    expect(lg004?.outcome).toBe('pass');
  });

  it('scores correctly in the §9 harness with zero blocker false positives', () => {
    const summary = runEvaluation(fixturesRoot, createScanner({ now: FIXED }));
    const result = summary.results.find((r) => r.name === 'broken-lg-006');
    expect(result).toBeDefined();
    expect(result?.scanError).toBeNull();
    expect(result?.reportValid).toBe(true);
    expect(result?.missed).toEqual([]);
    expect(result?.spurious).toEqual([]);
    expect(result?.decisionCorrect).toBe(true);
    expect(result?.exitCodeCorrect).toBe(true);
    expect(result?.blockerFalsePositives).toBe(0);
    const metric = summary.perCheck.find((m) => m.checkId === 'LG-006');
    expect(metric?.truePositives).toBe(1);
    expect(metric?.recall).toBe(1);
    expect(metric?.falsePositives).toBe(0);
  });
});

describe('scanWithModel — fake-model integration (§4.2 online path)', () => {
  it('flows an inferred blocker FAIL from the model into the decision (not_ready)', async () => {
    // Re-based onto the delegating repo: a handler-only-no-branch repo is now
    // settled by the deterministic layer and never reaches the model. This is
    // still a genuine inferred-fail — the model WAS shown lib/events.ts and
    // judged that the branch does not reach a downgrade.
    const dir = delegatingCancellationRepo();
    const report = await scanWithModel(dir, judgment('fail', 0.85), { now: FIXED });
    const finding = lg006(report);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('inferred');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.confidence).toBe(0.85);
    // Inferred blocker fail at confidence >= 0.7 drives not_ready (§7 rule 3).
    expect(report.decision.value).toBe('not_ready');
    expect(report.decision.reasons.some((r) => r.includes('LG-006'))).toBe(true);
    expect(validateReport(report).errors).toEqual([]);
  });

  it('flows an inferred PASS from the model over a handler that has a cancellation branch', async () => {
    const dir = correctCancellationRepo();
    const report = await scanWithModel(dir, judgment('pass', 0.8), { now: FIXED });
    const finding = lg006(report);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('inferred');
    expect(report.decision.value).toBe('ready_with_warnings');
  });

  it('classifies contradictory when a model PASS conflicts with the deterministic no-branch fact (fact wins)', async () => {
    // Re-based onto a prose-only-signal repo: the ONLY cancellation mention is
    // in a README, so no CODE file handles it, the fail-establishing fact is
    // live and TRUE, and a model that says `pass` is genuinely contradicting
    // it. (A repo with no mention anywhere is settled deterministically and is
    // never offered to the model at all.)
    const dir = proseOnlySignalRepo();
    const report = await scanWithModel(dir, judgment('pass', 0.85), { now: FIXED });
    const finding = lg006(report);
    // The DECIDED report has rule 5 applied, because the contradictory
    // finding's outcome is now `fail` (C1). Before C1 the outcome was `pass`,
    // no rule fired, and the report rendered "LG-006: pass".
    expect(finding?.classification).toBe('requires_confirmation');
    expect(finding?.outcome).toBe('fail');
    expect(report.decision.reasons.some((r) => r.startsWith('Rule 5:'))).toBe(true);
    expect(report.counts.warnings).toBeGreaterThan(0);
    // Contradictory on a blocker-capable check is treated as rule 4/5, not not_ready.
    expect(report.decision.value).toBe('ready_with_warnings');
  });

  it('produces Layer-D findings byte-identical to the offline scan (only the model-assisted checks differ)', async () => {
    const dir = correctCancellationRepo();
    const offline = createScanner({ now: FIXED })(dir);
    const online = await scanWithModel(dir, judgment('pass', 0.8), { now: FIXED });
    // LG-005 is D+M like LG-006, so excluding it RESTORES this assertion's
    // original meaning ("the deterministic layer does not move online") rather
    // than weakening it.
    const MODEL_ASSISTED = ['LG-006', 'LG-005'];
    const layerD = (r: Report): Finding[] => r.findings.filter((f) => !MODEL_ASSISTED.includes(f.checkId));
    expect(layerD(online)).toEqual(layerD(offline));
  });

  it('reports remain schema-valid on both the fail and pass online paths (AT-25)', async () => {
    // DISCLOSED MEANING CHANGE: `brokenCancellationRepo()` now exercises the
    // DETERMINISTIC path (the model is never consulted), so this case proves
    // schema validity of the settled finding under `scanWithModel`. The
    // model-derived fail path is covered by the delegating case below.
    const fail = await scanWithModel(brokenCancellationRepo(), judgment('fail', 0.9), { now: FIXED });
    const pass = await scanWithModel(correctCancellationRepo(), judgment('pass', 0.6), { now: FIXED });
    expect(validateReport(fail).errors).toEqual([]);
    expect(validateReport(pass).errors).toEqual([]);
    const inferredFail = await scanWithModel(delegatingCancellationRepo(), judgment('fail', 0.9), { now: FIXED });
    expect(validateReport(inferredFail).errors).toEqual([]);
  });
});

describe('A-S1c — the deterministic layer settles first, in BOTH paths (§4.1/§4.3)', () => {
  /** A model that records calls, so "was it asked?" is directly observable. */
  function spyModel(verdict: 'fail' | 'pass', confidence: number): FakeModelClient {
    return new FakeModelClient(scriptFor(verdict, confidence));
  }

  it('T4/DC-3: a branch-absent repo is settled WITHOUT asking the model at all', async () => {
    const model = spyModel('pass', 0.9);
    const report = await scanWithModel(brokenCancellationRepo(), model, { now: FIXED });
    const finding = lg006(report);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    expect(finding?.severity).toBe('blocker');
    expect(report.decision.value).toBe('not_ready');
    // §4.1 "the deterministic layer runs first, always" — and when it settles
    // the question, no model result is produced, needed, or fabricated.
    expect(model.requests.filter((r) => r.checkId === 'LG-006')).toHaveLength(0);
    expect(validateReport(report).errors).toEqual([]);
  });

  it('T6: the branch-absent LG-006 finding is identical offline and online', async () => {
    const dir = brokenCancellationRepo();
    const offline = createScanner({ now: FIXED })(dir);
    const online = await scanWithModel(dir, spyModel('pass', 0.9), { now: FIXED });
    expect(lg006(online)).toEqual(lg006(offline));
    // This once asserted whole-report byte-identity. That held only because
    // LG-006 was the SOLE model-assisted check and was deterministically
    // settled here. LG-005 is never settled (§3 assigns it candidates, not a
    // verdict), so the two paths must diverge — and the divergence reaches
    // `report.counts`, which `decide()` computes, so it cannot be filtered out
    // from the caller's side.
    //
    // Pin the boundary instead of dropping the claim: the divergence is
    // confined to LG-005, and it is exactly the expected D→M difference. This
    // now FAILS if any other check ever starts differing across the two paths,
    // which is the property the byte-identity line was really protecting.
    const exceptLg005 = (r: Report): Finding[] => r.findings.filter((f) => f.checkId !== 'LG-005');
    expect(exceptLg005(online)).toEqual(exceptLg005(offline));
    expect(lg005(offline)?.outcome).toBe('unknown');
    expect(lg005(offline)?.classification).toBe('confirmed');
    expect(lg005(online)?.classification).toBe('inferred');
    expect(lg005(online)?.confidence).toBeLessThanOrEqual(0.9);
  });

  it('T3/DC-2: the delegating repo + model PASS yields pass/inferred → ready_with_warnings', async () => {
    const model = spyModel('pass', 0.8);
    const report = await scanWithModel(delegatingCancellationRepo(), model, { now: FIXED });
    const finding = lg006(report);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('inferred');
    expect(report.decision.value).toBe('ready_with_warnings');
    // The model WAS asked, and it was shown the delegated module.
    const lg006Requests = model.requests.filter((r) => r.checkId === 'LG-006');
    expect(lg006Requests).toHaveLength(1);
    expect(lg006Requests[0]?.excerpts.some((e) => e.path === 'lib/events.ts')).toBe(true);
  });

  it('T5/DC-4: a prose-only signal + model PASS is contradictory, fails, and fires Rule 5', async () => {
    const model = spyModel('pass', 0.85);
    const report = await scanWithModel(proseOnlySignalRepo(), model, { now: FIXED });
    const finding = lg006(report);
    expect(model.requests.filter((r) => r.checkId === 'LG-006')).toHaveLength(1);
    // Never rendered as "LG-006: pass".
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('requires_confirmation');
    expect(report.decision.reasons.some((r) => r.startsWith('Rule 5:'))).toBe(true);
    expect(report.counts.warnings).toBeGreaterThan(0);
    expect(report.counts.blockers).toBe(0);
    expect(report.decision.value).toBe('ready_with_warnings');
    // AT-26: cite-or-discard guarantees evidence — verified, not assumed.
    expect(finding?.evidence.length).toBeGreaterThan(0);
    expect(validateReport(report).errors).toEqual([]);
  });

  it('DC-6: the README naming the event is never surfaced to the model (SEC-5 blast radius)', async () => {
    const model = spyModel('pass', 0.85);
    await scanWithModel(proseOnlySignalRepo(), model, { now: FIXED });
    expect(model.requests[0]?.excerpts.every((e) => !e.path.endsWith('.md'))).toBe(true);
  });

  it('AT-23: two fixed-clock offline scans of the delegating repo are byte-identical', () => {
    const dir = delegatingCancellationRepo();
    const scan = createScanner({ now: FIXED });
    expect(serializeReport(scan(dir))).toBe(serializeReport(scan(dir)));
  });
});

describe('A-S2 — LG-005 wiring, --checks suppression and model-call discipline', () => {
  function spy(verdict: 'fail' | 'pass', confidence: number): FakeModelClient {
    return new FakeModelClient(scriptFor(verdict, confidence));
  }
  const idsOf = (m: FakeModelClient): string[] => m.requests.map((r) => r.checkId);

  it('DC-9: `--checks` excluding LG-005 makes ZERO LG-005 infer calls', async () => {
    // An excluded check's findings are filtered out of the decision anyway, so
    // calling the model for one would ship repository text off-process to
    // produce a finding that is then discarded.
    const model = spy('fail', 0.9);
    await scanWithModel(delegatingCancellationRepo(), model, { now: FIXED, checks: ['LG-006'] });
    expect(idsOf(model)).not.toContain('LG-005');
    expect(idsOf(model)).toContain('LG-006');
  });

  it('DC-9: `--checks` excluding LG-006 makes ZERO LG-006 infer calls', async () => {
    const model = spy('fail', 0.9);
    await scanWithModel(delegatingCancellationRepo(), model, { now: FIXED, checks: ['LG-005'] });
    expect(idsOf(model)).not.toContain('LG-006');
    expect(idsOf(model)).toContain('LG-005');
  });

  it('DC-9: `--checks` naming no model check at all makes ZERO infer calls', async () => {
    const model = spy('fail', 0.9);
    await scanWithModel(delegatingCancellationRepo(), model, { now: FIXED, checks: ['LG-001'] });
    expect(model.requests).toHaveLength(0);
  });

  it('DC-10/TRAP 6: model calls are SEQUENTIAL in a fixed order, and two runs are byte-identical', async () => {
    const a = spy('pass', 0.8);
    const b = spy('pass', 0.8);
    const dir = delegatingCancellationRepo();
    const first = await scanWithModel(dir, a, { now: FIXED });
    const second = await scanWithModel(dir, b, { now: FIXED });
    expect(serializeReport(first)).toBe(serializeReport(second));
    // A fixed check-id order — not `Promise.all`, whose rejection ordering is
    // nondeterministic and would put AT-23 at risk.
    expect(idsOf(a)).toEqual(idsOf(b));
    expect(idsOf(a)).toEqual(['LG-006', 'LG-005']);
  });

  it('flows an LG-005 inferred blocker FAIL into the decision (first pure-model blocker)', async () => {
    const report = await scanWithModel(delegatingCancellationRepo(), spy('fail', 0.85), { now: FIXED });
    const finding = lg005(report);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('inferred');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.externalVerification).toBeUndefined();
    expect(report.decision.value).toBe('not_ready');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('LG-005 offline is `unknown`, which holds the ceiling and is never a blocker', () => {
    const report = createScanner({ now: FIXED })(delegatingCancellationRepo());
    const finding = lg005(report);
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(report.counts.blockers).toBe(0);
    expect(report.decision.value).toBe('ready_with_warnings');
  });

  it('TRAP 5 (pinned, not fixed): a model-client error propagates and fails the whole scan', async () => {
    // With two model checks a single client error now destroys BOTH findings
    // and the report. Per-check degradation to `unknown` is the right product
    // behaviour but is deliberately out of scope here — pinning the current
    // semantics keeps it a known state rather than an accidental one.
    const onlyLg006 = new FakeModelClient({
      'LG-006': (r: InferenceRequest): InferenceResult => ({
        answer: { verdict: 'pass', rationale: 'r' },
        confidence: 0.8,
        citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
      }),
    });
    await expect(scanWithModel(delegatingCancellationRepo(), onlyLg006, { now: FIXED })).rejects.toThrow(/LG-005/);
  });

  it('DC-6: no non-source file reaches ANY model request, across both checks', async () => {
    const model = spy('pass', 0.8);
    const dir = makeRepo({
      'package.json': NEXT_PKG,
      'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING,
      'lib/events.ts': EVENTS_MODULE,
      'lib/idempotency.mts': 'export async function alreadyProcessed(id: string) { return db.processedEvents.has(id); }\n',
      'migrations/001.sql': 'CREATE UNIQUE INDEX ON processed_events (event_id);\n',
      'prisma/schema.prisma': 'model ProcessedEvent { id String @id }\n',
      'README.md': 'customer.subscription.deleted and event.id dedup\n',
      '.env.production': PROD_ENV,
    }).root;
    await scanWithModel(dir, model, { now: FIXED });
    const allowed = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts']);
    for (const req of model.requests) {
      for (const e of req.excerpts) {
        expect(allowed.has(e.path.split('.').pop() ?? ''), `${req.checkId}: ${e.path}`).toBe(true);
      }
    }
    // ...and the withheld non-source files are disclosed to LG-005, which is
    // the check for which a unique constraint is a canonical correct guard.
    const lg005Req = model.requests.find((r) => r.checkId === 'LG-005');
    expect(lg005Req?.question).toMatch(/non-source file/i);
  });
});

describe('AT-24 (amended DC-12) — the unsupported stack, asserted behaviourally not by hash', () => {
  const report = (): Report => createScanner({ now: FIXED })(join(fixturesRoot, 'unsupported'));

  it('grows by exactly ONE LG-005 not_applicable finding and nothing else', () => {
    const findings = report().findings;
    const lg005Findings = findings.filter((f) => f.checkId === 'LG-005');
    expect(lg005Findings).toHaveLength(1);
    expect(lg005Findings[0]?.outcome).toBe('not_applicable');
    // Severity comes from the registry via makeFinding, never hardcoded.
    expect(lg005Findings[0]?.severity).toBe('blocker');
    expect(lg005Findings[0]?.evidence).toEqual([]);
    expect(lg005Findings[0]?.externalVerification).toBeUndefined();
  });

  it('keeps AT-24 itself intact: not_evaluated, exit 3, Rule 1, counts unchanged, no fail/warning', () => {
    // The A-S1c-era hash for this fixture necessarily moves once a tenth check
    // emits a finding here. AT-24's real claim is behavioural, so it is
    // asserted directly — a stronger check than a digest that moves for benign
    // reasons.
    const r = report();
    expect(r.decision.value).toBe('not_evaluated');
    expect(exitCodeForDecision(r.decision.value)).toBe(3);
    expect(r.decision.reasons.some((x) => x.startsWith('Rule 1:'))).toBe(true);
    expect(r.decision.reasons.some((x) => x.includes('unsupported stack'))).toBe(true);
    expect(r.counts).toEqual({ blockers: 0, warnings: 0, unknowns: 1 });
    expect(r.findings.filter((f) => f.outcome === 'fail' || f.outcome === 'warning')).toEqual([]);
    expect(validateReport(r).errors).toEqual([]);
  });

  it('stays byte-identical across two fixed-clock scans (AT-23 on the unsupported path)', () => {
    const scan = createScanner({ now: FIXED });
    const dir = join(fixturesRoot, 'unsupported');
    expect(serializeReport(scan(dir))).toBe(serializeReport(scan(dir)));
  });
});
