import { afterAll, describe, expect, it } from 'vitest';

import { detectLg004 } from '../../src/checks/lg004.js';
import { surfaceLg006Candidates } from '../../src/checks/lg006.js';
import { collect } from '../../src/scan/collect.js';
import { locateWebhookHandlers } from '../../src/scan/webhook.js';
import type { Fileset } from '../../src/scan/collect.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

/** Unverified (LG-004-failing) handler with NO cancellation branch. */
const UNVERIFIED_NO_CANCELLATION = `export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  await handle(event);
  return new Response('ok');
}
`;

/** Unverified (LG-004-failing) handler that DOES branch on cancellation. */
const UNVERIFIED_WITH_CANCELLATION = `export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  switch (event.type) {
    case 'customer.subscription.deleted':
      await db.orgs.update({ where: { id: event.data.object.customer }, data: { plan: 'free' } });
      break;
  }
  return new Response('ok');
}
`;

/**
 * Repo-relative paths of the handlers LG-004 actually reasoned about. Every
 * handler in these repos fails LG-004, so its evidence cites all of them —
 * which is what makes LG-004's handler set externally observable.
 */
function lg004HandlerPaths(fileset: Fileset): string[] {
  const [finding] = detectLg004(fileset);
  return [...new Set((finding?.evidence ?? []).map((e) => e.path))].sort();
}

/** Repo-relative paths LG-006 surfaced, sorted. */
function lg006HandlerPaths(fileset: Fileset): string[] {
  const candidates = surfaceLg006Candidates(fileset);
  return candidates.applicable ? [...candidates.handlerPaths].sort() : [];
}

describe('locateWebhookHandlers — the single shared webhook-handler locator', () => {
  it('returns ALL matching handlers, not just the first, in collector (path-sorted) order', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/stripe/webhook-v2/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    // `collect()` sorts by path, and the locator preserves that order (AT-23).
    expect(locateWebhookHandlers(fileset).map((f) => f.path)).toEqual([
      'app/api/stripe/webhook-v2/route.ts',
      'app/api/stripe/webhook/route.ts',
    ]);
  });

  it('locates pages/api handlers and ignores non-code and non-webhook files', () => {
    const { fileset } = makeRepo({
      'pages/api/stripe-webhook.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/upload/route.ts': 'export async function POST(req: Request) { return new Response(await req.text()); }\n',
      'docs/webhook.md': '# webhook notes\n',
      'README.md': 'webhook\n',
    });
    expect(locateWebhookHandlers(fileset).map((f) => f.path)).toEqual(['pages/api/stripe-webhook.ts']);
  });

  it('returns an empty list when the repository has no webhook handler at all', () => {
    const { fileset } = makeRepo({
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    expect(locateWebhookHandlers(fileset)).toEqual([]);
  });

  it('is deterministic: two collections of the same tree locate the same handlers in the same order', () => {
    const { root } = makeRepo({
      'app/api/stripe/webhook/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/stripe/webhook-v2/route.ts': UNVERIFIED_NO_CANCELLATION,
    });
    const first = locateWebhookHandlers(collect(root)).map((f) => f.path);
    const second = locateWebhookHandlers(collect(root)).map((f) => f.path);
    expect(first).toEqual(second);
  });
});

describe('locator guard — LG-004 and LG-006 resolve the SAME handler set', () => {
  it('agrees on a single-handler repository', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/health/route.ts': "export async function GET() { return new Response('ok'); }\n",
    });
    const located = locateWebhookHandlers(fileset)
      .map((f) => f.path)
      .sort();
    expect(located).toEqual(['app/api/stripe/webhook/route.ts']);
    expect(lg004HandlerPaths(fileset)).toEqual(located);
    expect(lg006HandlerPaths(fileset)).toEqual(located);
  });

  it('agrees on a MULTI-handler repository — neither check stops at the first match', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/stripe/webhook-v2/route.ts': UNVERIFIED_NO_CANCELLATION,
      'pages/api/legacy-webhook.ts': UNVERIFIED_NO_CANCELLATION,
    });
    const located = locateWebhookHandlers(fileset)
      .map((f) => f.path)
      .sort();
    expect(located).toHaveLength(3);
    expect(lg004HandlerPaths(fileset)).toEqual(located);
    expect(lg006HandlerPaths(fileset)).toEqual(located);
  });

  it('agrees that a repository with no handler has an empty set (both check not_applicable)', () => {
    const { fileset } = makeRepo({ 'app/api/health/route.ts': 'export function GET() {}\n' });
    expect(locateWebhookHandlers(fileset)).toEqual([]);
    expect(detectLg004(fileset)[0]?.outcome).toBe('not_applicable');
    expect(surfaceLg006Candidates(fileset).applicable).toBe(false);
  });
});

describe('LG-006 all-handlers semantics (the .filter() reconciliation)', () => {
  it('sees a cancellation branch in a handler that is NOT first in the deterministic order', () => {
    // `app/api/stripe/webhook-v2/route.ts` sorts BEFORE `.../webhook/route.ts`
    // ('-' < '/'), so a `.find()`-based locator would only ever inspect the
    // v2 handler and miss the branch that lives in the other file.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/stripe/webhook/route.ts': UNVERIFIED_WITH_CANCELLATION,
    });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.handlerPaths[0]).toBe('app/api/stripe/webhook-v2/route.ts');
    expect(candidates.hasCancellationBranch).toBe(true);
    // No deterministic must-fail fact when the branch exists anywhere.
    expect(candidates.request.supportingFacts ?? []).toHaveLength(0);
  });

  it('unions handled event names and surfaces an excerpt for every located handler', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': UNVERIFIED_WITH_CANCELLATION,
      'app/api/stripe/webhook/route.ts':
        "export async function POST(req: Request) {\n  const e = JSON.parse(await req.text());\n  if (e.type === 'checkout.session.completed') await grant(e);\n  return new Response('ok');\n}\n",
    });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.handledEvents).toContain('customer.subscription.deleted');
    expect(candidates.handledEvents).toContain('checkout.session.completed');
    // Sorted and deduplicated.
    expect([...candidates.handledEvents].sort()).toEqual(candidates.handledEvents);
    for (const path of candidates.handlerPaths) {
      expect(candidates.request.excerpts.some((e) => e.path === path)).toBe(true);
    }
  });

  it('records the fail-establishing fact only when NO located handler has a branch', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook-v2/route.ts': UNVERIFIED_NO_CANCELLATION,
      'app/api/stripe/webhook/route.ts': UNVERIFIED_NO_CANCELLATION,
    });
    const candidates = surfaceLg006Candidates(fileset);
    expect(candidates.applicable).toBe(true);
    if (!candidates.applicable) return;
    expect(candidates.hasCancellationBranch).toBe(false);
    const facts = candidates.request.supportingFacts ?? [];
    expect(facts).toHaveLength(1);
    expect(facts[0]?.establishesVerdict).toBe('fail');
  });
});
