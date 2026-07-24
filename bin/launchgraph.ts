#!/usr/bin/env -S tsx
/**
 * `launchgraph` executable — a thin wrapper.
 *
 * All logic lives in the pure `run(argv, io)` core; this file only wires the
 * real process to it (`realIo`) and propagates the returned §11.4 exit code.
 *
 * The model endpoint is the credential boundary: when a full model config is
 * present in the host environment AND the run is not `--offline`, the bin
 * constructs the `RealModelClient` here (mirroring how `realIo` owns real I/O)
 * and hands it to the online `run` overload. The library never reads the
 * environment itself — `RealModelClient` takes its config injected. The model
 * endpoint is LaunchGraph's own model API (the sole permitted egress, §10
 * SEC-2), not a provider credential; provider credentials are never read
 * (SEC-3). Nothing else belongs here.
 */
import { realIo } from '../src/cli/io.js';
import { run } from '../src/cli/run.js';
import { RealModelClient } from '../src/model/realClient.js';
import type { RealModelClientConfig } from '../src/model/realClient.js';

/**
 * Reads the model-endpoint config from the host. Returns undefined unless ALL
 * of endpoint + key + model are present and non-empty — a partial config runs
 * offline rather than half-configured.
 */
function readModelConfig(): RealModelClientConfig | undefined {
  const endpoint = process.env.LAUNCHGRAPH_MODEL_ENDPOINT;
  const apiKey = process.env.LAUNCHGRAPH_MODEL_API_KEY;
  const model = process.env.LAUNCHGRAPH_MODEL;
  if (!endpoint || !apiKey || !model) return undefined;
  return { endpoint, apiKey, model };
}

const argv = process.argv.slice(2);
const config = readModelConfig();

if (config !== undefined) {
  // Online overload returns Promise<number>; run() still gates on --offline.
  void run(argv, realIo, new RealModelClient(config)).then((code) => process.exit(code));
} else {
  process.exit(run(argv, realIo));
}
