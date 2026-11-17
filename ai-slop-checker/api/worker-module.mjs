"use strict";
/**
 * Lazynext AI Slop Checker — Workers deployment entry (ES Module wrapper).
 *
 * api/worker.js stays a plain CommonJS module so the Node unit suite can
 * keep requiring it directly (test/worker.test.js, test/worker-edge.test.js,
 * test/openapi-parity.test.js). workerd, however, only registers event
 * handlers from a module worker's `export default { fetch }` — a pure CJS
 * `module.exports.fetch` bundle is rejected at deploy with
 * "No event handlers were registered" (code 10021). This wrapper is the
 * file wrangler publishes (wrangler.toml main); esbuild bundles the CJS
 * core into the ESM output and the default export below is what workerd
 * registers.
 *
 * Keep the exported keys in lockstep with module.exports in api/worker.js.
 */
import core from "./worker.js";

export default {
  fetch: core.fetch,
  isBlockedHost: core.isBlockedHost,
};