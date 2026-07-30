import { afterAll, describe, expect, it } from 'vitest';

import { getCheck } from '../../src/checks/registry.js';
import { interpretLg006, surfaceLg006Candidates } from '../../src/checks/lg006.js';
import type { Lg006Applicable } from '../../src/checks/lg006.js';
import { FakeModelClient } from '../../src/model/fakeClient.js';
import { buildUntrustedDataEnvelope } from '../../src/model/client.js';
import type { InferenceRequest, InferenceResult } from '../../src/model/client.js';
import { collect } from '../../src/scan/collect.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

/** A handler whose cancellation branch downgrades entitlement. */
const HANDLER_WITH_DOWNGRADE = `import Stripe from 'stripe';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  switch (event.type) {
    case 'customer.subscription.deleted':
      await db.orgs.update({ where: { id: event.data.object.customer }, data: { plan: 'free', entitlement: 'revoked' } });
      break;
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
  return new Response('ok');
}
`;

/** A handler with NO cancellation branch at all. */
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

/**
 * The dominant Next.js/Stripe shape: the route verifies and delegates, and the
 * cancellation branch lives in a lib module. A genuine Layer-M case — the
 * branch exists, the downgrade is unproven, and the model is legitimately
 * asked. This is what the judgment-driven tests below are based on, because
 * a handler-only-no-branch repo is now settled deterministically and never
 * reaches the model at all.
 */
const DELEGATING_REPO: Record<string, string> = {
  'app/api/stripe/webhook/route.ts': `import Stripe from 'stripe';
import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
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
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
}
`,
};

/** Build a scripted judgment that cites the request's first surfaced excerpt. */
function judgment(verdict: 'fail' | 'pass', confidence: number) {
  return (r: InferenceRequest): InferenceResult => ({
    answer: { verdict, rationale: 'test rationale' },
    confidence,
    citedEvidence: [{ path: r.excerpts[0]!.path, startLine: r.excerpts[0]!.startLine }],
  });
}

async function judge(candidates: Lg006Applicable, verdict: 'fail' | 'pass', confidence: number): Promise<InferenceResult> {
  const fake = new FakeModelClient({ 'LG-006': judgment(verdict, confidence) });
  return fake.infer(candidates.request);
}

describe('LG-006 surface (Layer D)', () => {
  it('surfaces a handler with a cancellation branch, enumerating events, with no no-branch fact', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.handlerPaths).toEqual(['app/api/stripe/webhook/route.ts']);
    expect(candidates.hasCancellationBranch).toBe(true);
    expect(candidates.handledEvents).toContain('customer.subscription.deleted');
    expect(candidates.handledEvents).toContain('checkout.session.completed');
    expect(candidates.request.excerpts.length).toBeGreaterThan(0);
    expect(candidates.request.excerpts.every((e) => candidates.handlerPaths.includes(e.path))).toBe(true);
    // A present cancellation branch means no deterministic "must-fail" fact.
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
  });

  it('surfaces a handler WITHOUT a cancellation branch and records a fail-establishing supporting fact', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.hasCancellationBranch).toBe(false);
    const facts = candidates.request.supportingFacts ?? [];
    expect(facts).toHaveLength(1);
    expect(facts[0]?.establishesVerdict).toBe('fail');
  });

  it('returns not_applicable when there is no webhook handler at all', () => {
    const { fileset } = makeRepo({
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(false);
  });
});

