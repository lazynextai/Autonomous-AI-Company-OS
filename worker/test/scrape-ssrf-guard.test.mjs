// Route-level SSRF coverage for the platform Browser-Rendering doors. The
// scrape handlers must reject private/link-local/metadata hosts with 400
// BEFORE launchBrowser / page.goto is even attempted, while a public URL
// passes the guard (here evidenced by reaching the "browser binding not
// configured" 503 — no BROWSER binding exists in tests, so a blocked URL
// returning 400 and a public URL returning 503 proves the wire order).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/lift.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Lift the real guard out of urlguard.ts and hand it to the scrape handlers,
// so this test exercises the shipped implementations end to end. The whole
// module is lifted (module-level helpers included).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guardSrc = readFileSync(path.join(__dirname, "../src/urlguard.ts"), "utf8");
let gJs = guardSrc
  .replace("export function isPublicHttpUrl(raw: string): boolean {", "function isPublicHttpUrl(raw) {")
  .replace("  let u: URL;", "  let u;")
  .replace("function publicIpv4(octs: number[]): boolean {", "function publicIpv4(octs) {")
  .replace("function publicIpv6(addr: string): boolean {", "function publicIpv6(addr) {")
  .replace("(side: string): number[] | null", "(side)")
  .replace("const out: number[] = [];", "const out = [];")
  .replace("(n: number)", "(n)")
  .replace("(hi: number, lo: number)", "(hi, lo)");
// eslint-disable-next-line no-new-func
const isPublicHttpUrl = new Function("URL", `${gJs}; return isPublicHttpUrl;`)(URL);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const scrape = loadModule("scrape.ts", { isPublicHttpUrl, json }, [
  "handleScrape",
  "handlePdf",
  "handleRender",
]);

const BLOCKED = [
  "http://169.254.169.254/latest/meta-data",
  "http://[::ffff:169.254.169.254]/latest/meta-data",
  "http://[::ffff:a9fe:a9fe]/latest/meta-data", // WHATWG-normalized form
  "http://127.0.0.1:9/",
  "http://10.0.0.1/",
  "http://192.168.1.1/",
  "http://localhost/",
  "http://api.internal/x",
  "http://[::1]/",
  "http://[2002:a9fe:a9fe::]/", // 6to4 embedding
];

const PUBLIC = [
  "https://example.com/",
  "http://example.com/plain.txt",
  "https://sub.domain.co.uk/a?b=c",
];

const post = (route, url) =>
  scrape[route](new Request(`https://ai-company.lazynext.com${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  }), {});

for (const route of ["handleRender", "handlePdf", "handleScrape"]) {
  test(`${route} rejects every SSRF vector with 400 before touching the browser`, async () => {
    for (const u of BLOCKED) {
      const r = await post(route, u);
      assert.equal(r.status, 400, u);
      const d = JSON.parse(await r.text());
      assert.match(d.error, /host not allowed/, u);
    }
  });

  test(`${route} passes public URLs past the guard (hits BROWSER check)`, async () => {
    for (const u of PUBLIC) {
      const r = await post(route, u);
      // No BROWSER binding in the test env — reaching 503 proves the guard
      // did not reject the URL and we're past it.
      assert.equal(r.status, 503, u);
      const d = JSON.parse(await r.text());
      assert.match(d.error, /browser binding not configured/, u);
    }
  });

  test(`${route} rejects missing/non-URL payloads`, async () => {
    for (const body of [{}, { url: "" }, { url: "ftp://example.com/x" }, { url: "not a url" }]) {
      const r = await scrape[route](new Request(`https://ai-company.lazynext.com${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }), {});
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });
}