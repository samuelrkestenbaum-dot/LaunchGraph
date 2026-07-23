import { describe, expect, it } from 'vitest';

import {
  REDACTION_MARKER,
  buildAbsenceEvidence,
  buildEvidence,
  redact,
  redactEnvText,
  redactForPath,
} from '../../src/scan/redact.js';
import { validateReport } from '../../src/schema/index.js';
import { makeReport } from '../support/builders.js';

const FAKE_LIVE_KEY = 'sk_live_EXAMPLEnotreal';
const FAKE_TEST_KEY = 'pk_test_EXAMPLEnotreal';

describe('redact — SEC-4 secret masking', () => {
  it('masks the value of a live Stripe key but preserves the sk_live prefix', () => {
    const out = redact(`const stripe = new Stripe('${FAKE_LIVE_KEY}');`);
    expect(out).not.toContain('EXAMPLEnotreal');
    expect(out).toContain('sk_live_');
    expect(out).toContain(REDACTION_MARKER);
  });

  it('masks test keys and Stripe webhook secrets while keeping the prefix', () => {
    expect(redact(FAKE_TEST_KEY)).toBe(`pk_test_${REDACTION_MARKER}`);
    expect(redact('whsec_abcDEF123456ghijkLMNOP')).toBe(`whsec_${REDACTION_MARKER}`);
  });

  it('masks PEM private-key blocks', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7f\n-----END RSA PRIVATE KEY-----';
    const out = redact(pem);
    expect(out).not.toContain('MIIEpAIBAAKCAQEA7f');
    expect(out).toContain(REDACTION_MARKER);
  });

  it('masks high-entropy tokens', () => {
    const secret = 'aZ9xQ2wE7rT4yU1iO8pL5kJ3hG6fD0sA';
    const out = redact(`TOKEN=${secret}`);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTION_MARKER);
  });

  it('leaves ordinary prose and short identifiers alone', () => {
    const text = 'const handler = webhook; // reads the request body';
    expect(redact(text)).toBe(text);
  });
});

describe('redactEnvText — categorical env-value masking (SEC-4)', () => {
  it('masks every KEY=value even for non-secret values', () => {
    const env = 'NEXT_PUBLIC_SITE_URL=http://localhost:3000\nSTRIPE_SECRET_KEY=' + FAKE_LIVE_KEY + '\n# a comment';
    const out = redactEnvText(env);
    expect(out).toContain(`NEXT_PUBLIC_SITE_URL=${REDACTION_MARKER}`);
    expect(out).toContain(`STRIPE_SECRET_KEY=${REDACTION_MARKER}`);
    expect(out).not.toContain('localhost:3000');
    expect(out).not.toContain('EXAMPLEnotreal');
    expect(out).toContain('# a comment');
  });

  it('redactForPath applies env masking for .env files and code masking otherwise', () => {
    expect(redactForPath('.env.production', `K=${FAKE_LIVE_KEY}`)).toBe(`K=${REDACTION_MARKER}`);
    expect(redactForPath('lib/stripe.ts', FAKE_LIVE_KEY)).toBe(`sk_live_${REDACTION_MARKER}`);
  });
});

describe('buildEvidence — the only sanctioned evidence path', () => {
  it('redacts the excerpt so no raw secret reaches a Finding', () => {
    const evidence = buildEvidence({
      path: 'lib/stripe.ts',
      startLine: 3,
      endLine: 3,
      rawExcerpt: `const stripe = new Stripe('${FAKE_LIVE_KEY}');`,
      kind: 'code',
      note: 'live key committed',
    });
    expect(evidence.excerpt).not.toContain('EXAMPLEnotreal');
    expect(evidence.excerpt).toContain(REDACTION_MARKER);
    expect(evidence.kind).toBe('code');
  });

  it('categorically masks env-file excerpts by path', () => {
    const evidence = buildEvidence({
      path: '.env.production',
      startLine: 1,
      endLine: 1,
      rawExcerpt: `STRIPE_SECRET_KEY=${FAKE_LIVE_KEY}`,
      kind: 'config',
    });
    expect(evidence.excerpt).toBe(`STRIPE_SECRET_KEY=${REDACTION_MARKER}`);
  });

  it('produces schema-valid absence evidence', () => {
    const evidence = buildAbsenceEvidence({ path: 'app/api/webhook/route.ts', note: 'no constructEvent found' });
    expect(evidence.excerpt).toBe('');
    expect(evidence.kind).toBe('absence');
    // A finding carrying only this absence evidence must still validate.
    const report = makeReport({
      findings: [
        {
          id: 'LG-004-001',
          checkId: 'LG-004',
          title: 'Missing webhook signature verification',
          severity: 'blocker',
          outcome: 'fail',
          classification: 'confirmed',
          confidence: 1,
          summary: 'x',
          evidence: [evidence],
        },
      ],
      decision: { value: 'not_ready', reasons: ['r'] },
      counts: { blockers: 1, warnings: 0, unknowns: 0 },
    });
    expect(validateReport(report).errors).toEqual([]);
  });
});
