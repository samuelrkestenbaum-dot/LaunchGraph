import Stripe from 'stripe';

// DISTRACTOR: a correctly-configured client reading the key from the
// environment (no committed literal) — LG-002 stays clean here.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
