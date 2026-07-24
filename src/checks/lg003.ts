/**
 * LG-003 — Missing production webhook (§3, External = Yes).
 *
 * Deterministic (Layer D). Presence-only: given detected recurring/subscription
 * Stripe usage, a Stripe webhook route must exist in the repository. This check
 * is strictly about the handler's PRESENCE — signature verification is LG-004's
 * job and is never evaluated here, so the two checks do not overlap.
 *
 * Outcomes (§3 and the P-003-S3 externalVerification contract):
 * - `not_applicable` — no recurring/subscription Stripe usage is detected; the
 *   missing-webhook question does not arise (no finding consequence, no
 *   external marker).
 * - `fail` (confirmed, blocker) — subscription usage exists but NO webhook
 *   route is present anywhere. Evidence is an `absence` entry (listing the
 *   searched route globs) plus the subscription-usage site as `code` evidence.
 *   A documentary externalVerification{stripe,…,phase-3} is attached: the
 *   repository fix (adding the handler) still has an external half — the
 *   endpoint must be registered at Stripe.
 * - `pass` (unverified, confidence 1.0) — a webhook route is present. The
 *   repository side is satisfied, but whether the endpoint is actually
 *   registered at Stripe and subscribed to the required lifecycle events is
 *   external → the SAME externalVerification marker is attached. This
 *   pass-unverified case holds the Phase-1 ceiling at `ready_with_warnings`
 *   (§7 rule 6).
 *
 * This check NEVER claims the endpoint is or is not registered at Stripe —
 * repository analysis cannot establish provider-side state (§1.2).
 */
import { fileLines } from '../scan/collect.js';
import type { Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence } from '../scan/redact.js';
import type { Finding } from '../schema/index.js';
import { makeExternalVerification, makeFinding } from './detectorKit.js';

const CODE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Recurring/subscription Stripe usage: a subscription-mode checkout, a
 * subscription lifecycle event, a recurring price, or a subscriptions API call.
 */
const SUBSCRIPTION_USAGE_RE =
  /mode\s*:\s*['"`]subscription['"`]|customer\.subscription\.|invoice\.(?:paid|payment_succeeded|payment_failed)|['"`]recurring['"`]|\.subscriptions\b/;

/** The stripe external half is identical for the fail and pass-unverified branches. */
const STRIPE_WEBHOOK_EXTERNAL = makeExternalVerification(
  'stripe',
  'the production webhook endpoint is registered at Stripe and subscribes to the required subscription lifecycle events',
);

/** A code file that is a Stripe webhook route by path (presence only). */
function isWebhookRoute(path: string): boolean {
  const lower = path.toLowerCase();
  if (!CODE_EXT_RE.test(lower)) return false;
  if (!lower.includes('webhook')) return false;
  return lower.includes('/api/') || lower.startsWith('api/') || lower.includes('route.') || lower.includes('pages/api');
}

interface UsageSite {
  path: string;
  lineNo: number; // 1-based
  line: string;
}

/** First code line exhibiting recurring/subscription Stripe usage, or null. */
function findSubscriptionUsage(fileset: Fileset): UsageSite | null {
  for (const file of fileset.files) {
    if (!CODE_EXT_RE.test(file.path)) continue;
    const lines = fileLines(file);
    for (let i = 0; i < lines.length; i += 1) {
      if (SUBSCRIPTION_USAGE_RE.test(lines[i] ?? '')) {
        return { path: file.path, lineNo: i + 1, line: lines[i] ?? '' };
      }
    }
  }
  return null;
}

export function detectLg003(fileset: Fileset): Finding[] {
  const usage = findSubscriptionUsage(fileset);
  if (usage === null) {
    return [
      makeFinding({
        checkId: 'LG-003',
        seq: 1,
        outcome: 'not_applicable',
        summary: 'No recurring/subscription Stripe usage detected; the production-webhook check does not apply.',
        evidence: [],
      }),
    ];
  }

  const webhook = fileset.files.find((f) => isWebhookRoute(f.path));
  if (webhook === undefined) {
    return [
      makeFinding({
        checkId: 'LG-003',
        seq: 1,
        outcome: 'fail',
        summary:
          'Recurring/subscription Stripe usage exists but no webhook route is present to receive Stripe events; repository analysis cannot confirm any endpoint is registered at Stripe (external — Phase 3).',
        evidence: [
          buildAbsenceEvidence({
            path: 'app/api',
            note:
              'Searched app/api/**/webhook*/route.ts and pages/api/** for a Stripe webhook handler; none was found. Whether an endpoint is registered at Stripe is external — Phase 3.',
          }),
          buildEvidence({
            path: usage.path,
            startLine: usage.lineNo,
            endLine: usage.lineNo,
            rawExcerpt: usage.line,
            kind: 'code',
            note: 'Recurring/subscription Stripe usage that requires a webhook handler to be present.',
          }),
        ],
        externalVerification: STRIPE_WEBHOOK_EXTERNAL,
      }),
    ];
  }

  return [
    makeFinding({
      checkId: 'LG-003',
      seq: 1,
      outcome: 'pass',
      classification: 'unverified',
      summary:
        'A Stripe webhook route is present in the repository; whether the endpoint is registered at Stripe and subscribed to the required lifecycle events is external and unverified (Phase 3).',
      evidence: [
        buildEvidence({
          path: webhook.path,
          startLine: 1,
          endLine: 1,
          rawExcerpt: fileLines(webhook)[0] ?? '',
          kind: 'code',
          note: 'Stripe webhook route present (presence only; signature verification is LG-004, registration at Stripe is external — Phase 3).',
        }),
      ],
      externalVerification: STRIPE_WEBHOOK_EXTERNAL,
    }),
  ];
}
