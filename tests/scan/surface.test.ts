import { afterAll, describe, expect, it } from 'vitest';

import { collect } from '../../src/scan/collect.js';
import {
  isModelSurfaceableFile,
  isProseFile,
  surfaceDelegatedCandidates,
} from '../../src/scan/surface.js';
import type { DelegatedSurfaceOptions } from '../../src/scan/surface.js';
import { locateWebhookHandlers } from '../../src/scan/webhook.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

const HANDLER = `export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  return new Response('ok');
}
`;

/** LG-006's real pair: CONJUNCTIVE selection, DISJUNCTIVE line anchor. */
const DELETED = /customer\.subscription\.deleted/;
const UPDATED = /customer\.subscription\.updated/;
const CANCELED_STATUS = /canceled|cancelled|cancel_at_period_end|cancel_at\b/;
const selectsCancellation = (content: string): boolean =>
  DELETED.test(content) || (UPDATED.test(content) && CANCELED_STATUS.test(content));
const ANCHOR = /customer\.subscription\.(?:deleted|updated)/;

function opts(overrides: Partial<DelegatedSurfaceOptions> = {}): DelegatedSurfaceOptions {
  return {
    handlers: [],
    selects: selectsCancellation,
    anchor: ANCHOR,
    cap: 5,
    windowBefore: 10,
    windowAfter: 30,
    note: 'test note.',
    signalLabel: 'cancellation signal',
    ...overrides,
  };
}

describe('isModelSurfaceableFile — the prompt-surface extension gate', () => {
  it('accepts every isCodeFile extension PLUS .mts and .cts', () => {
    for (const p of ['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.mts', 'a.cts']) {
      expect(isModelSurfaceableFile(p), p).toBe(true);
    }
  });

  it('rejects prose, structured data and env files', () => {
    for (const p of [
      'README.md',
      'docs/a.mdx',
      'a.markdown',
      'notes.txt',
      'a.rst',
      'migrations/001.sql',
      'prisma/schema.prisma',
      '.env',
      '.env.production',
      'config.json',
      'a.yaml',
    ]) {
      expect(isModelSurfaceableFile(p), p).toBe(false);
    }
  });

  it('is case-insensitive on the extension', () => {
    expect(isModelSurfaceableFile('LIB/Events.MTS')).toBe(true);
    expect(isModelSurfaceableFile('README.MD')).toBe(false);
  });
});

describe('isProseFile — the positively-recognised prose allowlist', () => {
  it('recognises only documentary text extensions', () => {
    for (const p of ['README.md', 'a.mdx', 'a.markdown', 'a.txt', 'a.rst']) {
      expect(isProseFile(p), p).toBe(true);
    }
    // Structured/executable data is NOT prose: a SQL migration or a Prisma
    // schema can carry real, enforcing behaviour.
    for (const p of ['migrations/001.sql', 'prisma/schema.prisma', 'a.ts', '.env', 'a.json', 'a.yaml']) {
      expect(isProseFile(p), p).toBe(false);
    }
  });
});

