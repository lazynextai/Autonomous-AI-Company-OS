// Honest engagement metrics regressions (2026-11-05). Campaign 9 reported
// "13 opens + 1 click" that was mostly robots: the single click was a mail
// scanner prefetching the /unsubscribe footer link 4m17s after send. These
// tests pin the classifier that now separates human product clicks from
// prefetches, the stats fields built from it, and the campaign UTM stamper.
// Functions are lifted out of src/services.ts and transpiled — the test
// cannot drift from the implementation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/services.ts"),
  "utf8",
);

const liftFn = (name) => {
  const m = src.match(new RegExp(`export function ${name}[\\s\\S]*?\\n}`));
  assert.ok(m, `${name} not found in src/services.ts`);
  return m[0].replace(/^export /, "");
};
const patterns = src.match(/const BOT_UA_PATTERNS = \[[\s\S]*?\n\];/);
assert.ok(patterns, "BOT_UA_PATTERNS not found in src/services.ts");
const productHost = src.match(/const UTM_PRODUCT_HOST = "[^"]+";/);
assert.ok(productHost, "UTM_PRODUCT_HOST not found in src/services.ts");

const js = ts.transpileModule(
  patterns[0]
    + "\n" + productHost[0]
    + "\n" + liftFn("classifyClick")
    + "\n" + liftFn("leadEngagement")
    + "\n" + liftFn("engagementSummary")
    + "\n" + liftFn("marketingStatsBody")
    + "\n" + liftFn("addCampaignUtm"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { classifyClick, leadEngagement, engagementSummary, marketingStatsBody,
  addCampaignUtm } = new Function(
  `${js}; return { classifyClick, leadEngagement, engagementSummary, `
  + `marketingStatsBody, addCampaignUtm };`)();

const DAY = "2026-11-05";
const HUMAN_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
  + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const UNSUB = "https://checker.lazynext.com/unsubscribe"
  + "?email=info%40aph.org&sig=0123456789abcdef01234567";

// --- Classification ---------------------------------------------------------

test("an unsubscribe-link click is never engagement and never promotes", () => {
  const verdict = classifyClick({ event: "click", link: UNSUB },
    { userAgent: HUMAN_UA }, DAY);
  assert.equal(verdict.kind, "unsubscribe");
  // Even with a human UA and no timing signal, an opt-out fetch is
  // housekeeping, not product interest.
  assert.equal(leadEngagement({ event: "click", link: UNSUB }, DAY,
    { userAgent: HUMAN_UA }), null);
});

test("a Brevo tracking-wrapped unsubscribe link is classified the same", () => {
  const wrapped = "https://trk.example.com/redirect?u=https%3A%2F%2Fchecker."
    + "lazynext.com%2Funsubscribe%3Femail%3Da%2540b.c";
  assert.equal(classifyClick({ event: "click", link: wrapped }, {}, DAY).kind,
    "unsubscribe");
});

test("scanner / image-proxy user agents are bot clicks, never humans", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; GoogleImageProxy)",
    "YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html",
    "Microsoft Outlook 16.0 (Exchange image proxy)",
    "Mozilla/5.0 (compatible; Proofpoint URL Defense)",
    "Barracuda Sentinel link protection",
    "Mimecast URL Protect",
    "python-requests/2.31",
    "curl/8.4.0",
    "Wget/1.21",
    "Mozilla/5.0 HeadlessChrome/141.0",
    "Mozilla/5.0 (PhantomJS)",
    "Slackbot-LinkExpanding 1.0",
  ]) {
    const verdict = classifyClick({ event: "click", link: "https://checker.lazynext.com/checkout" },
      { userAgent: ua }, DAY);
    assert.equal(verdict.kind, "bot", `expected bot for UA: ${ua}`);
    assert.equal(leadEngagement({ event: "click", link: "https://checker.lazynext.com/checkout" },
      DAY, { userAgent: ua }), null);
  }
});

test("a HEAD probe is a prefetch by definition", () => {
  const verdict = classifyClick({ event: "click", link: "https://checker.lazynext.com/checkout" },
    { method: "HEAD", userAgent: HUMAN_UA }, DAY);
  assert.deepEqual(verdict, { kind: "bot", reason: "head-request" });
});

test("unsubscribe within 10s of send is flagged as automation, later is not", () => {
  const early = classifyClick(
    { event: "click", link: UNSUB, ts_epoch: 1_005 },
    { userAgent: HUMAN_UA, sentAtEpoch: 1_000 }, DAY);
  assert.deepEqual(early, { kind: "bot", reason: "unsubscribe-within-10s-of-send" });
  const tenSec = classifyClick(
    { event: "click", link: UNSUB, ts_epoch: 1_010 },
    { sentAtEpoch: 1_000 }, DAY);
  assert.equal(tenSec.kind, "unsubscribe");
  const late = classifyClick(
    { event: "click", link: UNSUB, ts_epoch: 1_257 },
    { sentAtEpoch: 1_000 }, DAY);
  assert.equal(late.kind, "unsubscribe");
});

