import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { runEvaluation } from '../../src/eval/harness.js';
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

function lg006(report: Report): Finding | undefined {
  return report.findings.find((f) => f.checkId === 'LG-006');
}

/** A scripted judgment that cites the request's first surfaced excerpt. */
function judgment(verdict: 'fail' | 'pass', confidence: number) {
  const fake = new FakeModelClient({
    'LG-006': (r: InferenceRequest): InferenceResult => ({
      answer: { verdict, rationale: 'test rationale' },
      confidence,
      citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
    }),
  });
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
    const dir = brokenCancellationRepo();
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
    const dir = brokenCancellationRepo(); // no cancellation branch → fail-establishing fact
    const report = await scanWithModel(dir, judgment('pass', 0.85), { now: FIXED });
    const finding = lg006(report);
    expect(finding?.classification).toBe('contradictory');
    // Contradictory on a blocker-capable check is treated as rule 4/5, not not_ready.
    expect(report.decision.value).toBe('ready_with_warnings');
  });

  it('produces Layer-D findings byte-identical to the offline scan (only LG-006 differs)', async () => {
    const dir = correctCancellationRepo();
    const offline = createScanner({ now: FIXED })(dir);
    const online = await scanWithModel(dir, judgment('pass', 0.8), { now: FIXED });
    const layerD = (r: Report): Finding[] => r.findings.filter((f) => f.checkId !== 'LG-006');
    expect(layerD(online)).toEqual(layerD(offline));
  });

  it('reports remain schema-valid on both the fail and pass online paths (AT-25)', async () => {
    const fail = await scanWithModel(brokenCancellationRepo(), judgment('fail', 0.9), { now: FIXED });
    const pass = await scanWithModel(correctCancellationRepo(), judgment('pass', 0.6), { now: FIXED });
    expect(validateReport(fail).errors).toEqual([]);
    expect(validateReport(pass).errors).toEqual([]);
  });
});
