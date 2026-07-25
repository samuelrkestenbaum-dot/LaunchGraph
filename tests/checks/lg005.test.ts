import { afterAll, describe, expect, it } from 'vitest';

import { getCheck } from '../../src/checks/registry.js';
import { interpretLg005, surfaceLg005Candidates } from '../../src/checks/lg005.js';
import type { Lg005Applicable } from '../../src/checks/lg005.js';
import { FakeModelClient } from '../../src/model/fakeClient.js';
import type { InferenceRequest, InferenceResult } from '../../src/model/client.js';
import { collect } from '../../src/scan/collect.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

/** A verified handler that delegates event handling out of the route file. */
const HANDLER_DELEGATING = `import Stripe from 'stripe';
import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`;

/** A handler with no idempotency guard anywhere in sight. */
const HANDLER_NO_GUARD = `export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  await grantEntitlement(event.data.object.customer);
  return new Response('ok');
}
`;

/** The canonical CORRECT guard: a dedup helper keyed on the Stripe event id. */
const IDEMPOTENCY_HELPER = `import { db } from './db';

export async function alreadyProcessed(eventId: string): Promise<boolean> {
  const existing = await db.processedEvents.findUnique({ where: { id: eventId } });
  if (existing) return true;
  await db.processedEvents.create({ data: { id: eventId } });
  return false;
}
`;

function judgment(verdict: 'fail' | 'pass', confidence: number) {
  return (r: InferenceRequest): InferenceResult => ({
    answer: { verdict, rationale: 'test rationale' },
    confidence,
    citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
  });
}

async function judge(c: Lg005Applicable, verdict: 'fail' | 'pass', confidence: number): Promise<InferenceResult> {
  return new FakeModelClient({ 'LG-005': judgment(verdict, confidence) }).infer(c.request);
}

describe('LG-005 surface (Layer D) — deterministic CANDIDATES, never a verdict', () => {
  it('DC-5: attaches NO supporting fact carrying establishesVerdict, on any repo shape', () => {
    const shapes: Array<[string, Record<string, string>]> = [
      ['no guard anywhere', { 'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD }],
      [
        'guard in a lib module',
        { 'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING, 'lib/idempotency.ts': IDEMPOTENCY_HELPER },
      ],
      [
        'guard only in a .sql migration',
        {
          'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD,
          'migrations/001.sql': 'CREATE UNIQUE INDEX ON processed_events (event_id);\n',
        },
      ],
    ];
    for (const [label, files] of shapes) {
      const { fileset } = makeRepo(files);
      const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
      const facts = candidates.request.supportingFacts ?? [];
      expect(facts.every((f) => f.establishesVerdict === undefined), label).toBe(true);
    }
  });

  it('TRAP 9 direction check: the DISPROVING file is surfaced on a correct idempotent repo', () => {
    // LG-005 is the product's first pure-model blocker — `not_ready` can rest
    // on a model judgment alone. The one structural defence is that the model
    // must actually be shown the code that would change its mind.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING,
      'lib/idempotency.ts': IDEMPOTENCY_HELPER,
    });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    expect(candidates.request.excerpts.some((e) => e.path === 'lib/idempotency.ts')).toBe(true);
  });

  it('TRAP 9 direction check: the same holds when the guard lives in a .mts module', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING,
      'lib/idempotency.mts': IDEMPOTENCY_HELPER,
    });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    expect(candidates.request.excerpts.some((e) => e.path === 'lib/idempotency.mts')).toBe(true);
  });

  it('surfaces every located handler whole, and is the third consumer of the shared locator', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD,
      'app/api/stripe/webhook-v2/route.ts': HANDLER_NO_GUARD,
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    expect(candidates.handlerPaths).toEqual([
      'app/api/stripe/webhook-v2/route.ts',
      'app/api/stripe/webhook/route.ts',
    ]);
    for (const p of candidates.handlerPaths) {
      expect(candidates.request.excerpts.some((e) => e.path === p)).toBe(true);
    }
  });

  it('DC-6: never surfaces a non-source file, even one that carries the guard', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD,
      'migrations/001.sql': 'CREATE UNIQUE INDEX ON processed_events (event_id);\n',
      'prisma/schema.prisma': 'model ProcessedEvent { id String @id }\n',
      'README.md': 'We dedupe on event.id\n',
      '.env.production': 'X=1\n',
    });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const allowed = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts']);
    for (const e of candidates.request.excerpts) {
      expect(allowed.has(e.path.split('.').pop() ?? ''), e.path).toBe(true);
    }
  });

  it('discloses withheld non-source files in the QUESTION, naming the count', () => {
    // The canonical correct guard for LG-005 is frequently a unique constraint
    // in a migration — precisely what the SEC-5 bound cannot show the model.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD,
      'migrations/001.sql': 'CREATE UNIQUE INDEX ON processed_events (event_id);\n',
    });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    expect(candidates.request.question).toMatch(/1 non-source file/i);
    expect(candidates.request.question).toMatch(/unknown rather than/i);
  });

  it('returns not_applicable when there is no webhook handler at all', () => {
    const { fileset } = makeRepo({ 'app/api/health/route.ts': 'export function GET() {}\n' });
    expect(surfaceLg005Candidates(fileset).applicable).toBe(false);
  });

  it('is deterministic across two collections of the same tree (AT-23)', () => {
    const { root } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING,
      'lib/idempotency.ts': IDEMPOTENCY_HELPER,
    });
    const a = surfaceLg005Candidates(collect(root)) as Lg005Applicable;
    const b = surfaceLg005Candidates(collect(root)) as Lg005Applicable;
    expect(a.request).toEqual(b.request);
  });
});

