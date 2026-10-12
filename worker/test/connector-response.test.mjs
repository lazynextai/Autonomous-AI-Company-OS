import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/services.ts", import.meta.url), "utf8");
const implementation = source.match(/async function connPost\([\s\S]*?\n}/)?.[0];
assert.ok(implementation, "shipped connPost implementation must exist");
const compiled = ts.transpileModule(implementation, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

async function dispatch(url, body, status = 200) {
  const request = new Function("fetch", `${compiled}; return connPost;`)(
    async () => new Response(JSON.stringify(body), { status }),
  );
  return request(url, { method: "POST" });
}

test("VK HTTP 200 authentication rejection is a failed dispatch", async () => {
  const result = await dispatch("https://api.vk.com/method/wall.post", {
    error: { error_code: 5, error_msg: "User authorization failed" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 200);
  assert.match(result.error, /VK API error 5: User authorization failed/);
});

test("VK post ID response remains successful", async () => {
  const result = await dispatch("https://api.vk.com/method/wall.post", {
    response: { post_id: 123 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.body.response.post_id, 123);
});

test("VK missing error detail still fails", async () => {
  const result = await dispatch("https://api.vk.com/method/wall.post", { error: {} });
  assert.equal(result.ok, false);
  assert.match(result.error, /request rejected/);
});

test("other provider HTTP success behavior remains unchanged", async () => {
  assert.equal((await dispatch("https://gitlab.com/api/v4/snippets", { id: 123 }, 201)).ok, true);
});

test("HTTP rejection remains failed", async () => {
  const result = await dispatch("https://api.vk.com/method/wall.post", { message: "Unavailable" }, 503);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Unavailable");
});

test("Hashnode HTTP 200 Pro-plan rejection is a failed dispatch", async () => {
  const result = await dispatch("https://gql-beta.hashnode.com/", {
    errors: [{ message: "Publication does not have an active Pro plan", extensions: { code: "FORBIDDEN" } }],
    data: { publishPost: null },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /active Pro plan/);
});

test("Hashnode post response remains successful", async () => {
  const result = await dispatch("https://gql-beta.hashnode.com/", {
    data: { publishPost: { post: { id: "123", url: "https://lazynext.hashnode.dev/example" } } },
  });
  assert.equal(result.ok, true);
});

test("Viber HTTP 200 API rejections are failed dispatches", async () => {
  for (const endpoint of ["send_message", "broadcast_message"]) {
    for (const body of [{ status: 2, status_message: "invalidAuthToken" },
      { status: 6, status_message: "receiverNotSubscribed" }, {}, { status: false }]) {
      const result = await dispatch(`https://chatapi.viber.com/pa/${endpoint}`, body);
      assert.equal(result.ok, false);
      assert.equal(result.status, 200);
      assert.match(result.error, /Viber API error/);
    }
  }
});

test("Viber numeric status zero succeeds without masking HTTP failure", async () => {
  const body = { status: 0, message_token: 123 };
  assert.equal((await dispatch("https://chatapi.viber.com/pa/send_message", body)).ok, true);
  assert.equal((await dispatch("https://chatapi.viber.com/pa/send_message", body, 503)).ok, false);
});

test("Hashnode PAT fallback sends the current endpoint and Bearer authentication", async () => {
  const block = source.slice(source.indexOf('    case "hashnode": {'), source.indexOf('    case "medium": {'));
  const lifted = ts.transpileModule(`async function send(cred, b, text) { switch ("hashnode") { ${block} } }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const send = new Function("connPost", `${lifted}; return send;`)(async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 401, body: {} };
  });
  await send("test-token:publication", {}, "Example");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://gql-beta.hashnode.com/");
  assert.equal(calls[1].init.headers.authorization, "Bearer test-token");
  assert.equal(JSON.parse(calls[1].init.body).variables.input.publicationId, "publication");
});
