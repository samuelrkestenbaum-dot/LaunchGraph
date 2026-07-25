import { afterAll, describe, expect, it } from 'vitest';

import { getCheck } from '../../src/checks/registry.js';
import { interpretLg006, surfaceLg006Candidates } from '../../src/checks/lg006.js';
import type { Lg006Applicable } from '../../src/checks/lg006.js';
import { FakeModelClient } from '../../src/model/fakeClient.js';
import type { InferenceRequest, InferenceResult } from '../../src/model/client.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

/** A handler whose cancellation branch downgrades entitlement. */
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

/** A handler with NO cancellation branch at all. */
const HANDLER_NO_CANCELLATION = `import Stripe from 'stripe';
export async function POST(req: Request) {
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
  return new Response('ok');
}
`;

/** Build a scripted judgment that cites the request's first surfaced excerpt. */
function judgment(verdict: 'fail' | 'pass', confidence: number) {
  return (r: InferenceRequest): InferenceResult => ({
    answer: { verdict, rationale: 'test rationale' },
    confidence,
    citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
  });
}

async function judge(candidates: Lg006Applicable, verdict: 'fail' | 'pass', confidence: number): Promise<InferenceResult> {
  const fake = new FakeModelClient({ 'LG-006': judgment(verdict, confidence) });
  return fake.infer(candidates.request);
}

describe('LG-006 surface (Layer D)', () => {
  it('surfaces a handler with a cancellation branch, enumerating events, with no no-branch fact', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.handlerPaths).toEqual(['app/api/stripe/webhook/route.ts']);
    expect(candidates.hasCancellationBranch).toBe(true);
    expect(candidates.handledEvents).toContain('customer.subscription.deleted');
    expect(candidates.handledEvents).toContain('checkout.session.completed');
    expect(candidates.request.excerpts.length).toBeGreaterThan(0);
    expect(candidates.request.excerpts.every((e) => candidates.handlerPaths.includes(e.path))).toBe(true);
    // A present cancellation branch means no deterministic "must-fail" fact.
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
  });

  it('surfaces a handler WITHOUT a cancellation branch and records a fail-establishing supporting fact', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.hasCancellationBranch).toBe(false);
    const facts = candidates.request.supportingFacts ?? [];
    expect(facts).toHaveLength(1);
    expect(facts[0]?.establishesVerdict).toBe('fail');
  });

  it('returns not_applicable when there is no webhook handler at all', () => {
    const { fileset } = makeRepo({
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(false);
  });
});

describe('LG-006 interpret', () => {
  it('emits not_applicable (non-external) when no handler was surfaced', () => {
    const { fileset } = makeRepo({ 'app/api/health/route.ts': 'export function GET() {}\n' });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.checkId).toBe('LG-006');
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('emits unknown "model layer disabled" with no judgment and no external marker (AT-27)', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(finding?.externalVerification).toBeUndefined();
    expect(finding?.evidence.length).toBeGreaterThan(0);
  });

  it('emits a DETERMINISTIC confirmed blocker FAIL when NO handler has a cancellation branch (§4.3)', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates);
    // A fully missing branch is a Layer-D signal. Routing it through the model
    // layer would silently substitute model judgment for a required
    // deterministic signal, which §4.3 forbids.
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-006')?.severityCeiling);
    expect(finding?.summary).not.toContain('Model layer disabled');
    // LG-006 is non-external (§3) on every branch.
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('carries a code excerpt AND an absence entry per handler on the deterministic fail (AT-26, §5)', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': HANDLER_NO_CANCELLATION,
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates);
    expect(finding?.outcome).toBe('fail');
    const evidence = finding?.evidence ?? [];
    expect(evidence.length).toBeGreaterThan(0);
    for (const path of candidates.handlerPaths) {
      expect(evidence.some((e) => e.path === path && e.kind === 'code')).toBe(true);
      expect(evidence.some((e) => e.path === path && e.kind === 'absence')).toBe(true);
    }
    // Absence evidence must carry a non-empty note (§5).
    for (const e of evidence.filter((x) => x.kind === 'absence')) {
      expect(e.note ?? '').not.toBe('');
    }
  });

  it('does NOT emit the deterministic fail when the handler DELEGATES and the branch lives elsewhere', () => {
    // The dominant Next.js/Stripe idiom: the route verifies and delegates, and
    // the switch lives in a lib module. Gating the blocker on handler-FILE
    // absence would emit confirmed/1.0 `not_ready` — the product's most
    // unappealable output, with no override mechanism in Phase 1 (§7) — on a
    // repository that handles cancellation correctly.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`,
      'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'customer.subscription.deleted':
      await revokeAccess(event.data.object.customer);
      break;
  }
}
`,
    });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
  });

  it('still emits the deterministic fail when NO file in the repository handles cancellation', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  await handleStripeEvent(JSON.parse(await req.text()));
  return new Response('ok');
}
`,
      'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
}
`,
    });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
  });

  it('does NOT emit the deterministic fail when a NON-FIRST handler carries the branch (no false blocker)', () => {
    // `webhook-v2` sorts before `webhook/` ('-' < '/'), so a first-match locator
    // would see only the branchless handler and manufacture a blocker on a repo
    // that actually handles cancellation.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': HANDLER_NO_CANCELLATION,
      'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE,
    });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
  });

  it('emits an inferred blocker FAIL from a fake fail judgment, severity from the registry, capped ≤ 0.9', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.85));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('inferred');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-006')?.severityCeiling);
    expect(finding?.confidence).toBe(0.85);
    expect(finding?.confidence).toBeLessThanOrEqual(0.9);
    expect(finding?.evidence.some((e) => candidates.handlerPaths.includes(e.path))).toBe(true);
  });

  it('caps an over-confident fail judgment at 0.9', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.99));
    expect(finding?.confidence).toBe(0.9);
  });

  it('emits an inferred PASS from a fake pass judgment', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'pass', 0.8));
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('inferred');
  });

  it('keeps a low-confidence fail judgment inferred at the detector level (engine reclassifies, not the detector)', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.5));
    expect(finding?.classification).toBe('inferred');
    expect(finding?.classification).not.toBe('requires_confirmation');
    expect(finding?.confidence).toBe(0.5);
  });
});
