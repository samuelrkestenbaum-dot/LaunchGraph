import { afterAll, describe, expect, it } from 'vitest';

import { surfaceLg005Candidates } from '../../src/checks/lg005.js';
import { surfaceLg006Candidates } from '../../src/checks/lg006.js';
import { cleanupRepos, makeRepo } from '../support/tempRepo.js';

afterAll(cleanupRepos);

/**
 * DC-3 — the `ModelCheck` extraction and the folding of the two duplicated
 * disclosure helper pairs into `surface.ts` must not move a single byte of
 * either transmitted question.
 *
 * These literals were captured from the pre-refactor implementation at base
 * `696518b`. They are deliberately written out in full rather than compared
 * against a re-derivation, because a re-derivation would share the very code
 * under test and could drift with it. If a future change to the disclosure
 * wording is intended, that is a deliberate edit to these literals and to the
 * assertion-change budget — not something a refactor may do silently.
 *
 * The repo below exercises BOTH disclosures at once for BOTH checks: seven
 * `lib/*.ts` files carry the cancellation and idempotency signals (cap 5 → 2
 * elided) and one `.sql` migration carries both signals while being
 * unsurfaceable (1 withheld non-source).
 */
const LG006_QUESTION =
  'In the surfaced Stripe webhook handlers AND the surfaced delegated modules they hand events to, ' +
  'does the subscription-cancellation path (customer.subscription.deleted, or customer.subscription.updated ' +
  'with a canceled status) reach an entitlement downgrade or access removal? The handling need not be in the ' +
  'handler file itself — a handler that delegates to a module which performs the downgrade satisfies this.' +
  ' NOTE ON COMPLETENESS: 2 further code file(s) in this repository also reference subscription cancellation ' +
  'but were NOT surfaced to you (at most 5 are included). The code performing the entitlement downgrade may ' +
  'be in one of them. Treat the surfaced set as incomplete: the absence of a downgrade in what you can see is ' +
  'not evidence that none exists.' +
  ' NOTE ON COMPLETENESS: 1 non-source file(s) in this repository (for example database migrations or schema ' +
  'definitions) also reference subscription cancellation but were NOT surfaced to you, because only source ' +
  'code is sent to the model. Such a file can enforce real behaviour — a database constraint or trigger can ' +
  'remove access — so treat their contents as unknown rather than as absent.';

const LG005_QUESTION =
  'Stripe redelivers the same webhook event on retry. In the surfaced Stripe webhook handlers AND the ' +
  'surfaced modules they delegate to, would processing the SAME event twice repeat its side effects ' +
  '(granting entitlement, sending mail, creating a charge or a record) — or is the handler path idempotent? ' +
  'A guard may take several forms: persisting and then looking up event.id, an upsert or unique constraint ' +
  'on processed events, a dedup helper, or a handler that is idempotent by construction because it only ' +
  "reconciles state (for example an UPDATE that sets a row to the event's value rather than incrementing it). " +
  'The guard need not live in the handler file — a handler that delegates to a module performing the check ' +
  'satisfies this.' +
  ' NOTE ON COMPLETENESS: 2 further source file(s) in this repository also reference idempotency or event-id ' +
  'handling but were NOT surfaced to you (at most 5 are included). The guard may be in one of them. Treat the ' +
  'surfaced set as incomplete: the absence of a guard in what you can see is not evidence that none exists.' +
  ' NOTE ON COMPLETENESS: 1 non-source file(s) in this repository (for example database migrations or schema ' +
  'definitions) also reference idempotency or event-id handling but were NOT surfaced to you, because only ' +
  'source code is sent to the model. A unique constraint declared in such a file is a standard and sufficient ' +
  'idempotency guard, so treat their contents as unknown rather than as absent.';

function bothDisclosuresRepo(): Record<string, string> {
  const files: Record<string, string> = {
    'app/api/stripe/webhook/route.ts':
      "export async function POST(req: Request) { const e = JSON.parse(await req.text()); return new Response('ok'); }\n",
    'migrations/001.sql':
      '-- customer.subscription.deleted and event.id dedup\nCREATE UNIQUE INDEX ON processed_events (event_id);\n',
  };
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
    files[`lib/${n}.ts`] = "const t = 'customer.subscription.deleted'; await prisma.x.upsert({}); // event.id\n";
  }
  return files;
}

describe('DC-3 — transmitted questions are byte-identical across the ModelCheck extraction', () => {
  it('LG-006 question is unchanged, with both disclosures present', () => {
    const { fileset } = makeRepo(bothDisclosuresRepo());
    const c = surfaceLg006Candidates(fileset);
    expect(c.applicable).toBe(true);
    if (!c.applicable) return;
    expect(c.request.question).toBe(LG006_QUESTION);
  });

  it('LG-005 question is unchanged, with both disclosures present', () => {
    const { fileset } = makeRepo(bothDisclosuresRepo());
    const c = surfaceLg005Candidates(fileset);
    expect(c.applicable).toBe(true);
    if (!c.applicable) return;
    expect(c.request.question).toBe(LG005_QUESTION);
  });

  it('both questions actually carry BOTH disclosure kinds (the pin is not vacuous)', () => {
    // A pin that matched a question with no disclosures would prove nothing
    // about the folded helpers, which is the whole point of DC-3.
    for (const q of [LG006_QUESTION, LG005_QUESTION]) {
      expect(q.match(/NOTE ON COMPLETENESS/g)).toHaveLength(2);
      expect(q).toContain('at most 5 are included');
      expect(q).toContain('1 non-source file(s)');
    }
  });
});
