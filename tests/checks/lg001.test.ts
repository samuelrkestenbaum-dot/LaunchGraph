import { afterAll, describe, expect, it } from 'vitest';

import { detectLg001 } from '../../src/checks/lg001.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

describe('LG-001 — production callbacks using localhost', () => {
  it('fails when .env.production maps a URL to localhost, citing the file', () => {
    const { fileset } = makeRepo({
      '.env.production': 'NEXT_PUBLIC_SITE_URL=http://localhost:3000\nNODE_ENV=production\n',
    });
    const [finding] = detectLg001(fileset);
    expect(finding?.checkId).toBe('LG-001');
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    expect(finding?.evidence.some((e) => e.path === '.env.production')).toBe(true);
    // SEC-4: the raw localhost value is categorically masked in the excerpt.
    expect(finding?.evidence.every((e) => !e.excerpt.includes('localhost'))).toBe(true);
  });

  it('fails on a vercel.json rewrite targeting 127.0.0.1', () => {
    const { fileset } = makeRepo({
      'vercel.json': '{\n  "rewrites": [{ "source": "/a", "destination": "http://127.0.0.1:4000" }]\n}\n',
    });
    const [finding] = detectLg001(fileset);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.evidence.some((e) => e.path === 'vercel.json')).toBe(true);
  });

  it('does NOT fire on localhost in .env.development (distractor)', () => {
    const { fileset } = makeRepo({
      '.env.development': 'NEXT_PUBLIC_SITE_URL=http://localhost:3000\n',
    });
    const [finding] = detectLg001(fileset);
    expect(finding?.outcome).not.toBe('fail');
    // No production URL mapping locatable → unknown, never a fabricated fail (§3).
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.evidence[0]?.kind).toBe('absence');
  });

  it('does NOT fire on localhost inside a test file', () => {
    const { fileset } = makeRepo({
      'tests/app.test.ts': "const base = 'http://localhost:3000';\n",
    });
    const [finding] = detectLg001(fileset);
    expect(finding?.outcome).toBe('unknown');
  });

  it('passes when the production URL resolves to a real https origin', () => {
    const { fileset } = makeRepo({
      '.env.production': 'NEXT_PUBLIC_SITE_URL=https://app.example.com\n',
    });
    const [finding] = detectLg001(fileset);
    expect(finding?.outcome).toBe('pass');
  });

  it('returns unknown when no production configuration exists at all', () => {
    const { fileset } = makeRepo({ 'src/index.ts': 'export const x = 1;\n' });
    const [finding] = detectLg001(fileset);
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.evidence[0]?.kind).toBe('absence');
  });
});
