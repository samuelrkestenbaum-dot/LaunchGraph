import { afterAll, describe, expect, it } from 'vitest';

import { detectLg008 } from '../../src/checks/lg008.js';
import { getCheck } from '../../src/checks/registry.js';
import { SEVERITIES } from '../../src/schema/index.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const SUPABASE_CLIENT = "import { createClient } from '@supabase/supabase-js';\n";
const SHARED_DB_URL = 'postgresql://db.example.com:5432/appdb';

describe('LG-008 — preview deployment using production database', () => {
  it('fails (confirmed, no external marker) when the same DB URL serves preview and production', () => {
    const { fileset } = makeRepo({
      'lib/db.ts': SUPABASE_CLIENT,
      '.env.production': `DATABASE_URL=${SHARED_DB_URL}\n`,
      '.env.preview': `DATABASE_URL=${SHARED_DB_URL}\n`,
    });
    const [finding] = detectLg008(fileset);
    expect(finding?.checkId).toBe('LG-008');
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-008')?.severityCeiling);
    expect(SEVERITIES).toContain(finding?.severity);
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    // Confirmed repo-provable mixing carries NO external marker.
    expect(finding?.externalVerification).toBeUndefined();
    // Both offending scopes are cited, and the raw DB value is redacted (SEC-4).
    expect(finding?.evidence.some((e) => e.path === '.env.production')).toBe(true);
    expect(finding?.evidence.some((e) => e.path === '.env.preview')).toBe(true);
    for (const e of finding?.evidence ?? []) {
      expect(e.excerpt).not.toContain('db.example.com');
    }
  });

  it('is unknown+unverified with an external marker when DB usage exists but scoping is not repo-provable', () => {
    const { fileset } = makeRepo({
      'lib/db.ts':
        SUPABASE_CLIENT + 'export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);\n',
    });
    const [finding] = detectLg008(fileset);
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.classification).toBe('unverified');
    expect(finding?.externalVerification?.provider).toBe('supabase');
    expect(finding?.externalVerification?.phase).toBe('phase-3');
  });

  it('is not_applicable when there is no database usage at all', () => {
    const { fileset } = makeRepo({ 'src/index.ts': 'export const x = 1;\n' });
    const [finding] = detectLg008(fileset);
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('does NOT fire (fail) on a scoped per-env DB config with distinct values (distractor)', () => {
    const { fileset } = makeRepo({
      'lib/db.ts': SUPABASE_CLIENT,
      '.env.production': 'DATABASE_URL=postgresql://prod.example.com:5432/appdb\n',
      '.env.development': 'DATABASE_URL=postgresql://preview.example.com:5432/devdb\n',
    });
    const [finding] = detectLg008(fileset);
    // Distinct values across scopes → no provable mixing → unknown, never a fail.
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.outcome).toBe('unknown');
  });
});
