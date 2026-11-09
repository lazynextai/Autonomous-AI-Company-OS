// Connector capability metadata + dry-run dispatch (LinkedIn staged plan
// A1/A2/A6).
//
// What this pins:
//   1. PARITY — the capability table and the dispatch registry are the same
//      set of connectors, in both directions. Adding a connector without a
//      capability row (or leaving a stale row) fails here, which is the whole
//      point of turning capability into data.
//   2. NO NETWORK — a dry run of every supported connector is executed with
//      `fetch` and `WebSocket` replaced by throwers. If any branch reached a
//      provider, this suite explodes instead of silently posting.
//   3. FIDELITY — the rendered request is the request the real path builds
//      (same URL, method, headers, body), because it is the same code.
//   4. REDACTION — no credential material survives into the preview.
//   5. The route: `dry_run:true` short-circuits before the breaker, the
//      decision gate and the decision package, writes no row, and says so.
import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, fakeCtx, fakeDb, fakeKv, readJson } from "./helpers/lift.mjs";

const jsonFn = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const caps = loadModule("capabilities.ts", {}, [
  "CONNECTOR_CAPABILITIES",
  "CONNECTOR_CAPABILITY_IDS",
  "capabilityOf",
  "capabilityReport",
]);

// The dispatch registry lives in services.ts next to `callConnector`; lift the
// table from there so the parity check compares shipped code to shipped code.
const servicesModule = (overrides = {}) =>
  loadModule(
    "services.ts",
    {
      json: jsonFn,
      authorize: async () => ({ key: { id: 1, scopes: "admin" } }),
      touchKey: () => {},
      listAll: async () => [],
      publishToBus: async () => 1,
      recordLeadEvidence: async () => jsonFn({}),
      listLeadEvidence: async () => jsonFn({}),
      evidenceSummary: async () => jsonFn({}),
      evidenceCorroborations: async () => jsonFn({}),
      outboundDecision: async () => ({ allow: true, stats: {} }),
      noteBreakerTrip: async () => {},
      recordDispatchAudit: async () => {},
      decisionGate: async () => ({ allow: true, scope: "off" }),
      openDispatchDecision: async () => ({ id: 1 }),
      closeDispatchDecision: async () => {},
      recordDispatchLedger: async () => {},
      estimateCostCents: () => 0,
      breakerAdmin: async () => jsonFn({}),
      puppeteer: {},
      CONNECTOR_CAPABILITIES: caps.CONNECTOR_CAPABILITIES,
      capabilityOf: caps.capabilityOf,
      capabilityReport: caps.capabilityReport,
      ...overrides,
    },
    ["handleServices", "CONNECTOR_IDS", "dryRunConnector"],
  );

// --- 1. capability ↔ registry parity ---------------------------------------
test("every dispatched connector has exactly one capability row", () => {
  const { CONNECTOR_IDS } = servicesModule();
  assert.deepEqual(
    [...caps.CONNECTOR_CAPABILITY_IDS].sort(),
    [...CONNECTOR_IDS].sort(),
    "capability table and CONNECTOR_IDS must cover the same ids",
  );
});

test("capability rows are well formed", () => {
  const AUTH_KINDS = new Set([
    "oauth2_org", "oauth2_user", "bearer", "app_password", "api_key",
    "bot_token", "basic", "session", "webhook", "relay", "none",
  ]);
  for (const [id, c] of Object.entries(caps.CONNECTOR_CAPABILITIES)) {
    assert.ok(AUTH_KINDS.has(c.auth_kind), `${id}: unknown auth_kind '${c.auth_kind}'`);
    assert.equal(typeof c.supports_dry_run, "boolean", `${id}: supports_dry_run must be boolean`);
    assert.equal(c.rate_limit.enforced, false, `${id}: rate_limit is declared, not enforced`);
    assert.ok(
      c.rate_limit.per_day === null || (Number.isInteger(c.rate_limit.per_day) && c.rate_limit.per_day > 0),
      `${id}: per_day must be null or a positive integer`,
    );
    assert.ok(c.credential_hint.length > 0, `${id}: credential_hint must describe the shape`);
    // A credential HINT is a shape, never a value. Guard against someone
    // pasting a real token in: long opaque hex/base64 runs are not shapes.
    assert.doesNotMatch(c.credential_hint, /[A-Za-z0-9_-]{32,}/, `${id}: credential_hint looks like a value`);
    if (!c.supports_dry_run) assert.ok(c.dry_run_note, `${id}: an unsupported connector must say why`);
  }
});

