import * as Sentry from '@sentry/nextjs';

// SEEDED DEFECT (LG-014): the Sentry SDK is installed and initialized, but the
// DSN is ABSENT from production configuration and there is NO environment or
// release tagging configured. Whether errors actually arrive in the production
// Sentry project with correct tagging is external (Phase 3); the repository
// side — an unwired init — is the confirmed warning. No DSN literal is present.
Sentry.init({
  tracesSampleRate: 1.0,
});
