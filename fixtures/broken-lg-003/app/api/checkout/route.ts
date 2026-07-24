import { stripe } from '../../../lib/stripe';

// SEEDED DEFECT (LG-003): this app creates Stripe *subscription* checkout
// sessions but ships NO webhook route to receive subscription lifecycle
// events. Whether any endpoint is registered at Stripe is external (Phase 3);
// the repository side — a missing handler — is the confirmed defect.
export async function POST() {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: 'https://app.example.com/success',
    cancel_url: 'https://app.example.com/cancel',
  });
  return Response.json({ id: session.id });
}
