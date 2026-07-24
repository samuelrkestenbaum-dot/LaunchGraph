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
  it('the sync scanner emits LG-006 unknown "model layer disabled" when a webhook handler exists', () => {
    const report = createScanner({ now: FIXED })(brokenCancellationRepo());
    const finding = lg006(report);
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(finding?.externalVerification).toBeUndefined();
    // Unknown on a blocker-capable check holds the §7 ceiling, never not_ready.
    expect(report.decision.value).toBe('ready_with_warnings');
    expect(validateReport(report).errors).toEqual([]);
  });

  it('marks LG-006 unknown on broken-lg-004 (webhook present) without changing its not_ready decision', () => {
    const report = createScanner({ now: FIXED })(join(fixturesRoot, 'broken-lg-004'));
    expect(lg006(report)?.outcome).toBe('unknown');
    expect(report.decision.value).toBe('not_ready'); // LG-004 confirmed blocker still drives it
  });

  it('marks LG-006 not_applicable on a repo with no webhook handler (clean-min)', () => {
    const report = createScanner({ now: FIXED })(join(fixturesRoot, 'clean-min'));
    expect(lg006(report)?.outcome).toBe('not_applicable');
  });

  it('two offline runs of the same commit produce byte-identical reports (AT-23 preserved)', () => {
    const dir = brokenCancellationRepo();
    const scan = createScanner({ now: FIXED });
    expect(serializeReport(scan(dir))).toBe(serializeReport(scan(dir)));
    const fixture = join(fixturesRoot, 'broken-lg-004');
    expect(serializeReport(scan(fixture))).toBe(serializeReport(scan(fixture)));
  });

  it('the model-less sync ScannerFn keeps the fixture eval green (10/10 decisions, 0 blocker FPs)', () => {
    const summary = runEvaluation(fixturesRoot, createScanner({ now: FIXED }));
    expect(summary.decisionsCorrect).toBe(summary.fixtureCount);
    expect(summary.allDecisionsCorrect).toBe(true);
    expect(summary.blockerFalsePositives).toBe(0);
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