test("configured is derived, never stored in the table", () => {
  for (const [id, c] of Object.entries(caps.CONNECTOR_CAPABILITIES))
    assert.equal("configured" in c, false, `${id}: 'configured' must be derived at request time`);
  const report = caps.capabilityReport((id) => id === "x");
  assert.equal(report.x.configured, true);
  assert.equal(report.linkedin.configured, false);
  assert.equal(report.x.auth_kind, caps.CONNECTOR_CAPABILITIES.x.auth_kind);
});

// --- fixtures --------------------------------------------------------------
// Plausible SHAPES only — nothing here is a real credential.
const CREDS = {
  x: "fake-x-bearer-token",
  linkedin: "fake-linkedin-token-1234:987654",
  meta: "fake-meta-token:act_id",
  facebook: "fake-page-token:page_id",
  instagram: "fake-ig-token:ig_user",
  threads: "fake-threads-token:threads_user",
  bluesky: "handle.invalid:app-password-1234",
  mastodon: "mastodon.invalid:fake-token",
  reddit: "fake-session-cookie:loid1234:testsub",
  pinterest: "fake-pinterest-token:board_id",
  vk: "fake-vk-token:-123456",
  youtube: "fake-youtube-token",
  tiktok: "fake-tiktok-token",
  gmb: "fake-gmb-token:accounts/1/locations/2",
  discord: "https://discord.invalid/api/webhooks/1/fake-webhook-token",
  slack: "https://hooks.slack.invalid/services/T000/B000/fake-webhook-token",
  telegram: "123456:fake-bot-token:chat_id",
  matrix: "https://matrix.invalid|!room:matrix.invalid|fake-token",
  teams: "https://prod-1.westus.logic.azure.invalid/workflows/fake",
  mattermost: "https://mattermost.invalid/hooks/fake-hook-token",
  zulip: "https://zulip.invalid|bot@zulip.invalid|fake-zulip-key",
  viber: "fake-viber-token",
  line: "fake-line-channel-token",
  devto: "fake-devto-key",
  hashnode: "fake-hashnode-token:publication_id",
  medium: "uid1234|session1234|xsrf1234",
  wordpress: "https://wp.invalid|editor|fake-app-password",
  github: "fake-github-pat",
  gitlab: "fake-gitlab-pat",
  tumblr: "fake-tumblr-token:blogname",
  ghost: "https://ghost.invalid|keyid:fake_ghost_secret_value",
  beehiiv: "fake-beehiiv-key:pub_id",
  lemmy: "https://lemmy.invalid|user|fake-password",
  listmonk: "https://listmonk.invalid|user|fake-pass|1",
  webhook: "https://webhook.invalid/abc|fake-bearer",
  ayrshare: "fake-ayrshare-key",
  postiz: "fake-postiz-key|integration_id|https://postiz.invalid/api",
  buffer: "fake-buffer-key:channel_id",
  letmepost: "fake-letmepost-key|acct1234",
  twilio: "ACfake:fake-twilio-token:+15550000000",
  whatsapp: "fake-wa-token:phone_number_id",
};

const PAYLOAD = {
  text: "A short preview payload",
  to: "recipient@example.com",
  subject: "Subject line",
  image_url: "https://lazynext.com/og.png",
  media_url: "https://lazynext.com/og.png",
};

const fakeEnv = (kv = {}) => ({ EPHEMERAL: fakeKv(kv), DB: fakeDb([]) });

/** Run the whole supported set with the network removed from the runtime. */
async function withNoNetwork(fn) {
  const realFetch = globalThis.fetch;
  const realWs = globalThis.WebSocket;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("dry run attempted a network call");
  };
  globalThis.WebSocket = class {
    constructor() {
      calls += 1;
      throw new Error("dry run opened a websocket");
    }
  };
  try {
    return { result: await fn(), calls };
  } finally {
    globalThis.fetch = realFetch;
    globalThis.WebSocket = realWs;
  }
}

const supported = caps.CONNECTOR_CAPABILITY_IDS.filter((id) => caps.capabilityOf(id).supports_dry_run);

