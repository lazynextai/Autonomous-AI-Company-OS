import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Lifts the shipped isSafeDocUrl source out of src/sign.ts so it can't drift
// from what's deployed — same pattern as artifact-guard.test.mjs.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, "../src/sign.ts"), "utf8");
const marker = "function isSafeDocUrl(";
const start = src.indexOf(marker);
assert.ok(start >= 0, "isSafeDocUrl must exist in src/sign.ts");
const block = src.slice(start);

// Deterministic anchor: the function body ends with `return true; }`.
const endMarker = "return true;\n}";
const end = block.indexOf(endMarker) + endMarker.length;
assert.ok(end > endMarker.length, "isSafeDocUrl must end with `return true; }`");
const raw = block.slice(0, end);

// Strip the two TS type annotations so the lifted source runs as plain JS.
// Targeted replaces only — a global `:\s*\w+` regex would mangle the
// ternary `? a : b` inside the function body.
let js = raw
  .replace("function isSafeDocUrl(raw: string): boolean {", "function isSafeDocUrl(raw) {")
  .replace("  let u: URL;", "  let u;")
  .replace("function publicIpv4(octs: number[]): boolean {", "function publicIpv4(octs) {")
  .replace("function publicIpv6(addr: string): boolean {", "function publicIpv6(addr) {")
  .replace("(side: string): number[] | null", "(side)")
  .replace("const out: number[] = [];", "const out = [];")
  .replace("(n: number)", "(n)")
  .replace("(hi: number, lo: number)", "(hi, lo)");

// eslint-disable-next-line no-new-func
const isSafeDocUrl = new Function("URL", `${js}; return isSafeDocUrl;`)(URL);

test("SSRF guard accepts public https/http URLs", () => {
  for (const url of [
    "https://example.com/doc.html",
    "http://example.com/plain.txt",
    "https://sub.domain.co.uk/a?b=c#frag",
    "https://checker.lazynext.com/report.html",
  ]) {
    assert.equal(isSafeDocUrl(url), true, url);
  }
});

test("SSRF guard blocks non-http(s) protocols", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com/doc",
    "gopher://example.com/x",
    "data:text/html,<x>",
    "javascript:alert(1)",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks private/loopback/link-local/CGNAT/metadata IPs", () => {
  for (const url of [
    "http://10.0.0.1/x",           // private
    "http://172.16.5.5/x",         // private
    "http://172.31.255.255/x",     // private (upper edge)
    "http://192.168.1.1/x",        // private
    "http://127.0.0.1/x",          // loopback
    "http://169.254.169.254/latest/meta-data", // cloud metadata
    "http://100.64.0.1/x",         // CGNAT
    "http://224.0.0.1/x",          // multicast
    "http://0.0.0.0/x",            // invalid
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks literal internal hostnames", () => {
  for (const url of [
    "http://localhost/x",
    "http://metadata.internal/latest/meta-data",
    "http://api.internal/query",
    "http://host.local/doc",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks IPv6 loopback/link-local", () => {
  for (const url of [
    "http://[::1]/x",
    "http://[fe80::1]/x",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks IPv4-mapped IPv6 (metadata vector)", () => {
  for (const url of [
    "http://[::ffff:169.254.169.254]/latest/meta-data", // EC2 metadata via v4-mapped
    "http://[::ffff:10.0.0.1]/x",                      // private via v4-mapped
    "http://[::ffff:127.0.0.1]/x",                     // loopback via v4-mapped
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard blocks metadata after WHATWG IPv6 normalization", () => {
  // new URL() rewrites these before the guard sees the hostname. The dotted
  // forms above stay blocked; these are the strings fetch actually classifies.
  for (const url of [
    "http://[::ffff:a9fe:a9fe]/latest/meta-data", // [::ffff:169.254.169.254]
    "http://[::ffff:7f00:1]/",                    // [::ffff:127.0.0.1]
    "http://[::ffff:a00:1]/",                     // [::ffff:10.0.0.1]
    "http://[::a9fe:a9fe]/",                      // [::169.254.169.254] compatible
    "http://[2002:a9fe:a9fe::]/",                 // 6to4 embedding
    "http://[64:ff9b::a9fe:a9fe]/",               // NAT64 embedding
    "http://[fc00::1]/",
    "http://[fd00::1]/",
    "http://[fe90::1]/",                          // fe80::/10, not just fe80::
    "http://[fec0::1]/",
    "http://[ff02::1]/",
    "http://[::]/",
  ]) {
    assert.equal(isSafeDocUrl(url), false, url);
  }
});

test("SSRF guard still allows public IPv6 and public embeddings", () => {
  for (const url of [
    "http://[2606:4700:4700::1111]/",
    "http://[2001:4860:4860::8888]/",
    "http://[::ffff:8.8.8.8]/",
    "http://[2002:0808:0808::]/",
    "http://[64:ff9b::808:808]/",
  ]) {
    assert.equal(isSafeDocUrl(url), true, url);
  }
});

test("doc snapshot follows redirects manually and re-checks the Location", () => {
  const snap = src.slice(src.indexOf("async function snapshotDoc"));
  assert.match(snap, /redirect:\s*"manual"/);
  assert.doesNotMatch(snap.slice(0, snap.indexOf("async function notifySigner")), /redirect:\s*"follow"/);
});