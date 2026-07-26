/**
 * The seam every model-assisted (Layer D+M) check plugs into.
 *
 * Types only. This module imports nothing from `src/checks/` — the dependency
 * runs check → seam, never the reverse — so adding a detector never edits this
 * file and the scanner never grows a per-check branch.
 *
 * ## Why "settled" is expressed as the ABSENCE of a request
 *
 * The three shipped consumers settle in three different ways, and an interface
 * fitted to any one of them would misfit the others:
 *
 * - **LG-006 settles `fail`.** Its deterministic layer can prove nothing in the
 *   repository handles cancellation, and §4.3 forbids routing that required
 *   deterministic signal through a model.
 * - **LG-005 settles nothing** except `not_applicable`. §3 assigns its D layer
 *   candidates, not a verdict.
 * - **LG-009 settles `pass`.** Its deterministic layer can read migrations
 *   completely and prove RLS covers every tenant-owned table.
 *
 * A boolean `isSettled(candidates)` predicate would have to be supplied by each
 * check with the right polarity, and a plausible default (`() => false`) would
 * silently ship an `infer` call — repository text leaving the process — for a
 * check that had already decided. So settledness is not a separate question
 * here: {@link SurfacedCheck.request} is `undefined` exactly when no model may
 * be consulted, whether because the check does not apply or because the
 * deterministic layer already answered. There is no polarity to get wrong, and
 * "no request" cannot accidentally mean "ask anyway".
 *
 * ## Why `surface` returns a bound object
 *
 * Each check's candidate bundle has its own shape (handler paths, anchors,
 * declared tables). Returning a bound {@link SurfacedCheck} keeps that type
 * private to the check instead of forcing a generic parameter through the
 * scanner's fixed-order array, which would collapse to `any` the moment the
 * array held two checks with different candidate types.
 */
import type { Fileset } from '../scan/collect.js';
import type { Finding } from '../schema/index.js';
import type { InferenceRequest, InferenceResult } from './client.js';

/** A check's deterministic layer, already run against a fileset. */
export interface SurfacedCheck {
  /**
   * The bounded, redacted request for the model layer — or `undefined` when the
   * deterministic layer has settled the check and no model may be consulted.
   *
   * A caller that sees `undefined` MUST NOT call `infer`. Nothing downstream
   * depends on the caller honouring that: {@link interpret} enforces the same
   * rule independently, so a judgment supplied for a settled check is ignored
   * rather than believed.
   */
  readonly request: InferenceRequest | undefined;
  /**
   * Assembles the §5 findings. Called with the resolved judgment when one was
   * obtained, and with nothing when the check was settled, `--checks` excluded
   * it, or no model is configured (the `--offline` path).
   */
  interpret(judgment?: InferenceResult): Finding[];
}

/** A model-assisted check, as the scanner composition sees it. */
export interface ModelCheck {
  /** §3 registry id. Used for fixed ordering and `--checks` selection. */
  readonly checkId: string;
  /** Runs Layer D over the fileset. Pure: no clock, no network, no I/O. */
  surface(fileset: Fileset): SurfacedCheck;
}