test("a dry run of every supported connector touches no network", async () => {
  const { dryRunConnector } = servicesModule();
  const env = fakeEnv({ "conn:ayrshare": "fake-ayrshare-key" });
  const rendered = [];
  const { calls } = await withNoNetwork(async () => {
    for (const id of supported) {
      const report = await dryRunConnector(env, id, CREDS[id], PAYLOAD);
      rendered.push([id, report]);
    }
  });
  assert.equal(calls, 0, "a dry run must not call fetch or open a socket");
  for (const [id, report] of rendered) {
    assert.equal(report.supported, true, `${id}: should support dry run`);
    assert.ok(report.calls.length >= 1, `${id}: rendered no request`);
    assert.equal(report.dry_run, true);
    for (const w of report.warnings) assert.doesNotMatch(w, /incomplete/, `${id}: ${w}`);
  }
});

test("previews are complete for the connectors that need no extra media", async () => {
  const { dryRunConnector } = servicesModule();
  const env = fakeEnv({ "conn:ayrshare": "fake-ayrshare-key" });
  const textOnly = supported.filter((id) => !["instagram", "youtube", "tiktok", "pinterest"].includes(id));
  const incomplete = [];
  await withNoNetwork(async () => {
    for (const id of textOnly) {
      const report = await dryRunConnector(env, id, CREDS[id], { ...PAYLOAD });
      if (!report.preview_ok) incomplete.push([id, report.error]);
    }
  });
  assert.deepEqual(incomplete, [], "every text-capable connector should build a request from a text payload");
});

test("rendered request is the real request (x and linkedin)", async () => {
  const { dryRunConnector } = servicesModule();
  const env = fakeEnv();

  const x = await withNoNetwork(() => dryRunConnector(env, "x", "fake-x-bearer-token", { text: "hello world" }));
  assert.equal(x.result.calls.length, 1);
  assert.equal(x.result.calls[0].method, "POST");
  assert.equal(x.result.calls[0].url, "https://api.x.com/2/tweets");
  assert.equal(x.result.calls[0].headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(x.result.calls[0].body), { text: "hello world" });

  const li = await withNoNetwork(() => dryRunConnector(env, "linkedin", "fake-linkedin-token-1234:987654", { text: "hi" }));
  assert.equal(li.result.calls[0].url, "https://api.linkedin.com/rest/posts");
  assert.equal(li.result.calls[0].headers["linkedin-version"], "202609");
  assert.equal(li.result.calls[0].headers["x-restli-protocol-version"], "2.0.0");
  const body = JSON.parse(li.result.calls[0].body);
  assert.equal(body.author, "urn:li:organization:987654");
  assert.equal(body.commentary, "hi");
  assert.equal(body.visibility, "PUBLIC");
  assert.equal(body.lifecycleState, "PUBLISHED");
});

test("no credential material survives into a preview", async () => {
  const { dryRunConnector } = servicesModule();
  const env = fakeEnv();
  const secret = "SUPERSECRET-LINKEDIN-TOKEN-0123456789";
  const report = await withNoNetwork(() => dryRunConnector(env, "linkedin", `${secret}:987654`, { text: "hi" }));
  const serialized = JSON.stringify(report.result);
  assert.equal(serialized.includes(secret), false, "the token must not appear anywhere in the report");
  assert.match(report.result.calls[0].headers.authorization, /^Bearer «redacted»$/);
  // The author URN is not a secret and a reviewer needs it — it stays.
  assert.match(report.result.calls[0].body, /urn:li:organization:987654/);

  // Webhook connectors use the URL itself as the credential.
  const hook = "https://discord.invalid/api/webhooks/1/very-secret-webhook-token";
  const d = await withNoNetwork(() => dryRunConnector(env, "discord", hook, { text: "hi" }));
  assert.equal(JSON.stringify(d.result).includes("very-secret-webhook-token"), false);
});

test("connectors with no capturable transport refuse instead of pretending", async () => {
  const { dryRunConnector } = servicesModule();
  const env = fakeEnv();
  for (const id of caps.CONNECTOR_CAPABILITY_IDS.filter((i) => !caps.capabilityOf(i).supports_dry_run)) {
    const { result, calls } = await withNoNetwork(() => dryRunConnector(env, id, "fake-credential-value", PAYLOAD));
    assert.equal(result.supported, false, `${id}: must report unsupported`);
    assert.equal(result.calls.length, 0, `${id}: must render nothing`);
    assert.ok(result.error, `${id}: must explain why`);
    assert.equal(calls, 0);
  }
});