describe('surfaceDelegatedCandidates — the shared D→M delegated surface', () => {
  it('TRAP 1: uses `selects` for FILE selection and `anchor` only for the line window', () => {
    // `customer.subscription.updated` with NO canceled status. The disjunctive
    // ANCHOR matches this line, but the conjunctive `selects` must not select
    // the file. Collapsing the two parameters into one silently widens LG-006's
    // file selection — a behaviour change invisible to eval and to the fixture
    // hashes, because facts and excerpts are never serialized into the Report.
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER,
      'lib/updates.ts': "if (e.type === 'customer.subscription.updated') await syncPlan(e);\n",
    });
    expect(ANCHOR.test('customer.subscription.updated')).toBe(true); // the anchor WOULD match
    const out = surfaceDelegatedCandidates(fileset, opts({ handlers: locateWebhookHandlers(fileset) }));
    expect(out.excerpts).toEqual([]);
    expect(out.elided).toBe(0);
  });

  it('selects the same file once a canceled status is present (the conjunct is satisfied)', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER,
      'lib/updates.ts':
        "if (e.type === 'customer.subscription.updated' && e.data.object.status === 'canceled') await revoke(e);\n",
    });
    const out = surfaceDelegatedCandidates(fileset, opts({ handlers: locateWebhookHandlers(fileset) }));
    expect(out.excerpts.map((e) => e.path)).toEqual(['lib/updates.ts']);
  });

  it('excludes the handlers themselves from the delegated set', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': `${HANDLER}\n// customer.subscription.deleted\n`,
      'lib/events.ts': "case 'customer.subscription.deleted': await revoke(e);\n",
    });
    const out = surfaceDelegatedCandidates(fileset, opts({ handlers: locateWebhookHandlers(fileset) }));
    expect(out.excerpts.map((e) => e.path)).toEqual(['lib/events.ts']);
  });

  it('surfaces ONLY model-surfaceable files — never prose or structured data', () => {
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER,
      'lib/events.mts': "case 'customer.subscription.deleted': await revoke(e);\n",
      'lib/legacy.cts': "case 'customer.subscription.deleted': await revoke(e);\n",
      'README.md': 'customer.subscription.deleted\n',
      'migrations/001.sql': '-- customer.subscription.deleted\n',
      'prisma/schema.prisma': '// customer.subscription.deleted\n',
    });
    const out = surfaceDelegatedCandidates(fileset, opts({ handlers: locateWebhookHandlers(fileset) }));
    expect(out.excerpts.map((e) => e.path)).toEqual(['lib/events.mts', 'lib/legacy.cts']);
  });

  it('caps the surfaced set, reports the elision count, and stays path-sorted', () => {
    const signal = "export const t = 'customer.subscription.deleted';\n";
    const files: Record<string, string> = { 'app/api/stripe/webhook/route.ts': HANDLER };
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) files[`lib/${n}.ts`] = signal;
    const { fileset } = makeRepo(files);
    const out = surfaceDelegatedCandidates(fileset, opts({ handlers: locateWebhookHandlers(fileset) }));
    expect(out.excerpts.map((e) => e.path)).toEqual([
      'lib/a.ts',
      'lib/b.ts',
      'lib/c.ts',
      'lib/d.ts',
      'lib/e.ts',
    ]);
    expect(out.elided).toBe(2);
    // TRAP 2: the (untransmitted) note-borne elision string is still part of the
    // current output and must be preserved verbatim by the extraction.
    expect(out.excerpts[4]?.note).toContain(
      '2 more code file(s) carrying a cancellation signal were not surfaced (cap: 5).',
    );
    expect(out.excerpts[0]?.note).not.toContain('not surfaced');
  });

  it('windows around the first anchor match rather than surfacing the file whole', () => {
    const filler = Array.from({ length: 200 }, (_, i) => `// filler ${i}`).join('\n');
    const { fileset } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER,
      'lib/events.ts': `${filler}\ncase 'customer.subscription.deleted':\n${filler}\n`,
    });
    const out = surfaceDelegatedCandidates(fileset, opts({ handlers: locateWebhookHandlers(fileset) }));
    const e = out.excerpts[0];
    expect(e).toBeDefined();
    expect(e!.endLine - e!.startLine).toBeLessThanOrEqual(40);
    expect(e?.excerpt).toContain('customer.subscription.deleted');
  });

  it('is deterministic across two collections of the same tree (AT-23)', () => {
    const { root } = makeRepo({
      'app/api/stripe/webhook/route.ts': HANDLER,
      'lib/b.ts': "case 'customer.subscription.deleted':\n",
      'lib/a.ts': "case 'customer.subscription.deleted':\n",
    });
    const a = surfaceDelegatedCandidates(collect(root), opts({ handlers: locateWebhookHandlers(collect(root)) }));
    const b = surfaceDelegatedCandidates(collect(root), opts({ handlers: locateWebhookHandlers(collect(root)) }));
    expect(a.excerpts).toEqual(b.excerpts);
    expect(a.excerpts.map((e) => e.path)).toEqual(['lib/a.ts', 'lib/b.ts']);
  });
});

describe('surfaceDelegatedCandidates — the optional `prefers` ranking', () => {
  const SPECIFIC = /idempoten/i;
  const files = (): Record<string, string> => ({
    'app/api/stripe/webhook/route.ts': HANDLER,
    'app/a.ts': "await prisma.a.upsert({});\n",
    'app/b.ts': "await prisma.b.upsert({});\n",
    'app/c.ts': "await prisma.c.upsert({});\n",
    'app/d.ts': "await prisma.d.upsert({});\n",
    'app/e.ts': "await prisma.e.upsert({});\n",
    'lib/guard.ts': "export const withIdempotency = () => {};\nawait prisma.x.upsert({});\n",
  });
  const selectsAny = (c: string): boolean => /upsert|idempoten/i.test(c);

  it('WITHOUT `prefers`: path order fills the cap and the lib/ guard is discarded', () => {
    const { fileset } = makeRepo(files());
    const out = surfaceDelegatedCandidates(
      fileset,
      opts({ handlers: locateWebhookHandlers(fileset), selects: selectsAny, anchor: /upsert|idempoten/i }),
    );
    expect(out.excerpts.map((e) => e.path)).toEqual(['app/a.ts', 'app/b.ts', 'app/c.ts', 'app/d.ts', 'app/e.ts']);
    expect(out.elided).toBe(1);
  });

  it('WITH `prefers`: the preferred band fills the cap first, and the guard survives', () => {
    const { fileset } = makeRepo(files());
    const out = surfaceDelegatedCandidates(
      fileset,
      opts({
        handlers: locateWebhookHandlers(fileset),
        selects: selectsAny,
        anchor: /upsert|idempoten/i,
        prefers: [(c: string) => SPECIFIC.test(c)],
      }),
    );
    expect(out.excerpts.map((e) => e.path)).toEqual(['lib/guard.ts', 'app/a.ts', 'app/b.ts', 'app/c.ts', 'app/d.ts']);
    expect(out.elided).toBe(1);
  });

  it('preserves path order WITHIN each band, so ranking cannot break AT-23', () => {
    const { fileset } = makeRepo(files());
    const out = surfaceDelegatedCandidates(
      fileset,
      opts({
        handlers: locateWebhookHandlers(fileset),
        selects: selectsAny,
        anchor: /upsert|idempoten/i,
        prefers: [(c: string) => SPECIFIC.test(c)],
      }),
    );
    const generic = out.excerpts.map((e) => e.path).filter((p) => p.startsWith('app/'));
    expect([...generic].sort()).toEqual(generic);
  });

  it('omitting `prefers` is byte-identical to passing one nothing matches (LG-006 is unaffected)', () => {
    const { fileset } = makeRepo(files());
    const base = opts({ handlers: locateWebhookHandlers(fileset), selects: selectsAny, anchor: /upsert|idempoten/i });
    const without = surfaceDelegatedCandidates(fileset, base);
    const withNoop = surfaceDelegatedCandidates(fileset, { ...base, prefers: [() => false] });
    expect(withNoop.excerpts).toEqual(without.excerpts);
    expect(withNoop.elided).toBe(without.elided);
  });
});

