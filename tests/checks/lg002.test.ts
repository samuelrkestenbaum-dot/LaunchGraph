import { afterAll, describe, expect, it } from 'vitest';

import { detectLg002 } from '../../src/checks/lg002.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const FAKE_LIVE_KEY = 'sk_live_EXAMPLEnotreal';
const FAKE_TEST_KEY = 'sk_test_EXAMPLEnotreal';

describe('LG-002 — Stripe test/live key mixing', () => {
  it('fails when a live secret key is committed in source, with redacted evidence', () => {
    const { fileset } = makeRepo({
      'lib/stripe.ts': `import Stripe from 'stripe';\nexport const stripe = new Stripe('${FAKE_LIVE_KEY}');\n`,
    });
    const [finding] = detectLg002(fileset);
    expect(finding?.checkId).toBe('LG-002');
    expect(finding?.outcome).toBe('fail');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.evidence.some((e) => e.path === 'lib/stripe.ts')).toBe(true);
    // §5 invariant / SEC-4: the raw key must not survive into the excerpt.
    for (const e of finding?.evidence ?? []) {
      expect(e.excerpt).not.toContain('EXAMPLEnotreal');
    }
  });

  it('fails when a test key is mapped into production configuration', () => {
    const { fileset } = makeRepo({
      '.env.production': `STRIPE_SECRET_KEY=${FAKE_TEST_KEY}\n`,
      'lib/stripe.ts': "import Stripe from 'stripe';\n",
    });
    const [finding] = detectLg002(fileset);
    expect(finding?.outcome).toBe('fail');
    expect(finding?.evidence.some((e) => e.path === '.env.production')).toBe(true);
  });

  it('does NOT fire on a test key living in .env.development (distractor)', () => {
    const { fileset } = makeRepo({
      '.env.development': `STRIPE_SECRET_KEY=${FAKE_TEST_KEY}\n`,
      'lib/stripe.ts': "import Stripe from 'stripe';\n",
    });
    const [finding] = detectLg002(fileset);
    expect(finding?.outcome).toBe('pass');
  });

  it('is not_applicable when there is no Stripe usage at all', () => {
    const { fileset } = makeRepo({ 'src/index.ts': 'export const x = 1;\n' });
    const [finding] = detectLg002(fileset);
    expect(finding?.outcome).toBe('not_applicable');
  });
});