// --- 5. the route ----------------------------------------------------------
function routeEnv({ kv = {}, gate = async () => ({ allow: true }), audit = [] } = {}) {
  const db = fakeDb([]);
  const env = { EPHEMERAL: fakeKv(kv), DB: db, API_TOKEN: "tok" };
  return { env, db, audit, gate };
}

test("POST /api/v1/connectors/{id} with dry_run skips gate, breaker and ledger", async () => {
  const gateCalls = [];
  const audit = [];
  const modules = servicesModule({
    decisionGate: async (...args) => { gateCalls.push(args); return { allow: false, reason: "should never be consulted" }; },
    outboundDecision: async () => { throw new Error("breaker must be skipped for a dry run"); },
    openDispatchDecision: async () => { throw new Error("no decision package for a dry run"); },
    recordDispatchAudit: async (_env, id, ok, status, source, extra) => { audit.push({ id, ok, status, source, extra }); },
  });
  const { env, db } = routeEnv({ kv: { "conn:x": "fake-x-bearer-token" } });
  const { calls, result } = await withNoNetwork(() =>
    modules.handleServices(
      new Request("https://ai-company.lazynext.com/api/v1/connectors/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "preview me", dry_run: true }),
      }),
      env, fakeCtx(), "/api/v1/connectors/x",
    ),
  );
  assert.equal(calls, 0);
  const body = await readJson(result);
  assert.equal(body.dry_run, true);
  assert.equal(body.gate, "skipped_dry_run");
  assert.equal(body.supported, true);
  assert.equal(body.decision_id, undefined, "a dry run opens no decision package");
  assert.deepEqual(JSON.parse(body.calls[0].body), { text: "preview me" });
  assert.equal(gateCalls.length, 0, "the decision gate must not be consulted");
  assert.equal(db.calls.length, 0, "a dry run writes no row");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].id, "x");
  assert.equal(audit[0].extra.mode, "dry_run");
  assert.equal(audit[0].extra.gate, "skipped_dry_run");
});

test("a real dispatch still runs the gate and is blocked when it says no", async () => {
  const modules = servicesModule({
    decisionGate: async () => ({ allow: false, reason: "no approved package for x", scope: "approval" }),
  });
  const { env } = routeEnv({ kv: { "conn:x": "fake-x-bearer-token" } });
  const { calls, result } = await withNoNetwork(() =>
    modules.handleServices(
      new Request("https://ai-company.lazynext.com/api/v1/connectors/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "ship it" }),
      }),
      env, fakeCtx(), "/api/v1/connectors/x",
    ),
  );
  const body = await readJson(result);
  assert.equal(body.error, "blocked by decision gate — missing approval");
  assert.equal(calls, 0, "a blocked send must not reach the provider");
});

test("unknown and unconnected connectors keep their existing contracts", async () => {
  const modules = servicesModule();
  const { env } = routeEnv({});
  const unknown = await modules.handleServices(
    new Request("https://ai-company.lazynext.com/api/v1/connectors/nope", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x", dry_run: true }),
    }),
    env, fakeCtx(), "/api/v1/connectors/nope",
  );
  assert.equal(unknown.status, 404);

  const unconnected = await modules.handleServices(
    new Request("https://ai-company.lazynext.com/api/v1/connectors/linkedin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x", dry_run: true }),
    }),
    env, fakeCtx(), "/api/v1/connectors/linkedin",
  );
  assert.equal(unconnected.status, 503, "a preview of an unconnected connector is a 503, like the real send");
});

test("GET /api/v1/connectors reports capabilities with derived configured flags", async () => {
  const modules = servicesModule();
  const { env } = routeEnv({ kv: { "conn:x": "fake-x-bearer-token" } });
  const res = await modules.handleServices(
    new Request("https://ai-company.lazynext.com/api/v1/connectors", { method: "GET" }),
    env, fakeCtx(), "/api/v1/connectors",
  );
  const body = await readJson(res);
  assert.equal(body.connectors.x, true, "the original boolean map is unchanged");
  assert.equal(body.capabilities.x.configured, true);
  assert.equal(body.capabilities.linkedin.configured, false);
  assert.equal(body.capabilities.brevo.configured, false);
  assert.equal(body.capabilities.linkedin.supports_dry_run, true);
  assert.equal(body.capabilities.brevo.supports_dry_run, false);
  assert.equal(body.capabilities.x.rate_limit.per_day, 17);
  assert.equal(body.capabilities.x.rate_limit.enforced, false);
});
