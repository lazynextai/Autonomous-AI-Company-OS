// The status page used to paint 90 green bars and a hardcoded
// "All systems operational" badge with no stored history behind either.
// These assertions lock the honest replacement: static service rows,
// a summary that waits for the checks, and no fabricated uptime chart.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const status = readFileSync(join(HERE, "..", "public", "status.html"), "utf8");
const statement = readFileSync(join(HERE, "..", "public", "accessibility.html"), "utf8");

const staticHtml = status.split("<script>")[0];

test("status page does not publish a fabricated 90-day uptime chart", () => {
  assert.equal(/<h2>90-day uptime<\/h2>/.test(status), false);
  assert.equal(status.includes("with 90-day uptime"), false);
  assert.equal(status.includes("all green"), false);
  assert.equal(/for\s*\(\s*let i=0;i<90/.test(status), false);
  assert.equal(staticHtml.includes('id="bars"'), false);
  assert.match(staticHtml, /does not keep a 90-day history/);
  assert.match(status, /does not store a 90-day uptime history/);
});

test("summary is not operational until the live checks settle", () => {
  assert.match(staticHtml, /Live status needs JavaScript/);
  assert.equal(staticHtml.includes("All systems operational"), false);
  assert.match(status, /Checking live status/);
  assert.match(status, /Some services need attention/);
  assert.match(status, /Promise\.all\(checks\.map/);
  assert.match(status, /overallText\.textContent=bad\?'Some services need attention':'All systems operational'/);
});

test("every monitored service is in the page without JavaScript", () => {
  const urls = [...staticHtml.matchAll(/data-check="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(urls, [
    "https://dashboard.lazynext.com",
    "https://ai-company.lazynext.com/api/v1/health",
    "https://lazynext.com",
    "https://checker.lazynext.com/health",
    "https://api.lazynext.com/health",
    "https://checker.lazynext.com/",
    "https://slop-checker.lazynext.com/",
    "https://checker.lazynext.com/.well-known/agent.json",
    "https://penpot.lazynext.com",
  ]);
  const pills = staticHtml.match(/data-check="[^"]+">needs JavaScript</g) ?? [];
  assert.equal(pills.length, urls.length);
  assert.match(staticHtml, /id="history-note"/);
});

test("accessibility statement describes the status page that ships", () => {
  assert.match(statement, /does not store or draw a 90-day uptime history/);
  assert.equal(statement.includes('rows stay at "checking…"'), false);
  assert.match(statement, /datetime="2026-11-21"/);
  assert.match(statement, /last reviewed on 21 November 2026/);
});
