import { stripe } from '../../../lib/stripe';

// DISTRACTOR: recurring/subscription Stripe usage, so LG-003 is applicable and
// passes (a webhook route IS present, pending external registration at Stripe).
// It is also what makes the missing cancellation handling a real defect.
export async function POST() {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: 'https://app.example.com/welcome',
    cancel_url: 'https://app.example.com/pricing',
  });
  return Response.json({ url: session.url });
}
