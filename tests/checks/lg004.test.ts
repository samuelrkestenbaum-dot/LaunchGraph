import { afterAll, describe, expect, it } from 'vitest';

import { detectLg004 } from '../../src/checks/lg004.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const UNVERIFIED_HANDLER = `import Stripe from 'stripe';
export async function POST(req: Request) {
  const body = await req.text();
  const event = JSON.parse(body);
  await handle(event);
  return new Response('ok');
}
`;

const VERIFIED_HANDLER = `import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handle(event);
  return new Response('ok');
}
`;

describe('LG-004 — missing webhook signature verification', () => {
  it('fails when the handler consumes the body without constructEvent, citing the route', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': UNVERIFIED_HANDLER });
    const [finding] = detectLg004(fileset);
    expect(finding?.checkId).toBe('LG-004');
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.evidence.some((e) => e.path.includes('webhook/route.ts'))).toBe(true);
    // Absence evidence documents the missing verification signal.
    expect(finding?.evidence.some((e) => e.kind === 'absence')).toBe(true);
  });

  it('does NOT fire on a properly-verified webhook (distractor)', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': VERIFIED_HANDLER });
    const [finding] = detectLg004(fileset);
    expect(finding?.outcome).toBe('pass');
  });

  it('is not_applicable when there is no webhook handler (LG-003 territory)', () => {
    const { fileset } = makeRepo({
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    const [finding] = detectLg004(fileset);
    expect(finding?.outcome).toBe('not_applicable');
  });

  it('does NOT fire on a non-webhook route that reads the body', () => {
    const { fileset } = makeRepo({
      'app/api/upload/route.ts': 'export async function POST(req: Request) {\n  const body = await req.json();\n  return new Response(JSON.stringify(body));\n}\n',
    });
    const [finding] = detectLg004(fileset);
    // Not a webhook path → LG-004 does not apply.
    expect(finding?.outcome).toBe('not_applicable');
  });
});
