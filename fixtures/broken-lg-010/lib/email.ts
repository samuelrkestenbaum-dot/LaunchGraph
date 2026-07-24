import { Resend } from 'resend';

// DISTRACTOR: the client reads its key from the environment (no committed
// literal) — LG-002 stays clean and no re_... secret is present anywhere.
const resend = new Resend(process.env.RESEND_API_KEY as string);

// SEEDED DEFECT (LG-010): the app sends transactional email from the Resend
// PROVIDER-DEFAULT domain `onboarding@resend.dev` — a shared, unauthenticated
// sender that also mismatches the production domain (app.example.com). Whether
// a custom sending domain is authenticated (SPF/DKIM/DMARC) at the provider is
// external (Phase 3); the repository side — a provider-default from-address —
// is the confirmed warning.
export async function sendWelcome(to: string) {
  return resend.emails.send({
    from: 'onboarding@resend.dev',
    to,
    subject: 'Welcome',
    html: '<p>Welcome aboard.</p>',
  });
}
