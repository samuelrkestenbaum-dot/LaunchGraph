/**
 * The single shared Stripe webhook-handler locator (Layer D).
 *
 * Several §3 checks ask *different* questions of the *same* set of files:
 * LG-004 asks whether each handler verifies the signature, LG-006 asks whether
 * the repository handles subscription cancellation. Before this module each
 * detector restated the locate predicate byte-for-byte, which meant "which
 * files are webhook handlers?" had more than one answer in the codebase and
 * could drift silently. It has exactly one answer here.
 *
 * Contract:
 * - **All handlers, never just the first.** `locateWebhookHandlers` has
 *   `.filter()` semantics: a repository that splits its handling across
 *   `app/api/stripe/webhook/route.ts` and `app/api/stripe/webhook-v2/route.ts`
 *   yields both. Checks that reason about whether the repository handles
 *   something *at all* must see every handler — a first-match locator would let
 *   a check conclude "absent" from a file that simply is not the one doing the
 *   work, which for a blocker-capable check manufactures a false blocker. The
 *   standing convention is that a heuristic may under-warn but must never
 *   manufacture a false blocker.
 * - **Deterministic (AT-23).** `collect()` returns `fileset.files` sorted by
 *   path, and `.filter()` preserves that order, so the returned list is a pure,
 *   stable function of the tree contents. No set/hash iteration, no clock, no
 *   filesystem-order dependence is introduced here.
 * - **Pure and offline.** Path inspection only; no I/O, no content parsing.
 *   *Whether* a located handler is correct is each consuming check's question,
 *   never this module's.
 */
import { isCodeFile } from './collect.js';
import type { CollectedFile, Fileset } from './collect.js';

/**
 * A code file that looks like a Stripe webhook handler by path: an
 * `app/api/**\/webhook*\/route.ts`-style App Router route or a `pages/api`
 * handler whose path mentions a webhook.
 *
 * The code-extension test comes from the shared `isCodeFile` — a private copy
 * here would be a second answer to "is this code?", which is the drift the
 * shared locator exists to prevent.
 */
export function isWebhookHandler(path: string): boolean {
  const lower = path.toLowerCase();
  if (!isCodeFile(lower)) return false;
  if (!lower.includes('webhook')) return false;
  return lower.includes('/api/') || lower.startsWith('api/') || lower.includes('route.') || lower.includes('pages/api');
}

/**
 * Every webhook handler in the fileset, in the collector's deterministic
 * path-sorted order. Empty when the repository has no handler at all — a
 * *missing* handler is LG-003's concern, and each consumer decides what an
 * empty result means for its own question.
 */
export function locateWebhookHandlers(fileset: Fileset): CollectedFile[] {
  return fileset.files.filter((file) => isWebhookHandler(file.path));
}