describe('DC-4 — `prefers` as ordered bands', () => {
  const MECHANISM = /withOrg|\$extends/;
  const COLUMN = /org_id|orgId/;
  const files = (): Record<string, string> => ({
    'app/api/stripe/webhook/route.ts': HANDLER,
    'app/p1.ts': 'select * from invoices; // generic\n',
    'app/p2.ts': 'select * from invoices; // generic\n',
    'app/p3.ts': 'select * from invoices; // generic\n',
    'app/p4.ts': 'select * from invoices; // generic\n',
    'lib/col.ts': 'where({ org_id: ctx.orgId });\n',
    'lib/mech.ts': 'export const db = base.$extends(withOrg);\n',
  });
  const selectsAny = (c: string): boolean => /invoices|org_id|orgId|withOrg|\$extends/.test(c);
  const banded = (fileset: Parameters<typeof surfaceDelegatedCandidates>[0]) =>
    surfaceDelegatedCandidates(
      fileset,
      opts({
        handlers: locateWebhookHandlers(fileset),
        selects: selectsAny,
        anchor: /invoices|org_id|withOrg/,
        prefers: [(c: string) => MECHANISM.test(c), (c: string) => COLUMN.test(c)],
      }),
    );

  it('fills the cap band 0 first, then band 1, then everything else', () => {
    const { fileset } = makeRepo(files());
    expect(banded(fileset).excerpts.map((e) => e.path)).toEqual([
      'lib/mech.ts',
      'lib/col.ts',
      'app/p1.ts',
      'app/p2.ts',
      'app/p3.ts',
    ]);
  });

  it('reports elidedByBand, indexed as `prefers` with a trailing unbanded entry, summing to elided', () => {
    const { fileset } = makeRepo(files());
    const out = banded(fileset);
    expect(out.elidedByBand).toHaveLength(3);
    // Both specific bands fit; only a generic file was dropped.
    expect(out.elidedByBand).toEqual([0, 0, 1]);
    expect(out.elidedByBand.reduce((a, b) => a + b, 0)).toBe(out.elided);
  });

  it('reports elision IN the specific bands when even those overflow the cap', () => {
    const many: Record<string, string> = { 'app/api/stripe/webhook/route.ts': HANDLER };
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) many[`lib/m${n}.ts`] = 'export const db = base.$extends(withOrg);\n';
    many['lib/z.ts'] = 'where({ org_id: 1 });\n';
    const { fileset } = makeRepo(many);
    const out = banded(fileset);
    // 6 band-0 files, cap 5 → one band-0 and the lone band-1 file are lost.
    expect(out.elidedByBand).toEqual([1, 1, 0]);
    expect(out.elided).toBe(2);
  });

  it('a single band is byte-identical to the previous single-predicate form', () => {
    const { fileset } = makeRepo(files());
    const base = opts({ handlers: locateWebhookHandlers(fileset), selects: selectsAny, anchor: /invoices|org_id/ });
    const oneBand = surfaceDelegatedCandidates(fileset, { ...base, prefers: [(c: string) => COLUMN.test(c)] });
    // Equivalent hand-rolled two-way concat, which is what the old code did.
    const manual = surfaceDelegatedCandidates(fileset, base).excerpts;
    expect(oneBand.excerpts.map((e) => e.path)).toEqual(['lib/col.ts', 'app/p1.ts', 'app/p2.ts', 'app/p3.ts', 'app/p4.ts']);
    expect(manual.map((e) => e.path)).toEqual(['app/p1.ts', 'app/p2.ts', 'app/p3.ts', 'app/p4.ts', 'lib/col.ts']);
  });

  it('no bands yields a single elidedByBand entry equal to elided (AT-23 default path)', () => {
    const { fileset } = makeRepo(files());
    const out = surfaceDelegatedCandidates(
      fileset,
      opts({ handlers: locateWebhookHandlers(fileset), selects: selectsAny, anchor: /invoices|org_id/ }),
    );
    expect(out.elidedByBand).toHaveLength(1);
    expect(out.elidedByBand[0]).toBe(out.elided);
  });
});