describe('LG-006 interpret', () => {
  it('emits not_applicable (non-external) when no handler was surfaced', () => {
    const { fileset } = makeRepo({ 'app/api/health/route.ts': 'export function GET() {}\n' });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.checkId).toBe('LG-006');
    expect(finding?.outcome).toBe('not_applicable');
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('emits unknown "model layer disabled" with no judgment and no external marker (AT-27)', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
    expect(finding?.externalVerification).toBeUndefined();
    expect(finding?.evidence.length).toBeGreaterThan(0);
  });

  it('emits a DETERMINISTIC confirmed blocker FAIL when NO handler has a cancellation branch (§4.3)', () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates);
    // A fully missing branch is a Layer-D signal. Routing it through the model
    // layer would silently substitute model judgment for a required
    // deterministic signal, which §4.3 forbids.
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
    expect(finding?.confidence).toBe(1);
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-006')?.severityCeiling);
    expect(finding?.summary).not.toContain('Model layer disabled');
    // LG-006 is non-external (§3) on every branch.
    expect(finding?.externalVerification).toBeUndefined();
  });

  it('carries a code excerpt AND an absence entry per handler on the deterministic fail (AT-26, §5)', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': HANDLER_NO_CANCELLATION,
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates);
    expect(finding?.outcome).toBe('fail');
    const evidence = finding?.evidence ?? [];
    expect(evidence.length).toBeGreaterThan(0);
    for (const path of candidates.handlerPaths) {
      expect(evidence.some((e) => e.path === path && e.kind === 'code')).toBe(true);
      expect(evidence.some((e) => e.path === path && e.kind === 'absence')).toBe(true);
    }
    // Absence evidence must carry a non-empty note (§5).
    for (const e of evidence.filter((x) => x.kind === 'absence')) {
      expect(e.note ?? '').not.toBe('');
    }
  });

  it('does NOT emit the deterministic fail when the handler DELEGATES and the branch lives elsewhere', () => {
    // The dominant Next.js/Stripe idiom: the route verifies and delegates, and
    // the switch lives in a lib module. Gating the blocker on handler-FILE
    // absence would emit confirmed/1.0 `not_ready` — the product's most
    // unappealable output, with no override mechanism in Phase 1 (§7) — on a
    // repository that handles cancellation correctly.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`,
      'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'customer.subscription.deleted':
      await revokeAccess(event.data.object.customer);
      break;
  }
}
`,
    });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
  });

  it('still emits the deterministic fail when NO file in the repository handles cancellation', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  await handleStripeEvent(JSON.parse(await req.text()));
  return new Response('ok');
}
`,
      'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
}
`,
    });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('confirmed');
  });

  it('does NOT emit the deterministic fail when a NON-FIRST handler carries the branch (no false blocker)', () => {
    // `webhook-v2` sorts before `webhook/` ('-' < '/'), so a first-match locator
    // would see only the branchless handler and manufacture a blocker on a repo
    // that actually handles cancellation.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': HANDLER_NO_CANCELLATION,
      'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE,
    });
    const [finding] = interpretLg006(surfaceLg006Candidates(fileset));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toContain('Model layer disabled');
  });

  it('emits an inferred blocker FAIL from a fake fail judgment, severity from the registry, capped ≤ 0.9', async () => {
    // H-003 repair: re-based from DELEGATING_REPO onto an inline-branch
    // handler. The delegating handler carries a local runtime import, so the
    // delegated-opacity guard now demotes its model fail to unknown; the
    // inferred blocker legitimately flows only where the cancellation path is
    // inline. Assertions are unchanged.
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.85));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('inferred');
    expect(finding?.severity).toBe('blocker');
    expect(finding?.severity).toBe(getCheck('LG-006')?.severityCeiling);
    expect(finding?.confidence).toBe(0.85);
    expect(finding?.confidence).toBeLessThanOrEqual(0.9);
    expect(finding?.evidence.some((e) => candidates.handlerPaths.includes(e.path))).toBe(true);
  });

  it('caps an over-confident fail judgment at 0.9', async () => {
    // H-003: inline-branch repo for the same reason as the test above.
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.99));
    expect(finding?.confidence).toBe(0.9);
  });

  it('emits an inferred PASS from a fake pass judgment', async () => {
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'pass', 0.8));
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('inferred');
  });

  it('keeps a low-confidence fail judgment inferred at the detector level (engine reclassifies, not the detector)', async () => {
    // H-003: inline-branch repo for the same reason as the tests above.
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.5));
    expect(finding?.classification).toBe('inferred');
    expect(finding?.classification).not.toBe('requires_confirmation');
    expect(finding?.confidence).toBe(0.5);
  });

  it('§4.3: a supplied judgment can NEVER override the settled deterministic case', async () => {
    // The hoist must be unconditional. Gating it on `judgment === undefined`
    // would make the suite green while reinstating the exact substitution §4.3
    // forbids — a model deciding a question the deterministic layer settled.
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const offline = interpretLg006(candidates)[0];
    for (const verdict of ['pass', 'fail'] as const) {
      const [withJudgment] = interpretLg006(candidates, await judge(candidates, verdict, 0.9));
      expect(withJudgment?.outcome, verdict).toBe('fail');
      expect(withJudgment?.classification, verdict).toBe('confirmed');
      expect(withJudgment?.confidence, verdict).toBe(1);
      // T6: byte-identical to the offline finding, whatever the model said.
      expect(withJudgment, verdict).toEqual(offline);
    }
  });
});

describe('LG-006 surfacing contract (C3) — the model sees what the handler delegates to', () => {
  it('T1/DC-1: surfaces the delegated module carrying the branch, windowed and noted', () => {
    const { fileset } = makeRepo(DELEGATING_REPO);
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const delegated = candidates.request.excerpts.find((e) => e.path === 'lib/events.ts');
    expect(delegated).toBeDefined();
    expect(delegated?.kind).toBe('code');
    expect((delegated?.note ?? '').length).toBeGreaterThan(0);
    expect(delegated?.excerpt).toContain('customer.subscription.deleted');
    // The handler is still surfaced whole, and remains the finding anchor.
    expect(candidates.request.excerpts.some((e) => e.path === 'app/api/stripe/webhook/route.ts')).toBe(true);
    // TRAP 7: widened excerpts must NOT leak into the finding's evidence anchors.
    expect(candidates.anchors.every((a) => candidates.handlerPaths.includes(a.path))).toBe(true);
  });

  it('T2/DC-6: NEVER surfaces a non-code file, even when it names the event', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'README.md': '# Billing\n\nWe handle customer.subscription.deleted by revoking access.\n',
      'CLAUDE.md': 'Agent note: customer.subscription.deleted downgrades the org.\n',
      'docs/billing.mdx': 'customer.subscription.deleted\n',
      'db/migrate.sql': "-- customer.subscription.deleted is handled by the app\n",
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    for (const e of candidates.request.excerpts) {
      expect(e.path.endsWith('.md'), e.path).toBe(false);
      expect(e.path.endsWith('.mdx'), e.path).toBe(false);
      expect(e.path.endsWith('.sql'), e.path).toBe(false);
    }
    expect(candidates.request.excerpts.every((e) => candidates.handlerPaths.includes(e.path))).toBe(true);
  });

  it('T7/DC-7: additional code files are path-sorted, capped at 5, and the elision is disclosed', () => {
    const signal = "export const t = 'customer.subscription.deleted';\n";
    const files: Record<string, string> = { 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION };
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) files[`lib/${n}.ts`] = signal;
    const { fileset } = makeRepo(files);
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const extra = candidates.request.excerpts.filter((e) => !candidates.handlerPaths.includes(e.path));
    expect(extra).toHaveLength(5);
    expect(extra.map((e) => e.path)).toEqual(['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts', 'lib/e.ts']);
    expect([...extra.map((e) => e.path)].sort()).toEqual(extra.map((e) => e.path));
    // The cap elided lib/f.ts and lib/g.ts — that must be disclosed, not silent.
    expect(extra[extra.length - 1]?.note ?? '').toMatch(/2 (more|additional)/);
  });

  it('T7/DC-7: surfacing is deterministic across two collections of the same tree', () => {
    const { root } = makeRepo(DELEGATING_REPO);
    const a = surfaceLg006Candidates(collect(root)) as Lg006Applicable;
    const b = surfaceLg006Candidates(collect(root)) as Lg006Applicable;
    expect(a.request.excerpts).toEqual(b.request.excerpts);
  });

  it('windows a large delegated file around the first match rather than surfacing it whole', () => {
    const filler = Array.from({ length: 200 }, (_, i) => `// filler line ${i}`).join('\n');
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'lib/events.ts': `${filler}\ncase 'customer.subscription.deleted':\n${filler}\n`,
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const delegated = candidates.request.excerpts.find((e) => e.path === 'lib/events.ts');
    expect(delegated).toBeDefined();
    expect(delegated!.endLine - delegated!.startLine).toBeLessThanOrEqual(40);
    expect(delegated?.excerpt).toContain('customer.subscription.deleted');
  });

  it('retires the handler-scoped fact for a code-scoped one, still exactly one, still fail-establishing', () => {
    // Prose-only signal: no CODE file handles cancellation, so the fact is live
    // and a model that says `pass` is contradicting a claim that is TRUE.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'README.md': 'We handle customer.subscription.deleted somewhere.\n',
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const facts = candidates.request.supportingFacts ?? [];
    expect(facts).toHaveLength(1);
    expect(facts[0]?.id).toBe('fact:lg006.no-code-cancellation-signal');
    expect(facts[0]?.establishesVerdict).toBe('fail');
    expect(facts[0]?.statement).toMatch(/non-code/i);
  });

  it('emits NO fact when a code file elsewhere carries the signal (the delegating case is honest)', () => {
    const { fileset } = makeRepo(DELEGATING_REPO);
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
  });

  it('names the surfaced delegated modules in the question put to the model', () => {
    const { fileset } = makeRepo(DELEGATING_REPO);
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect(candidates.request.question).toMatch(/module|file/i);
  });

  it('discloses the elision in the QUESTION, which is what actually reaches the model', () => {
    // The SEC-5 envelope transmits only each excerpt's locator and text —
    // `note` never reaches the model — so a note-only disclosure would be
    // invisible at the one place it matters.
    const signal = "export const t = 'customer.subscription.deleted';\n";
    const files: Record<string, string> = { 'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION };
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) files[`lib/${n}.ts`] = signal;
    const { fileset } = makeRepo(files);
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const envelope = buildUntrustedDataEnvelope(candidates.request.excerpts);
    expect(envelope).not.toMatch(/not surfaced|NOT surfaced/);
    expect(candidates.request.question).toContain('2 further code file(s)');
    expect(candidates.request.question).toMatch(/not evidence that none exists/i);
    // Honest about the cap: it must NOT argue that many mentions imply the
    // repository handles cancellation — five mentions can all be UI copy.
    expect(candidates.request.question).not.toMatch(/plainly handles|clearly handles/i);
  });

  it('adds NO completeness disclosure when nothing was elided', () => {
    const { fileset } = makeRepo(DELEGATING_REPO);
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect(candidates.request.question).not.toMatch(/NOTE ON COMPLETENESS/);
  });
});

