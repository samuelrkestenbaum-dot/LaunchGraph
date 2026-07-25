import { grantEntitlement } from '../../../../../lib/entitlements';
import { stripe } from '../../../../../lib/stripe';

// SEEDED DEFECT (LG-006): this handler grants entitlement on purchase but
// never branches on subscription cancellation at all — neither the deleted
// lifecycle event nor an updated event carrying a cancelled status. Nothing in
// the repository can revoke access when a subscription ends, so a cancelled
// customer keeps it forever.
//
// (The cancellation event names are deliberately not written anywhere in this
// fixture, including in comments: the Layer-D detector reads raw file content,
// so naming them here would look exactly like handling them.)
//
// DISTRACTOR (LG-004 must stay clean): the signature IS verified via
// stripe.webhooks.constructEvent before the body is trusted.
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') as string;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);

  switch (event.type) {
    case 'checkout.session.completed':
      await grantEntitlement(event.data.object.customer);
      break;
    case 'invoice.paid':
      await grantEntitlement(event.data.object.customer);
      break;
    default:
      break;
  }

  return new Response('ok');
}
