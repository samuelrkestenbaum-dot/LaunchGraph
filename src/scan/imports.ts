/**
 * The shared **local-runtime-import** predicate behind the delegated-opacity
 * guards (H-001, extended H-002, shared at H-003).
 *
 * Extracted verbatim from `src/checks/lg005.ts` so that every D+M webhook
 * check whose delegated surface is an allowlist of positive markers can ask
 * the same question of a handler's full raw content: *does this file import
 * local runtime code?* A handler that does can delegate the behaviour under
 * audit to a module the marker-based surface never showed the model, and a
 * model `fail` judged over that surface can be a false blocker on a correct
 * repository. The guards consume this predicate asymmetrically — they demote
 * `fail` to `unknown` and never touch a `pass` — so over-fire here is safe by
 * construction.
 *
 * The recall cost and the out-of-class specifier residue (bare npm,
 * `#imports`, tsconfig aliases) are disclosed ONCE, on
 * {@link hasLocalRuntimeImport} below — not per consuming check.
 *
 * Pure and offline: no clock, no randomness, no I/O.
 */
import type { Fileset } from './collect.js';

/**
 * Import/require/export-from statements whose specifier is captured for the
 * delegated-opacity guard. `[^'"]*?` keeps the clause from bridging across
 * string literals, so a `from` inside unrelated code cannot pair with a later
 * string. Group 2 captures the `type` keyword so type-only statements can be
 * excluded.
 */
const IMPORT_EXPORT_FROM_RE = /\b(import|export)\s+(type\s+)?[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
/**
 * `require('…')` calls. Backtick specifiers are the same delegation shape as
 * quoted ones; an INTERPOLATED template literal is classified by the static
 * prefix before the first `${` hole (captured up to `` ` `` or `$`), because
 * per-event dispatch such as ``import(`./handlers/${event.type}`)`` delegates
 * to modules the model can never be shown. Over-fire from a prefix
 * classification is safe by the guard's own asymmetry: it can only demote
 * `fail` to `unknown`.
 */
const REQUIRE_RE = /\brequire\s*\(\s*(?:['"]([^'"]+)['"]|`([^`$]*)[^`]*`)\s*\)/g;
/** Dynamic `import('…')` calls (no whitespace-then-clause — that is the static form above). Template-literal handling as in REQUIRE_RE. */
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(?:['"]([^'"]+)['"]|`([^`$]*)[^`]*`)\s*\)/g;
/**
 * Side-effect-only imports: `import './register-handlers'` — no `from`
 * clause, no binding. Module-registration delegation: the imported module can
 * install the very callback the handler later invokes, so it is the same
 * opacity class as the clause forms above. Static import declarations accept
 * only string literals, so no template-literal alternative exists here. The
 * quote follows `import` directly, which is what keeps this from overlapping
 * the `from`-clause form.
 */
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*['"]([^'"]+)['"]/g;

/**
 * True when `specifier` resolves inside the repository: a relative specifier
 * (`./`, `../`), a root alias (`@/`, `~/`), or a first path segment naming a
 * top-level directory present in the fileset (which catches
 * tsconfig-`baseUrl`-style specifiers such as `lib/db`). Bare npm specifiers
 * are deliberately OUT of this class: `node_modules` is outside the evidence
 * universe (never collected, never surfaced), so a package-mediated
 * side-effect path is bounded residue this guard does not claim to cover.
 */
export function isLocalSpecifier(specifier: string, topLevelDirs: ReadonlySet<string>): boolean {
  if (specifier.startsWith('./') || specifier.startsWith('../')) return true;
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) return true;
  const first = specifier.split('/')[0] ?? '';
  return topLevelDirs.has(first);
}

/**
 * The top-level directory names present in the fileset. Derived from the
 * collected paths so a baseUrl-style specifier (`lib/db`) is recognised as
 * local by {@link isLocalSpecifier}. Root-level FILES contribute nothing:
 * only paths containing a `/` name a directory.
 */
export function topLevelDirectories(fileset: Fileset): ReadonlySet<string> {
  const topLevelDirs = new Set<string>();
  for (const f of fileset.files) {
    const slash = f.path.indexOf('/');
    if (slash > 0) topLevelDirs.add(f.path.slice(0, slash));
  }
  return topLevelDirs;
}

/**
 * The delegated-opacity guard's predicate (H-001): does this handler's FULL
 * RAW CONTENT carry at least one LOCAL RUNTIME import?
 *
 * Counted forms: `import … from`, `export … from`, side-effect-only
 * `import '…'`, `require(…)`, and dynamic
 * `import(…)` — with quoted OR template-literal specifiers; an interpolated
 * template literal is classified by its static prefix (see REQUIRE_RE).
 * `import type` / `export type` statements are EXCLUDED — a type-only import
 * carries no runtime code, and excluding it keeps the inferred `fail` alive
 * where it is sound. Out of class, in the unsafe direction and disclosed as
 * bounded residue: bare npm specifiers (node_modules is outside the evidence
 * universe), `#imports` subpath specifiers, and custom tsconfig aliases
 * (`@lib/*`-style) that are local in fact but not in this class.
 *
 * Why this exists: a delegated surface's `selects` predicate is an
 * allowlist of POSITIVE markers, so a local helper that answers the check's
 * question without carrying any marker (for LG-005, a helper idempotent by
 * construction — a plain state-reconciliation UPDATE with no event-id /
 * upsert / dedup marker) is exactly the file it excludes — and when nothing
 * matches, `elided` is 0, so no completeness disclosure transmits either. A
 * handler that imports local runtime code can therefore delegate its
 * side-effect path to a module the model was never shown, and a `fail`
 * judged over that surface can be a false blocker on a correct repository.
 *
 * RECALL COST, stated plainly: the online inferred-fail blocker is now
 * reachable only on handlers whose side-effect path is inline (no local
 * runtime imports) — per the consuming module's own contract, a heuristic may
 * under-warn; it must never manufacture a false blocker.
 */
export function hasLocalRuntimeImport(content: string, topLevelDirs: ReadonlySet<string>): boolean {
  for (const m of content.matchAll(IMPORT_EXPORT_FROM_RE)) {
    if (m[2] !== undefined) continue; // `import type` / `export type` — no runtime code.
    if (isLocalSpecifier(m[3] ?? '', topLevelDirs)) return true;
  }
  for (const re of [REQUIRE_RE, DYNAMIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE]) {
    for (const m of content.matchAll(re)) {
      // Group 1: quoted specifier. Group 2: template-literal static prefix
      // (whole specifier when uninterpolated).
      if (isLocalSpecifier(m[1] ?? m[2] ?? '', topLevelDirs)) return true;
    }
  }
  return false;
}