/**
 * H-003 repro shape: the handler names the cancellation branch itself (so the
 * repo is NOT settled deterministically) but delegates the actual downgrade
 * via a LOCAL runtime import to a lib module that performs it WITHOUT naming
 * any cancellation event. The conjunctive `selects` predicate therefore
 * excludes the delegate from the surface, zero files match, and no elision
 * disclosure transmits — the model judges a surface that cannot show the
 * downgrade. Helper deliberately in `lib/`, NEVER under a webhook-ish `/api/`
 * path: there it would be located as a HANDLER and arm the guard through its
 * own import, making the repro vacuous (the H-001 standing lesson).
 */
const HANDLER_DELEGATING_DOWNGRADE = `import Stripe from 'stripe';
import { applyPlanChange } from '../../../../lib/plan-state';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  switch (event.type) {
    case 'customer.subscription.deleted':
      await applyPlanChange(event.data.object.customer);
      break;
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
  return new Response('ok');
}
`;

/** The delegate: a real downgrade, with no cancellation event name in sight. */
const MARKERLESS_DOWNGRADE_HELPER = `import { db } from './db';
export async function applyPlanChange(customerId: string): Promise<void> {
  await db.orgs.update({ where: { id: customerId }, data: { plan: 'free', entitlement: 'revoked' } });
}
`;