test("a real product/checkout click with a human UA is engagement", () => {
  const verdict = classifyClick(
    { event: "click", link: "https://checker.lazynext.com/checkout?utm_source=email&utm_campaign=11" },
    { userAgent: HUMAN_UA }, DAY);
  assert.deepEqual(verdict, { kind: "human", stamp: "clicked-trial:2026-11-05" });
  assert.equal(leadEngagement(
    { event: "click", link: "https://lazynext.com/pricing" }, DAY, { userAgent: HUMAN_UA }),
    "clicked:2026-11-05");
});

test("non-click events still never classify as engagement", () => {
  for (const event of ["opened", "unique_opened", "delivered", "hard_bounce",
    "spam", "unsubscribed", "click_bot"]) {
    assert.equal(classifyClick({ event, link: UNSUB }, { userAgent: HUMAN_UA }, DAY).kind,
      "not_click");
    assert.equal(leadEngagement({ event, link: UNSUB }, DAY), null);
  }
});

// --- Stats fields -----------------------------------------------------------

test("stats expose honest clicks without changing the raw fields", () => {
  const totals = [
    { event: "click", c: 3, uniq: 2 },
    { event: "click_bot", c: 4, uniq: 3 },
    { event: "click_unsubscribe", c: 1, uniq: 1 },
    { event: "opened", c: 9, uniq: 5 },
  ];
  const byTag = [{ tag: "campaign:9", event: "click", c: 3, uniq: 2 }];
  const recent = [{ event: "click", email: "a@b.c" }];
  const body = marketingStatsBody(totals, byTag, recent);
  assert.equal(body.human_clicks, 3);
  assert.equal(body.bot_clicks, 4);
  assert.equal(body.unsubscribe_clicks, 1);
  assert.equal(body.opens_are_proxy_inflated, true);
  // Backward compatibility: the raw fields are the untouched query results.
  assert.deepEqual(body.totals, totals);
  assert.deepEqual(body.by_tag, byTag);
  assert.deepEqual(body.recent, recent);
  assert.deepEqual(engagementSummary(totals), {
    human_clicks: 3, bot_clicks: 4, unsubscribe_clicks: 1,
  });
  assert.deepEqual(engagementSummary([]), {
    human_clicks: 0, bot_clicks: 0, unsubscribe_clicks: 0,
  });
});

// --- Campaign UTM stamper ---------------------------------------------------

test("product links get a campaign UTM marker, unsubscribe stays clean", () => {
  const html = `<p><a href="https://checker.lazynext.com/checkout?trial=extended">Go Pro</a></p>`
    + `<p><a href="${UNSUB.replace(/&/g, "&amp;")}">Unsubscribe</a></p>`
    + `<p><a href="https://lazynext.com/blog">Blog</a></p>`
    + `<p><a href="mailto:support@lazynext.com">Mail us</a></p>`;
  const out = addCampaignUtm(html, 11);
  // Product link keeps its own query params and gains the campaign marker.
  assert.match(out, /href="https:\/\/checker\.lazynext\.com\/checkout\?trial=extended&amp;utm_source=email&amp;utm_medium=campaign&amp;utm_campaign=11"/);
  // Unsubscribe link is byte-identical — first-party, HMAC-signed, untracked.
  assert.ok(out.includes(`href="${UNSUB.replace(/&/g, "&amp;")}"`));
  // Non-product hosts and non-http schemes are untouched.
  assert.ok(out.includes('href="https://lazynext.com/blog"'));
  assert.ok(out.includes('href="mailto:support@lazynext.com"'));
});

test("UTM stamping is idempotent across the draft + send passes", () => {
  const once = addCampaignUtm('<a href="https://checker.lazynext.com/checkout">x</a>', 11);
  const twice = addCampaignUtm(once, 11);
  assert.equal(twice, once);
  assert.equal((once.match(/utm_campaign/g) ?? []).length, 1);
  // A root product link normalizes to the same URL on every pass (the URL
  // parser adds the bare-path slash), so a draft body stamped at authoring
  // time is byte-identical after the send-path pass.
  const root = addCampaignUtm('<a href="https://checker.lazynext.com">x</a>', 11);
  assert.equal(root, addCampaignUtm(root, 11));
  assert.match(root, /href="https:\/\/checker\.lazynext\.com\/\?utm_source=email&amp;utm_medium=campaign&amp;utm_campaign=11"/);
});
