import { afterAll, describe, expect, it } from 'vitest';

import { detectLg010 } from '../../src/checks/lg010.js';
import { getCheck } from '../../src/checks/registry.js';
import { SEVERITIES } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const NEXT_RESEND_PKG =
  '{\n  "name": "app",\n  "private": true,\n  "dependencies": { "next": "14.2.3", "resend": "3.2.0" }\n}\n';
const PLAIN_NEXT_PKG = '{\n  "name": "app",\n  "private": true,\n  "dependencies": { "next": "14.2.3" }\n}\n';

const RESEND_DEFAULT = `import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY as string);
export async function sendWelcome(to: string) {
  return resend.emails.send({
    from: 'onboarding@resend.dev',
    to,
    subject: 'Welcome',
    html: '<p>Welcome</p>',
  });
}
`;

const resendFrom = (fromDomain: string): string => `import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY as string);
export async function sendWelcome(to: string) {
  return resend.emails.send({
    from: 'noreply@${fromDomain}',
    to,
    subject: 'Welcome',
    html: '<p>Welcome</p>',
  });
}
`;

describe('LG-010 — unauthenticated email domain', () => {
  it('fails (warning) when the from-address uses a provider default (onboarding@resend.dev)', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_RESEND_PKG,
      'app/page.tsx': 'export default function Page() { return null; }\n',
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.example.com\n',
      'lib/email.ts': RESEND_DEFAULT,
    });
    const [finding] = detectLg010(fileset);
    expect(finding?.checkId).toBe('LG-010');
    expect(finding?.outcome).toBe('fail');
    // Warning ceiling: fail carries severity 'warning' (from the registry), NEVER blocker.
    expect(finding?.severity).toBe('warning');
    expect(finding?.severity).toBe(getCheck('LG-010')?.severityCeiling);
    expect(finding?.severity).not.toBe('blocker');
    expect(SEVERITIES).toContain(finding?.severity);
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    // Evidence cites the offending from-address file.
    expect(finding?.evidence.some((e) => e.path === 'lib/email.ts')).toBe(true);
    // The public default is non-secret and survives redaction verbatim.
    expect(finding?.evidence.some((e) => e.excerpt.includes('onboarding@resend.dev'))).toBe(true);
    // externalVerification is attached on the fail branch (Phase 3).
    expect(finding?.externalVerification?.provider).toBe('resend');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('fails (warning) when the from-domain is mismatched with the configured production domain', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_RESEND_PKG,
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.acme.com\n',
      'lib/email.ts': resendFrom('notacme.com'),
    });
    const [finding] = detectLg010(fileset);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('warning');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.externalVerification?.provider).toBe('resend');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('passes as unverified for a custom from-domain matching the production domain (distractor, NOT a fail)', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_RESEND_PKG,
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.example.com\n',
      // A subdomain sender shares the registrable domain with the prod host → not a mismatch.
      'lib/email.ts': resendFrom('mail.example.com'),
    });
    const [finding] = detectLg010(fileset);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.classification).toBe('unverified');
    expect(finding?.severity).toBe('warning');
    // The pass-unverified branch STILL carries externalVerification (Phase 3).
    expect(finding?.externalVerification?.provider).toBe('resend');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('passes as unverified for a custom from-domain when no production domain is configured', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_RESEND_PKG,
      'lib/email.ts': resendFrom('example.com'),
    });
    const [finding] = detectLg010(fileset);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('unverified');
    expect(finding?.externalVerification?.provider).toBe('resend');
  });

  it('is not_applicable when no email-sending usage is present (no extVer, empty evidence)', () => {
    const { fileset } = makeRepo({
      'package.json': PLAIN_NEXT_PKG,
      'app/page.tsx': 'export default function Page() { return null; }\n',
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.example.com\n',
    });
    const [finding] = detectLg010(fileset);
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
    expect(finding?.evidence).toEqual([]);
  });
});