describe('LG-005 interpret', () => {
  it('emits not_applicable (non-external) when no handler was surfaced', () => {
    const { fileset } = makeRepo({ 'app/api/health/route.ts': 'export function GET() {}\n' });
    const [finding] = interpretLg005(surfaceLg005Candidates(fileset));
    expect(finding?.checkId).toBe('LG-005');
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('TRAP 3: emits unknown offline — there is NO deterministic settled fail', () => {
    // "No idempotency signal anywhere ⇒ blocker" is falsifiable on correct
    // repositories: a state-reconciliation handler is idempotent by
    // construction and carries no event.id, upsert or dedup marker at all.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  await db.query("UPDATE subscriptions SET status=$1 WHERE stripe_sub_id=$2", [event.data.object.status, event.data.object.id]);
  return new Response('ok');
}
`,
    });
    const [finding] = interpretLg005(surfaceLg005Candidates(fileset));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(finding?.outcome).not.toBe('fail');
  });

  it('emits unknown "model layer disabled" with no judgment and no external marker (AT-27)', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD });
    const [finding] = interpretLg005(surfaceLg005Candidates(fileset));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(finding?.externalVerification).toBeUndefined();
    expect(finding?.evidence.length).toBeGreaterThan(0);
  });

  it('emits an inferred blocker FAIL from a fake fail judgment, severity from the registry, capped ≤ 0.9', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const [finding] = interpretLg005(candidates, await judge(candidates, 'fail', 0.85));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('inferred');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-005')?.severityCeiling);
    expect(finding?.confidence).toBe(0.85);
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('caps an over-confident judgment at 0.9 and never emits confirmed', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const [finding] = interpretLg005(candidates, await judge(candidates, 'fail', 0.99));
    expect(finding?.confidence).toBe(0.9);
    expect(finding?.classification).not.toBe('confirmed');
  });

  it('emits an inferred PASS from a fake pass judgment', async () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING,
      'lib/idempotency.ts': IDEMPOTENCY_HELPER,
    });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const [finding] = interpretLg005(candidates, await judge(candidates, 'pass', 0.8));
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('inferred');
  });

  it('keeps a low-confidence fail inferred at the detector level (the engine reclassifies)', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_GUARD });
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const [finding] = interpretLg005(candidates, await judge(candidates, 'fail', 0.5));
    expect(finding?.classification).toBe('inferred');
    expect(finding?.classification).not.toBe('requires_confirmation');
  });
});

/**
 * An ordinary, CORRECT Next.js + Prisma SaaS. The route verifies and delegates,
 * `lib/events.ts` wraps handling in an idempotency guard, and
 * `lib/idempotency.ts` does a real `event.id` lookup. Everything else is
 * unremarkable CRUD whose only relevance is that `upsert` is the single most
 * common Prisma idiom — and is semantically unrelated to webhook idempotency.
 *
 * Path order puts every `app/**` file before every `lib/**` file, so a
 * path-ordered cap fills entirely with CRUD and discards BOTH files that would
 * exonerate the repository. The sampler is biased, not random: it
 * preferentially drops the answering file.
 */
const REALISTIC_CORRECT_REPO: Record<string, string> = {
  'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`,
  'app/api/organizations/route.ts': 'export async function POST(r: Request) { await prisma.organization.upsert({ where: { id }, update: {}, create: {} }); }\n',
  'app/api/profile/route.ts': 'export async function POST(r: Request) { await prisma.profile.upsert({ where: { id }, update: {}, create: {} }); }\n',
  'app/api/settings/route.ts': 'export async function POST(r: Request) { await prisma.settings.upsert({ where: { id }, update: {}, create: {} }); }\n',
  'app/api/users/route.ts': 'export async function POST(r: Request) { await prisma.user.upsert({ where: { id }, update: {}, create: {} }); }\n',
  'app/api/waitlist/route.ts': 'export async function POST(r: Request) { await prisma.waitlist.upsert({ where: { id }, update: {}, create: {} }); }\n',
  'lib/events.ts': `import { withIdempotency } from './idempotency';
export async function handleStripeEvent(event: any) {
  await withIdempotency(event, async () => {
    if (event.type === 'checkout.session.completed') await grant(event);
  });
}
`,
  'lib/idempotency.ts': `import { db } from './db';
export async function withIdempotency(event: any, run: () => Promise<void>): Promise<void> {
  const seen = await db.processedEvents.findUnique({ where: { id: event.id } });
  if (seen) return;
  await run();
  await db.processedEvents.create({ data: { id: event.id } });
}
`,
};

describe('TRAP 9 — the cap must not preferentially discard the answering file', () => {
  const surfacedPaths = (files: Record<string, string>): string[] => {
    const { fileset } = makeRepo(files);
    const c = surfaceLg005Candidates(fileset) as Lg005Applicable;
    return c.request.excerpts.map((e) => e.path);
  };

  it('surfaces the real idempotency guard on a realistic repo where the cap BINDS', () => {
    // This is the hazard the minimal two-file direction check never exercised:
    // there, the cap never bound. Here 7 non-handler files match and the cap is
    // 5, so ranking decides whether the model can possibly answer correctly.
    const paths = surfacedPaths(REALISTIC_CORRECT_REPO);
    expect(paths).toContain('lib/idempotency.ts');
    expect(paths).toContain('lib/events.ts');
  });

  it('does NOT reach not_ready on this correct repo, given a model that reasons from what it sees', async () => {
    // The fake answers from the surfaced excerpts rather than from a script, so
    // an incomplete surface produces a wrong verdict exactly as a real model
    // would. This is the false blocker, made directly observable.
    const { fileset } = makeRepo(REALISTIC_CORRECT_REPO);
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const readsTheSurface = (r: InferenceRequest): InferenceResult => {
      const sawGuard = r.excerpts.some((e) => /\b(?:event|evt)\.id\b|idempoten/i.test(e.excerpt));
      return {
        answer: { verdict: sawGuard ? 'pass' : 'fail', rationale: 'from the surfaced excerpts' },
        confidence: 0.85,
        citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
      };
    };
    const judgmentResult = await new FakeModelClient({ 'LG-005': readsTheSurface }).infer(candidates.request);
    const [finding] = interpretLg005(candidates, judgmentResult);
    expect(finding?.outcome).toBe('pass');
    expect(finding?.outcome).not.toBe('fail');
  });

  it('still surfaces generic ORM matches, and discloses what the cap dropped', () => {
    const { fileset } = makeRepo(REALISTIC_CORRECT_REPO);
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const paths = candidates.request.excerpts.map((e) => e.path);
    // Handler + cap of 5.
    expect(paths).toHaveLength(6);
    expect(paths.filter((p) => p.startsWith('app/api/') && !p.includes('webhook')).length).toBeGreaterThan(0);
    expect(candidates.request.question).toMatch(/2 further source file/i);
  });

  it('preserves path order WITHIN a preference band (AT-23)', () => {
    const { fileset } = makeRepo(REALISTIC_CORRECT_REPO);
    const candidates = surfaceLg005Candidates(fileset) as Lg005Applicable;
    const generic = candidates.request.excerpts
      .map((e) => e.path)
      .filter((p) => p.startsWith('app/api/') && !p.includes('webhook'));
    expect([...generic].sort()).toEqual(generic);
  });
});
