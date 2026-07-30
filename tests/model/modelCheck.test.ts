import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { lg005ModelCheck } from '../../src/checks/lg005.js';
import { isLg006SettledDeterministically, lg006ModelCheck, surfaceLg006Candidates } from '../../src/checks/lg006.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8');

const HANDLER_NO_CANCELLATION = `import Stripe from 'stripe';
export async function POST(req: Request) {
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
  return new Response('ok');
}
`;

const DELEGATING = {
  'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`,
  'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'customer.subscription.deleted':
      await db.orgs.update({ where: { id: event.data.object.customer }, data: { plan: 'free' } });
      break;
  }
}
`,
};

const NO_HANDLER = { 'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n" };

describe('TRAP 2 — `isSettled` polarity, proven rather than assumed', () => {
  it('isLg006SettledDeterministically returns TRUE for the inapplicable case', () => {
    // This is the redundancy claim behind the `applicable && !settled` conjunct.
    // If it were false, a generic seam defaulting to "not settled" would ship an
    // infer call — repository text off-process — on every repo with no webhook
    // handler.
    const { fileset } = makeRepo(NO_HANDLER);
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(false);
    expect(isLg006SettledDeterministically(candidates)).toBe(true);
  });

  it('the conjunct is therefore redundant: `applicable && !settled` ≡ `!settled`', () => {
    for (const files of [NO_HANDLER, DELEGATING, { 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION }]) {
      const { fileset } = makeRepo(files);
      const c = surfaceLg006Candidates(fileset);
      const settled = isLg006SettledDeterministically(c);
      expect(c.applicable && !settled, JSON.stringify(Object.keys(files))).toBe(!settled);
    }
  });
});

describe('DC-1 — both checks are ModelChecks, and settledness is a withheld request', () => {
  it('LG-006 withholds its request when no handler exists (not applicable)', () => {
    const { fileset } = makeRepo(NO_HANDLER);
    expect(lg006ModelCheck.surface(fileset).request).toBeUndefined();
  });

  it('LG-006 withholds its request when the deterministic layer settled a fail', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const surfaced = lg006ModelCheck.surface(fileset);
    expect(surfaced.request).toBeUndefined();
    // ...and it still emits the settled deterministic finding.
    const [finding] = surfaced.interpret();
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
  });

  it('LG-006 exposes a request only when the model is genuinely needed', () => {
    const { fileset } = makeRepo(DELEGATING);
    expect(lg006ModelCheck.surface(fileset).request?.checkId).toBe('LG-006');
  });

  it('LG-005 withholds its request only when no handler exists', () => {
    expect(lg005ModelCheck.surface(makeRepo(NO_HANDLER).fileset).request).toBeUndefined();
    expect(lg005ModelCheck.surface(makeRepo(DELEGATING).fileset).request?.checkId).toBe('LG-005');
  });

  it('a judgment supplied for a SETTLED check is ignored, not believed', () => {
    // The seam tells callers not to ask, but `interpret` enforces it
    // independently — a caller that ignores the contract still cannot make a
    // model override a settled deterministic signal (§4.3).
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const surfaced = lg006ModelCheck.surface(fileset);
    const settledFinding = surfaced.interpret()[0];
    const withJudgment = surfaced.interpret({
      answer: { verdict: 'pass', rationale: 'r' },
      confidence: 0.9,
      citedEvidence: [],
    })[0];
    expect(withJudgment).toEqual(settledFinding);
  });

  it('scanWithModel holds no per-check inline surface→interpret triple', () => {
    const src = read('src/scan/scanner.ts');
    // The composition is a loop over one fixed-order array, not a branch per
    // check — which is what keeps adding a detector from editing the scanner's
    // control flow.
    expect(src).toContain('for (const check of MODEL_CHECKS)');
    expect(src).not.toMatch(/surfaceLg00\d+Candidates/);
    expect(src).not.toMatch(/interpretLg00\d+/);
    // A CALL, not the word — scanner.ts documents the prohibition in prose.
    expect(src).not.toMatch(/Promise\.all\s*\(/);
  });

  it('the seam is types-only and never imports from src/checks/', () => {
    const src = read('src/model/modelCheck.ts');
    expect(src).not.toMatch(/from '\.\.\/checks\//);
    expect(src).not.toMatch(/^(?!.*\btype\b).*\bimport\s+\{/m);
  });

  it('DC-5 — the disclosure helpers exist once, in surface.ts', () => {
    expect(read('src/scan/surface.ts')).toContain('export function elisionDisclosure');
    expect(read('src/scan/surface.ts')).toContain('export function withheldNonSourceDisclosure');
    for (const f of ['src/checks/lg005.ts', 'src/checks/lg006.ts']) {
      expect(read(f), f).not.toMatch(/^function elisionDisclosure/m);
      expect(read(f), f).not.toMatch(/^function withheldNonSourceDisclosure/m);
    }
  });
});
