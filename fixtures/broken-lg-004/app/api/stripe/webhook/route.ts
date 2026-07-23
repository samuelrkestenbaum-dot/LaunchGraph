import { handleEvent } from '../../../../lib/handle';

// SEEDED DEFECT (LG-004): the handler consumes the raw request body and parses
// it as a Stripe event WITHOUT verifying the stripe-signature header (no
// stripe.webhooks.constructEvent). Anyone can POST a forged event.
export async function POST(req: Request) {
  const body = await req.text();
  const event = JSON.parse(body);
  await handleEvent(event);
  return new Response('ok');
}
