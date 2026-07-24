/**
 * Deterministic, offline, credential-free `ModelClient` for tests.
 *
 * `FakeModelClient` is the ONLY model client the build and test suites touch.
 * It performs zero network I/O, reads no credentials, and returns scripted
 * responses keyed by `checkId`. A script entry is either a fixed
 * `InferenceResult` or a matcher `(req) => InferenceResult`, so a test can make
 * the response depend on the surfaced request (e.g. cite the request's own
 * excerpts). Every request is recorded for assertions.
 *
 * The real transport (`realClient.ts`) is never imported by a test; this fake
 * stands in for it everywhere.
 */
import type { InferenceRequest, InferenceResult, ModelClient } from './client.js';

/** A scripted response: a fixed result or a matcher over the request. */
export type FakeScript = InferenceResult | ((req: InferenceRequest) => InferenceResult);

export class FakeModelClient implements ModelClient {
  private readonly script: Map<string, FakeScript>;
  private readonly calls: InferenceRequest[] = [];

  constructor(scriptByCheckId: Readonly<Record<string, FakeScript>>) {
    this.script = new Map(Object.entries(scriptByCheckId));
  }

  /** Every request handed to `infer`, in order (for assertions). */
  get requests(): readonly InferenceRequest[] {
    return this.calls;
  }

  infer(req: InferenceRequest): Promise<InferenceResult> {
    this.calls.push(req);
    const entry = this.script.get(req.checkId);
    if (entry === undefined) {
      return Promise.reject(new Error(`FakeModelClient: no scripted response for check "${req.checkId}"`));
    }
    const result = typeof entry === 'function' ? entry(req) : entry;
    return Promise.resolve(result);
  }
}