describe('H-003 — the LG-006 delegated-opacity guard (asymmetric; inferred-fail only)', () => {
  const delegatedDowngradeRepo = (): Record<string, string> => ({
    'app/api/stripe/webhook/route.ts': HANDLER_DELEGATING_DOWNGRADE,
    'lib/plan-state.ts': MARKERLESS_DOWNGRADE_HELPER,
  });

  it('repro SHAPE PROOF: the markerless delegate is ABSENT from the surface, and nothing discloses it', () => {
    const { fileset } = makeRepo(delegatedDowngradeRepo());
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const paths = candidates.request.excerpts.map((e) => e.path);
    // The delegate carries no cancellation event name, so `selects` excludes it...
    expect(paths).not.toContain('lib/plan-state.ts');
    expect(paths.every((p) => p === 'app/api/stripe/webhook/route.ts')).toBe(true);
    // ...and with zero matches, elided === 0, so no completeness disclosure
    // transmits either: the model is never told anything is missing.
    expect(candidates.request.question).not.toMatch(/NOTE ON COMPLETENESS/);
    // Not settled — the handler itself names the branch, so the model IS asked.
    expect(candidates.hasCancellationSignalAnywhere).toBe(true);
  });

  it('repro: a fake model FAIL over that opaque surface is demoted to unknown, reason disclosed', async () => {
    const { fileset } = makeRepo(delegatedDowngradeRepo());
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.85));
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.outcome).not.toBe('fail');
    expect(finding?.summary).toMatch(/local runtime import/i);
    expect(finding?.summary).toContain('app/api/stripe/webhook/route.ts');
    expect(finding?.summary).toContain('1 of 1');
  });

  it('invariance (a): a settled repo keeps the D blocker fail/confirmed even with an ARMED handler and a judgment', async () => {
    // The handler delegates through a local runtime import (armed) and NO file
    // anywhere names cancellation — the settled deterministic case. The guard
    // must be provably unreachable from the hoisted D blocker: a directly
    // supplied judgment of either verdict changes nothing.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  await handleStripeEvent(JSON.parse(await req.text()));
  return new Response('ok');
}
`,
      'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
}
`,
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const offline = interpretLg006(candidates)[0];
    for (const verdict of ['fail', 'pass'] as const) {
      const [finding] = interpretLg006(candidates, await judge(candidates, verdict, 0.85));
      expect(finding?.outcome, verdict).toBe('fail');
      expect(finding?.classification, verdict).toBe('confirmed');
      expect(finding?.confidence, verdict).toBe(1);
      expect(finding, verdict).toEqual(offline);
    }
  });

  it('invariance (b): prose-only signal + ARMED handler + fake PASS stays a contradictory fail (rule-5 path)', async () => {
    // The fail-establishing fact is live and TRUE (no code file names
    // cancellation); a model `pass` classifies contradictory and the contract
    // forces outcome `fail`. That fail is the deterministic fact winning —
    // classification `contradictory`, not `inferred` — so the guard must not
    // demote it, armed handler or not.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  await handleStripeEvent(JSON.parse(await req.text()));
  return new Response('ok');
}
`,
      'lib/events.ts': `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'checkout.session.completed':
      await grant(event);
      break;
  }
}
`,
      'README.md': 'We handle customer.subscription.deleted by revoking access.\n',
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect((candidates.request.supportingFacts ?? []).map((f) => f.id)).toEqual([
      'fact:lg006.no-code-cancellation-signal',
    ]);
    const [finding] = interpretLg006(candidates, await judge(candidates, 'pass', 0.85));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('contradictory');
  });

  it('invariance (c): a fake model PASS over the armed repro repo is untouched (asymmetric by design)', async () => {
    const { fileset } = makeRepo(delegatedDowngradeRepo());
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates, await judge(candidates, 'pass', 0.8));
    expect(finding?.outcome).toBe('pass');
    expect(finding?.classification).toBe('inferred');
  });

  it('invariance (d): offline, an ARMED handler still yields the AT-27 unknown, byte-identical summary', () => {
    const { fileset } = makeRepo(delegatedDowngradeRepo());
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const [finding] = interpretLg006(candidates);
    expect(finding?.outcome).toBe('unknown');
    expect(finding?.summary).toBe(
      'Model layer disabled (offline or unconfigured); a Stripe webhook handler was surfaced deterministically and the repository does reference subscription-cancellation handling, but whether that path reaches an entitlement downgrade was not evaluated.',
    );
    expect(finding?.evidence).toEqual(candidates.anchors.slice(0, 1));
  });

  it('positive control: an inline-cancellation handler (ZERO local runtime imports) still fails inferred', async () => {
    // The guard must not kill the detector: HANDLER_WITH_DOWNGRADE's only
    // import is the bare npm `stripe` specifier (out of class), so the
    // surfaced handler IS the cancellation path the model judged, and the
    // inferred blocker legitimately flows.
    const { fileset } = makeRepo({ 'app/api/stripe/webhook/route.ts': HANDLER_WITH_DOWNGRADE });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect(candidates.handlersWithLocalRuntimeImports).toEqual([]);
    const [finding] = interpretLg006(candidates, await judge(candidates, 'fail', 0.85));
    expect(finding?.outcome).toBe('fail');
    expect(finding?.classification).toBe('inferred');
    expect(finding?.severity).toBe('blocker');
  });
});

describe('LG-006 surface — .mts/.cts and the prose allowlist (A-S2 C1)', () => {
  /** A delegating repo whose cancellation branch lives at `ext`. */
  function delegatingWith(ext: string): Record<string, string> {
    return {
      'app/api/stripe/webhook/route.ts': `import { handleStripeEvent } from '../../../../lib/events';
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET!);
  await handleStripeEvent(event);
  return new Response('ok');
}
`,
      [`lib/events.${ext}`]: `export async function handleStripeEvent(event: any) {
  switch (event.type) {
    case 'customer.subscription.deleted':
      await db.orgs.update({ where: { id: event.data.object.customer }, data: { plan: 'free' } });
      break;
  }
}
`,
    };
  }

  for (const ext of ['mts', 'cts']) {
    it(`DC-3: surfaces lib/events.${ext} and asserts NO fail-establishing fact`, () => {
      const { fileset } = makeRepo(delegatingWith(ext));
      const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
      expect(candidates.request.excerpts.some((e) => e.path === `lib/events.${ext}`)).toBe(true);
      expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
    });
  }

  it('DC-4/TRAP 7: a .sql-only repo emits NO fact and DISCLOSES why in the question', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'migrations/001_cancel.sql':
        "-- on customer.subscription.deleted we flip the row\nUPDATE orgs SET plan='free' WHERE sub_id=$1;\n",
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    // A database migration CAN revoke access, so claiming "nothing can" is false.
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
    // Suppression alone is not enough — the reason must reach the model.
    expect(candidates.request.question).toMatch(/1 non-source file/i);
    expect(candidates.request.question).toMatch(/NOTE ON COMPLETENESS/);
    // Still never surfaced (SEC-5 bound unchanged).
    expect(candidates.request.excerpts.some((e) => e.path.endsWith('.sql'))).toBe(false);
  });

  it('DC-4/TRAP 7: a .prisma-only repo behaves the same way', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'prisma/schema.prisma': '// customer.subscription.deleted handled by trigger\nmodel Org { id String @id }\n',
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
    expect(candidates.request.question).toMatch(/1 non-source file/i);
  });

  it('DC-4/TRAP 7 (the discriminating direction): a README-only repo STILL emits the fact', () => {
    // The guard must discriminate, not be vacuous. Prose genuinely cannot
    // revoke access, so the deterministic claim remains true and live.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'README.md': 'We handle customer.subscription.deleted somewhere.\n',
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const facts = candidates.request.supportingFacts ?? [];
    expect(facts).toHaveLength(1);
    expect(facts[0]?.establishesVerdict).toBe('fail');
    // ...and the statement must no longer claim "configuration" cannot act.
    expect(facts[0]?.statement).not.toMatch(/configuration/i);
  });

  it('a repo mixing prose AND a .sql carrier suppresses the fact (the .sql dominates)', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'README.md': 'customer.subscription.deleted\n',
      'migrations/001.sql': '-- customer.subscription.deleted\n',
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
  });

  it('DC-6: no excerpt outside the surfaceable extension set, on a repo full of distractors', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER_NO_CANCELLATION,
      'lib/events.mts': "case 'customer.subscription.deleted': await revoke(e);\n",
      'README.md': 'customer.subscription.deleted\n',
      'docs/x.mdx': 'customer.subscription.deleted\n',
      'migrations/001.sql': '-- customer.subscription.deleted\n',
      'prisma/schema.prisma': '// customer.subscription.deleted\n',
      '.env.production': 'NOTE=customer.subscription.deleted\n',
    });
    const candidates = surfaceLg006Candidates(fileset) as Lg006Applicable;
    const allowed = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts']);
    for (const e of candidates.request.excerpts) {
      expect(allowed.has(e.path.split('.').pop() ?? ''), e.path).toBe(true);
    }
  });
});
