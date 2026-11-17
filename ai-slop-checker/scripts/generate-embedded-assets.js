"use strict";
/**
 * Lazynext AI Slop Checker — regenerate api/embedded-assets.js.
 *
 * Embeds llms.txt and api/openapi.json as string constants so the Workers
 * entry (api/worker.js) can serve GET /llms.txt and GET /openapi.json
 * without node:fs — workerd has no filesystem, and the previously used
 * readFileSync calls made the Worker bundle fail (wrangler refuses
 * external node:* imports in Service Worker format).
 *
 * The deployed worker prefers passing these two routes through the
 * [assets] binding (env.ASSETS, byte-exact files); the embedded constants
 * are the env-less fallback (local unit tests) and keep the route working
 * wherever the binding is absent.
 *
 * Usage: node scripts/generate-embedded-assets.js
 * (also: npm run gen:assets)
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const LLMS_SRC = path.join(ROOT, "llms.txt");
const OPENAPI_SRC = path.join(ROOT, "api", "openapi.json");
const OUT = path.join(ROOT, "api", "embedded-assets.js");

const llms = fs.readFileSync(LLMS_SRC, "utf8");
const openapi = fs.readFileSync(OPENAPI_SRC, "utf8");

const out =
  '"use strict";\n' +
  "// GENERATED FILE — do not edit by hand. Regenerate with:\n" +
  "//   node scripts/generate-embedded-assets.js   (npm run gen:assets)\n" +
  "//\n" +
  "// Embeds llms.txt + api/openapi.json as constants so the Workers entry\n" +
  "// (api/worker.js) can serve GET /llms.txt and GET /openapi.json without\n" +
  "// node:fs (no filesystem at the edge). The deployed worker passes these\n" +
  "// routes through the [assets] binding when present; these constants are\n" +
  "// the env-less fallback (unit tests / local). Drift is pinned by\n" +
  "// test/worker-edge.test.js (embedded content must equal the files on\n" +
  "// disk) — regenerate after editing either file.\n" +
  "const LLMS_TXT = " + JSON.stringify(llms) + ";\n" +
  "const OPENAPI_JSON = " + JSON.stringify(openapi) + ";\n" +
  "module.exports = { LLMS_TXT, OPENAPI_JSON };\n";

fs.writeFileSync(OUT, out);
console.log(
  `wrote api/embedded-assets.js (llms.txt ${Buffer.byteLength(llms)} bytes, ` +
  `openapi.json ${Buffer.byteLength(openapi)} bytes)`
);