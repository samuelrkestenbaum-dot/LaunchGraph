import Stripe from 'stripe';

// SEEDED DEFECT (LG-002): a live secret key is committed to the repository.
// The value is an obviously-fake placeholder; the scanner must redact it in
// every emitted report (SEC-4 / AT-20 groundwork).
export const stripe = new Stripe('sk_live_EXAMPLEnotreal');
