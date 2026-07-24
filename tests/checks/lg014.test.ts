import { afterAll, describe, expect, it } from 'vitest';

import { detectLg014 } from '../../src/checks/lg014.js';
import { getCheck } from '../../src/checks/registry.js';
import { SEVERITIES } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const NEXT_SENTRY_PKG =
  '{\n  "name": "app",\n  "private": true,\n  "dependencies": { "next": "14.2.3", "@sentry/nextjs": "8.20.0" }\n}\n';
const PLAIN_NEXT_PKG = '{\n  "name": "app",\n  "private": true,\n  "dependencies": { "next": "14.2.3" }\n}\n';

// SEEDED DEFECT shape: Sentry.init with NO dsn and NO environment/release tagging.
const SENTRY_INIT_BARE = `import * as Sentry from '@sentry/nextjs';
Sentry.init({
  tracesSampleRate: 1.0,
});
`;

// Fully wired: DSN (env reference) + environment + release tagging.
const SENTRY_INIT_WIRED = `import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: 0.1,
});
`;

// DSN wired but no environment/release tagging.
const SENTRY_INIT_DSN_ONLY = `import * as Sentry from '@sentry/nextjs';
Sentry.init({ dsn: process.env.SENTRY_DSN });
`;

describe('LG-014 — Sentry installed but unverified in production', () => {
  it('fails (warning) when the SDK is present but DSN and tagging are absent from production config', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_SENTRY_PKG,
      'app/page.tsx': 'export default function Page() { return null; }\n',
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.example.com\n',
      'sentry.server.config.ts': SENTRY_INIT_BARE,
    });
    const [finding] = detectLg014(fileset);
    expect(finding?.checkId).toBe('LG-014');
    expect(finding?.outcome).toBe('fail');
    // Warning ceiling: fail carries severity 'warning' (from the registry), NEVER blocker.
    expect(finding?.severity).toBe('warning');
    expect(finding?.severity).toBe(getCheck('LG-014')?.severityCeiling);
    expect(finding?.severity).not.toBe('blocker');
    expect(SEVERITIES).toContain(finding?.severity);
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    // Evidence cites the Sentry config site plus an absence entry.
    expect(finding?.evidence.some((e) => e.path === 'sentry.server.config.ts')).toBe(true);
    expect(finding?.evidence.some((e) => e.kind === 'absence')).toBe(true);
    expect(finding?.externalVerification?.provider).toBe('sentry');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('fails (warning) when a DSN is wired but environment/release tagging is missing', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_SENTRY_PKG,
      'sentry.client.config.ts': SENTRY_INIT_DSN_ONLY,
    });
    const [finding] = detectLg014(fileset);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('warning');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.externalVerification?.provider).toBe('sentry');
  });

  it('passes as unverified when DSN and environment/release tagging are all wired (distractor, NOT a fail)', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_SENTRY_PKG,
      'sentry.server.config.ts': SENTRY_INIT_WIRED,
    });
    const [finding] = detectLg014(fileset);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.classification).toBe('unverified');
    expect(finding?.severity).toBe('warning');
    // The pass-unverified branch STILL carries externalVerification (Phase 3).
    expect(finding?.externalVerification?.provider).toBe('sentry');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('is not_applicable when no Sentry usage is present (no extVer, empty evidence)', () => {
    const { fileset } = makeRepo({
      'package.json': PLAIN_NEXT_PKG,
      'app/page.tsx': 'export default function Page() { return null; }\n',
    });
    const [finding] = detectLg014(fileset);
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
    expect(finding?.evidence).toEqual([]);
  });
});
