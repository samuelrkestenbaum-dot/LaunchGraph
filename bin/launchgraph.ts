#!/usr/bin/env -S tsx
/**
 * `launchgraph` executable — a thin wrapper.
 *
 * All logic lives in the pure `run(argv, io)` core; this file only wires the
 * real process to it (`realIo`) and propagates the returned §11.4 exit code.
 * Nothing else belongs here.
 */
import { realIo } from '../src/cli/io.js';
import { run } from '../src/cli/run.js';

process.exit(run(process.argv.slice(2), realIo));
