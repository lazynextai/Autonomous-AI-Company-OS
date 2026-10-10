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
