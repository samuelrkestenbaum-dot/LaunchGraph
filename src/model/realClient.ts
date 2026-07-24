/**
 * Real model transport skeleton (real runtime only — NEVER imported by a test).
 *
 * At real runtime the bin (`bin/sugarbee.ts`) constructs this with the model
 * endpoint config it reads from the host — the credential boundary, mirroring
 * `realIo`. This class itself:
 * - reads NO `process.env` (config is injected via the constructor),
 * - instantiates NO provider SDK and adds NO dependency — it uses the built-in
 *   global `fetch` only,
 * - opens the ONLY permitted network egress in Phase 1: the configured model
 *   endpoint (§10 SEC-2). Under `--offline` the bin never constructs it, so
 *   there is zero egress.
 *
 * The HTTP body is real: excerpts are wrapped via {@link buildUntrustedDataEnvelope}
 * (SEC-5) and sent alongside the bounded question and the response-schema
 * descriptor. Only the transport is exercised at real runtime; the pure
 * request→finding contract it feeds (`inference.ts`) is what the tests cover.
 */
import { buildUntrustedDataEnvelope } from './client.js';
import type { InferenceRequest, InferenceResult, ModelClient } from './client.js';

export interface RealModelClientConfig {
  /** The model API endpoint — the sole permitted network egress (SEC-2). */
  endpoint: string;
  /** The model API key. Injected by the bin; never read from env here (SEC-3-adjacent). */
  apiKey: string;
  /** The model identifier passed in the request body. */
  model: string;
}

export class RealModelClient implements ModelClient {
  constructor(private readonly config: RealModelClientConfig) {}

  async infer(req: InferenceRequest): Promise<InferenceResult> {
    // SEC-5: repository excerpts are wrapped as untrusted data, never as
    // instructions. The bounded question + response schema constrain the answer.
    const body = JSON.stringify({
      model: this.config.model,
      checkId: req.checkId,
      question: req.question,
      responseSchema: req.responseSchema,
      supportingFacts: req.supportingFacts ?? [],
      untrustedData: buildUntrustedDataEnvelope(req.excerpts),
    });

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`RealModelClient: model endpoint returned ${response.status} ${response.statusText}`);
    }

    // The endpoint is trusted to return the InferenceResult shape; the pure
    // contract in inference.ts still discards uncited claims and caps confidence,
    // so a misbehaving endpoint cannot upgrade a result past the §4.2 bounds.
    return (await response.json()) as InferenceResult;
  }
}
