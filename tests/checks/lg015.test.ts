import { afterAll, describe, expect, it } from 'vitest';

import { detectLg015 } from '../../src/checks/lg015.js';
import { getCheck } from '../../src/checks/registry.js';
import { SEVERITIES } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const NEXT_PKG = '{\n  "name": "app",\n  "private": true,\n  "dependencies": { "next": "14.2.3" }\n}\n';

describe('LG-015 — missing or unverified production domain', () => {
  it('fails when an app configures no canonical production URL anywhere', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_PKG,
      'app/page.tsx': 'export default function Page() { return null; }\n',
      '.env.production': 'NODE_ENV=production\n',
    });
    const [finding] = detectLg015(fileset);
    expect(finding?.checkId).toBe('LG-015');
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-015')?.severityCeiling);
    expect(SEVERITIES).toContain(finding?.severity);
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.evidence[0]?.kind).toBe('absence');
    // Documentary externalVerification: DNS/TLS/attachment are external (Phase 3).
    expect(finding?.externalVerification?.provider).toBe('dns');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('fails when configured canonical URLs disagree on the host', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_PKG,
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://a.example.com\nNEXTAUTH_URL=https://b.example.com\n',
    });
    const [finding] = detectLg015(fileset);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.externalVerification?.provider).toBe('dns');
  });

  it('passes as unverified when a single canonical production host is configured and consistent', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_PKG,
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.example.com\nNEXTAUTH_URL=https://app.example.com\n',
    });
    const [finding] = detectLg015(fileset);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('unverified');
    expect(finding?.externalVerification?.provider).toBe('dns');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('passes as unverified from a source metadataBase', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_PKG,
      'app/layout.tsx': "export const metadata = { metadataBase: new URL('https://app.example.com') };\n",
    });
    const [finding] = detectLg015(fileset);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('unverified');
  });

  it('is not_applicable on a non-app repo (the unsupported-stack gate)', () => {
    const { fileset } = makeRepo({
      'package.json': '{\n  "private": true,\n  "dependencies": { "express": "^4.19.2" }\n}\n',
      'index.js': "const express = require('express');\n",
    });
    const [finding] = detectLg015(fileset);
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('does NOT fail on a localhost production URL — presence, not correctness (no LG-001 overlap)', () => {
    const { fileset } = makeRepo({
      'package.json': NEXT_PKG,
      '.env.production': 'NEXT_PUBLIC_SITE_URL=http://localhost:3000\n',
    });
    const [finding] = detectLg015(fileset);
    // A configured (if wrong) origin is present → pass; the dev-origin defect is LG-001's job.
    expect(finding?.outcome).toBe('pass');
    expect(finding?.outcome).not.toBe('fail');
  });
});
