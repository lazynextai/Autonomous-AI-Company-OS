// Marketing-footer consent regressions (2026-11-04).
//
// The old footer hardcoded one sentence: "You're receiving this because you
// signed up at Accessibility Checker…". TRUE for sequence/waitlist recipients,
// FALSE for cold campaign audiences (Serper-discovered prospects whose
// addresses were published on company websites — they never signed up). A
// false consent line is exactly what a spam complaint cites, so the footer now
// takes a consent basis: 'opt_in' (byte-identical to the original) or
// 'prospect' (accurate source line, no consent claim, same unsubscribe +
// postal block). Functions are lifted out of src/services.ts like
// campaign-segment.test.mjs — the test cannot drift.
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
const indexSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/index.ts"),
  "utf8",
);
const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../db/migrations/013_campaign_consent.sql"),
  "utf8",
);

const grab = (re) => {
  const m = src.match(re);
  assert.ok(m, `lift target not found in src/services.ts: ${re}`);
  return m[0].replace(/^export /, "");
};

// Lift the footer together with its dependencies, in dependency order, into
// one scope. Type annotations are erased by transpileModule.
const parts = [
  grab(/export async function unsubSig[\s\S]*?\n\}/),
  grab(/export async function unsubUrl[\s\S]*?\n\}/),
  grab(/const CONSENT_LINE[\s\S]*?\n\};/),
  grab(/export async function marketingFooter[\s\S]*?\n\}/),
  grab(/export function campaignConsentBasis[\s\S]*?\n\}/),
].map((s) =>
  ts.transpileModule(s, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
).join("\n");
const lifted = new Function(`${parts}; return { marketingFooter, campaignConsentBasis, unsubUrl };`)();

const EMAIL = "someone@example.com";
const ADDR = "NO. 472/7 BALAJI ARCADE, Bengaluru 560095, India";
const envWithAddr = {
  API_TOKEN: "test-secret",
  COMPANY_ADDRESS: ADDR,
  EPHEMERAL: { get: async () => null },
};
const envNoAddr = {
  API_TOKEN: "test-secret",
  COMPANY_ADDRESS: undefined,
  EPHEMERAL: { get: async () => null },
};

test("opt_in footer is byte-identical to the pre-change output", async () => {
  const url = await lifted.unsubUrl(envWithAddr, EMAIL);
  const expected = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">` +
    `<p style="font-size:12px;color:#64748b;line-height:1.5">You're receiving ` +
    `this because you signed up at Accessibility Checker for product updates ` +
    `and a discount code. <a href="${url}">Unsubscribe</a> anytime — these ` +
    `emails stop immediately.<br>Lazynext · ${ADDR}</p>`;
  const got = await lifted.marketingFooter(envWithAddr, EMAIL);
  assert.equal(got, expected);
  // Explicitly: the opt_in sentence must not leak the prospect wording.
  assert.ok(!got.includes("published on your company's website"));
});

test("opt_in is the default when no basis is passed", async () => {
  const got = await lifted.marketingFooter(envNoAddr, EMAIL);
  assert.ok(got.includes("you signed up at Accessibility Checker for product updates"));
  assert.ok(!got.includes("Lazynext · ")); // no address configured -> no block
});

test("prospect footer states the real source, keeps unsubscribe and postal address", async () => {
  const url = await lifted.unsubUrl(envWithAddr, EMAIL);
  const got = await lifted.marketingFooter(envWithAddr, EMAIL, "prospect");
  // Accurate source line — factual, no consent claim, no urgency.
  assert.ok(got.includes("A short outreach note, not a newsletter."));
  assert.ok(got.includes("your business email is published on your company's website"));
  // Same opt-out affordance and same legal postal block as opt_in.
  assert.ok(got.includes(`<a href="${url}">Unsubscribe</a>`));
  assert.ok(got.includes(`Lazynext · ${ADDR}`));
  // It must NOT claim they signed up or that a discount was promised.
  assert.ok(!got.includes("signed up at Accessibility Checker"));
  assert.ok(!got.includes("discount code"));
});

test("campaignConsentBasis selects prospect only when set, else opt_in", () => {
  assert.equal(lifted.campaignConsentBasis({ consent_basis: "prospect" }), "prospect");
  assert.equal(lifted.campaignConsentBasis({ consent_basis: "Prospect " }), "prospect");
  assert.equal(lifted.campaignConsentBasis({ consent_basis: "opt_in" }), "opt_in");
  assert.equal(lifted.campaignConsentBasis({}), "opt_in");
  assert.equal(lifted.campaignConsentBasis({ consent_basis: null }), "opt_in");
  assert.equal(lifted.campaignConsentBasis(null), "opt_in");
  assert.equal(lifted.campaignConsentBasis({ consent_basis: "everything" }), "opt_in");
});

test("send loop passes the persisted consent_basis to the footer", () => {
  assert.match(src, /const consentBasis = campaignConsentBasis\(camp\);/);
  assert.match(src, /marketingFooter\(env, c\.email, consentBasis\)/);
  assert.match(src, /consent_basis: consentBasis/); // echoed in the send response
});

test("sequence callers keep the no-basis call — opt_in by default", () => {
  // enrollLead (services.ts) sends sequence stage 0; index.ts stage 2/3.
  assert.ok(src.includes("SEQUENCE[0].html + await marketingFooter(env, email)"));
  assert.ok(indexSrc.includes("SEQUENCE[stage].html + await marketingFooter(env, email)"));
  // No sequence call site passes a basis — they must stay byte-identical.
  assert.equal((src.match(/marketingFooter\(env, email\)/g) ?? []).length, 1);
  assert.equal((src.match(/marketingFooter\(env, email, /g) ?? []).length, 0);
  assert.equal((indexSrc.match(/marketingFooter\(env, email, /g) ?? []).length, 0);
});

test("campaign creation stamps consent_basis and rejects unknown values", () => {
  assert.match(src, /"name", "subject", "html", "segment", "consent_basis"/);
  assert.match(src, /consent_basis must be 'opt_in' or 'prospect'/);
});

test("migration 013 adds the column and stamps campaign 9 prospect", () => {
  assert.match(migration, /ALTER TABLE email_campaigns ADD COLUMN consent_basis TEXT NOT NULL DEFAULT 'opt_in'/);
  assert.match(migration, /id = 9 AND name = 'outreach-shipped-stack-2026-11-03'/);
});