import { downgradeEntitlement, handleEvent } from '../../../../lib/handle';

// SEEDED DEFECT (LG-004): the handler consumes the raw request body and parses
// it as a Stripe event WITHOUT verifying the stripe-signature header (no
// stripe.webhooks.constructEvent). Anyone can POST a forged event.
//
// DELIBERATELY NOT A DEFECT (LG-006): the subscription-cancellation branch
// below IS present and DOES reach an entitlement downgrade. It is here so this
// fixture isolates exactly LG-004 — without it, LG-006's Layer-D disjunct
// would correctly raise a second, unrelated blocker and the fixture would stop
// seeding a single defect. Note that adding it must NOT introduce any
// signature verification: no constructEvent, no stripe-signature/HMAC pair.
export async function POST(req: Request) {
  const body = await req.text();
  const event = JSON.parse(body);
  if (event.type === 'customer.subscription.deleted') {
    await downgradeEntitlement(event.data.object.customer);
    return new Response('ok');
  }
  await handleEvent(event);
  return new Response('ok');
}
