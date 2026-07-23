/**
 * LG-004 — Missing webhook signature verification (§3).
 *
 * Deterministic pattern analysis (Layer D, External = No). A Stripe webhook
 * handler that consumes the request body **without**
 * `stripe.webhooks.constructEvent` (or an equivalent signature validation on
 * the `stripe-signature` header) fails as a confirmed blocker.
 *
 * Outcomes:
 * - `fail` (confirmed, 1.0) — handler consumes the body with no signature
 *   verification.
 * - `pass` — one or more webhook handlers exist and all verify the signature.
 * - `not_applicable` — no webhook handler exists (a *missing* handler is
 *   LG-003's concern, not LG-004's).
 *
 * Verification is recognised via `constructEvent(...)`, or the equivalent of a
 * `stripe-signature` header read paired with an HMAC/constant-time comparison.
 * Body consumption is recognised via `req/request.text()/json()/…`, `rawBody`,
 * `req.body`, or `JSON.parse`.
 */
import { fileLines } from '../scan/collect.js';
import type { CollectedFile, Fileset } from '../scan/collect.js';
import { buildAbsenceEvidence, buildEvidence } from '../scan/redact.js';
import type { Evidence, Finding } from '../schema/index.js';
import { firstLineMatching, makeFinding } from './detectorKit.js';

const CODE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const CONSTRUCT_EVENT_RE = /constructEvent(?:Async)?\s*\(/;
const STRIPE_SIG_HEADER_RE = /stripe-signature/i;
const HMAC_RE = /createHmac|timingSafeEqual|verifyHeader/;
const BODY_CONSUME_RE = /\.(?:text|json|arrayBuffer|formData)\s*\(|rawBody|req\.body|request\.body|JSON\.parse\s*\(/;

/** A code file that looks like a Stripe webhook handler by path. */
function isWebhookHandler(path: string): boolean {
  const lower = path.toLowerCase();
  if (!CODE_EXT_RE.test(lower)) return false;
  if (!lower.includes('webhook')) return false;
  return lower.includes('/api/') || lower.startsWith('api/') || lower.includes('route.') || lower.includes('pages/api');
}

function verifiesSignature(content: string): boolean {
  if (CONSTRUCT_EVENT_RE.test(content)) return true;
  return STRIPE_SIG_HEADER_RE.test(content) && HMAC_RE.test(content);
}

export function detectLg004(fileset: Fileset): Finding[] {
  const handlers = fileset.files.filter((f) => isWebhookHandler(f.path));

  const failing: CollectedFile[] = [];
  for (const handler of handlers) {
    if (BODY_CONSUME_RE.test(handler.content) && !verifiesSignature(handler.content)) {
      failing.push(handler);
    }
  }

  if (failing.length > 0) {
    const evidence: Evidence[] = [];
    for (const handler of failing) {
      const lines = fileLines(handler);
      const idx = firstLineMatching(lines, BODY_CONSUME_RE);
      const lineNo = idx >= 0 ? idx + 1 : 1;
      evidence.push(
        buildEvidence({
          path: handler.path,
          startLine: lineNo,
          endLine: lineNo,
          rawExcerpt: lines[Math.max(0, lineNo - 1)] ?? '',
          kind: 'code',
          note: 'Webhook handler consumes the request body here without prior signature verification.',
        }),
      );
      evidence.push(
        buildAbsenceEvidence({
          path: handler.path,
          note: 'No stripe.webhooks.constructEvent (or equivalent stripe-signature verification) found in this handler.',
        }),
      );
    }
    return [
      makeFinding({
        checkId: 'LG-004',
        seq: 1,
        outcome: 'fail',
        summary:
          'A Stripe webhook handler consumes the request body without verifying the stripe-signature header (no stripe.webhooks.constructEvent).',
        evidence,
      }),
    ];
  }

  if (handlers.length > 0) {
    return [
      makeFinding({
        checkId: 'LG-004',
        seq: 1,
        outcome: 'pass',
        summary: 'All detected Stripe webhook handlers verify the request signature.',
        evidence: [],
      }),
    ];
  }

  return [
    makeFinding({
      checkId: 'LG-004',
      seq: 1,
      outcome: 'not_applicable',
      summary: 'No Stripe webhook handler detected; signature-verification check does not apply.',
      evidence: [],
    }),
  ];
}
