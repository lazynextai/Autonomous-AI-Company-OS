#!/usr/bin/env node
"use strict";
/**
 * Local real-browser render farm.
 *
 * Serves fixtures/render-farm/*.html, collects a computed snapshot with
 * src/collect-render.js (optional Playwright), and checks the snapshot
 * against src/render-farm-plan.js.
 *
 * Playwright is not a runtime dependency. Without it this process exits 0
 * and prints SKIP, unless RENDER_FARM_REQUIRED=1, in which case it exits 2.
 * The installed job is .github/workflows/ai-slop-checker-render-farm.yml.
 * That job treats exit 2 as a green skip. Fixture failures still exit 1.
 *
 *   node scripts/render-farm.js
 *   RENDER_FARM_REQUIRED=1 node scripts/render-farm.js
 *   RENDER_FARM_CHANNEL=chrome node scripts/render-farm.js
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FIXTURE_DIR = path.join(ROOT, "fixtures", "render-farm");
const { FIXTURES, evaluateFixture } = require("../src/render-farm-plan.js");
const { scanRender } = require("../src/render-checks.js");

function skip(message, code) {
  console.log(`SKIP  ${message}`);
  process.exit(code);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const name = path.basename(decodeURIComponent(req.url.split("?")[0]));
    const file = path.join(FIXTURE_DIR, name);
    if (!file.startsWith(FIXTURE_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const required = process.env.RENDER_FARM_REQUIRED === "1";
  let collectRender;
  let isCollectorAvailable;
  try {
    ({ collectRender, isCollectorAvailable } = require("../src/collect-render.js"));
  } catch (err) {
    skip(`collector failed to load (${err.message})`, required ? 2 : 0);
  }
  if (!isCollectorAvailable()) {
    skip(
      "playwright is not installed. Opt in with: npm i -D playwright && npx playwright install chromium. " +
        "Or set RENDER_FARM_CHANNEL=chrome after installing the playwright package against a system Chrome.",
      required ? 2 : 0
    );
  }

  const server = await startServer();
  const { port } = server.address();
  const channel = process.env.RENDER_FARM_CHANNEL || undefined;
  let failed = 0;
  try {
    for (const fixture of FIXTURES) {
      const url = `http://127.0.0.1:${port}/${fixture.file}`;
      const snapshot = await collectRender(url, { channel, waitMs: 200 });
      const report = scanRender(snapshot);
      const result = evaluateFixture(report, fixture);
      if (result.ok) {
        console.log(`PASS  ${fixture.id}  ids=${result.ids.join(",") || "(none)"}`);
      } else {
        failed += 1;
        console.log(
          `FAIL  ${fixture.id}  missing=${result.missing.join(",") || "-"} unexpected=${result.unexpected.join(",") || "-"} ids=${result.ids.join(",") || "(none)"}`
        );
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  if (failed) {
    console.log(`FARM  ${failed} fixture(s) failed`);
    process.exit(1);
  }
  console.log(`FARM  ${FIXTURES.length}/${FIXTURES.length} fixtures passed`);
}

main().catch((err) => {
  console.error(`FAIL  ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
