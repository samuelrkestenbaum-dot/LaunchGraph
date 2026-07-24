import { afterAll, describe, expect, it } from 'vitest';

import { detectLg003 } from '../../src/checks/lg003.js';
import { getCheck } from '../../src/checks/registry.js';
import { SEVERITIES } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const SUBSCRIPTION_CHECKOUT = `import { stripe } from '../../../lib/stripe';
export async function POST() {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: 'https://app.example.com/success',
  });
  return Response.json({ id: session.id });
}
`;

const ONE_TIME_CHECKOUT = `import { stripe } from '../../../lib/stripe';
export async function POST() {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
  });
  return Response.json({ id: session.id });
}
`;

const WEBHOOK_HANDLER = `import { stripe } from '../../../../lib/stripe';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  if (event.type === 'customer.subscription.deleted') { /* downgrade */ }
  return new Response('ok');
}
`;

describe('LG-003 — missing production webhook', () => {
  it('fails when subscription usage exists but no webhook route is present', () => {
    const { fileset } = makeRepo({ 'app/api/checkout/route.ts': SUBSCRIPTION_CHECKOUT });
    const [finding] = detectLg003(fileset);
    expect(finding?.checkId).toBe('LG-003');
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('blocker');
    // Severity is drawn from the §3 registry and is a valid §5 enum.
    expect(finding?.severity).toBe(getCheck('LG-003')?.severityCeiling);
    expect(SEVERITIES).toContain(finding?.severity);
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    // Absence evidence for the missing handler PLUS the usage site as code.
    expect(finding?.evidence.some((e) => e.kind === 'absence')).toBe(true);
    expect(finding?.evidence.some((e) => e.kind === 'code' && e.path.includes('checkout'))).toBe(true);
    // Documentary externalVerification: the fix has an external half (Phase 3).
    expect(finding?.externalVerification?.provider).toBe('stripe');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('passes as unverified when a webhook route is present (holds the ceiling)', () => {
    const { fileset } = makeRepo({
      'app/api/checkout/route.ts': SUBSCRIPTION_CHECKOUT,
      'app/api/stripe/webhook/route.ts': WEBHOOK_HANDLER,
    });
    const [finding] = detectLg003(fileset);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('unverified');
    // The pass-unverified case still carries the external marker (Phase 3).
    expect(finding?.externalVerification?.provider).toBe('stripe');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('is not_applicable with no recurring/subscription usage (one-time payment distractor)', () => {
    const { fileset } = makeRepo({ 'app/api/checkout/route.ts': ONE_TIME_CHECKOUT });
    const [finding] = detectLg003(fileset);
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('does NOT fire when a webhook exists but there is no subscription usage (distractor)', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': WEBHOOK_HANDLER.replace('customer.subscription.deleted', 'payment_intent.succeeded'),
      'app/api/checkout/route.ts': ONE_TIME_CHECKOUT,
    });
    const [finding] = detectLg003(fileset);
    // No recurring/subscription usage → the check simply does not apply.
    expect(finding?.outcome).toBe('not_applicable');
  });
});
