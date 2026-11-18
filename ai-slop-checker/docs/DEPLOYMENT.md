# Deployment — Lazynext AI Slop Checker

This document describes how the product can be deployed. **Nothing here was
executed as part of this deliverable** — these are the run books, written
ahead of any deploy decision.

Two surfaces exist:

| Surface | Entry | Use |
|---|---|---|
| Local/container API | `node api/server.js` | primary; full surface incl. `POST /scan-project` (local filesystem), URL scans |
| Cloudflare Worker | `api/worker.js` | edge mirror; same HTTP contract, no local filesystem (`/scan-project` → 400) |

## 1. Docker (container API)

```sh
cd ai-slop-checker
docker build -t lazynext/ai-slop-checker:1.4.2 .
docker run --rm -p 3000:3000 -e PORT=3000 lazynext/ai-slop-checker:1.4.2
curl -s http://localhost:3000/health   # {"ok":true,"engine":"lazynext-ai-slop-checker",...}
```

The image is `node:20-alpine`, runs as a non-root user, exposes `3000`, and
has a `HEALTHCHECK` that polls `/health` every 30s. The `Dockerfile` copies
the product tree (api, data, src, web, assets, llms.txt, demo) — the package
has zero runtime dependencies, so no `npm install` step exists.

### Custom domain behind the container

Terminate TLS at your reverse proxy / load balancer and forward to
`127.0.0.1:3000`. If you use Cloudflare Tunnel (cloudflared), map the public
hostname to `http://localhost:3000` and keep `PORT=3000` in the container env.

## 2. Cloudflare Worker (edge)

Prereqs: `wrangler` (npx) and a Cloudflare account.

```sh
cd ai-slop-checker
# Deployment token note:
# - The monorepo's .env has CLOUDFLARE_DEPLOY_TOKEN (the real CF REST token,
#   used for wrangler deploys) and CLOUDFLARE_API_TOKEN (the platform-worker
#   bearer token — wrangler REJECTS it).
# - Map the deploy token for wrangler ONLY when deploying:
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DEPLOY_TOKEN"
# (or put the account id into wrangler.toml — account_id is a placeholder;
#  with `wrangler login` you can omit account_id entirely)
npx wrangler deploy --name lazynext-ai-slop-checker
```

The `wrangler.toml` points `main` at `api/worker.js`. The Worker mirrors the
full route set: `/`, `/health`, `/rules`, `/scan` (with `rules_url`),
`/scan-project` (400 — no filesystem), `/mcp`, `/a2a`, `/a2a/tasks/:id`,
`/.well-known/agent.json`, `/widget.js`, `/openapi.json`, `/llms.txt`.

### Custom domain binding

After the first deploy, bind a custom hostname via the dashboard
(Workers → your worker → Settings → Domains → Add) or the API:

```
PUT /accounts/{account_id}/workers/domains
{ "hostname": "slop-checker.lazynext.com",
  "service": "lazynext-ai-slop-checker",
  "environment": "production",
  "zone_id": "<zone>" }
```

> **House trap (from the sibling product):** deleting/replacing a worker
> script drops its `workers/domains` binding but leaves the proxied DNS
> record — every request then fast-fails 522. Re-bind via the same PUT after
> any recreate.

## 3. Environment & secrets

The product uses **no secrets**. It never reads API keys, tokens, or env
values beyond `PORT` (server) and nothing on the Worker. The `wrangler.toml`
contains only a placeholder `account_id`. If you ever add a secret-bearing
feature, use `wrangler secret put NAME` (and note the house rule that
`wrangler secret put` can silently fail — pipe via stdin when that happens).

## 4. Verification checklist (after any deploy)

- `GET /health` → `{"ok":true,...}` (200)
- `GET /rules` → 279 rules, 27 categories (count matches `data/slop-patterns.js`)
- `POST /scan {"text":"We must leverage this."}` → 200, `w-leverage` in matches
- `POST /mcp` initialize → 200 JSON-RPC handshake
- `GET /.well-known/agent.json` → 200 agent card
- `POST /scan-project` → **400 on the Worker** (expected), 200 on the container

## 5. Out of scope here

- No CI/CD pipeline is configured (the GitHub repo has no workflows for this
  product).
- No domain is provisioned; `slop-checker.lazynext.com` is the proposed
  canonical hostname but nothing is bound.
- No secrets, no paid features, no social posting.

## 6. Deploy-time gotchas (learned 2026-11-17)

The Worker **is** deployed and live (worker `lazynext-ai-slop-checker`,
canonical `https://slop-checker.lazynext.com`, workers.dev
`https://lazynext-ai-slop-checker.dry-hall-6a50.workers.dev`). The run book
above predates that first real deploy; the entries below are the
corrections learned at deploy time — treat them as part of the run book,
not a rewrite of sections 1–5.

0.1 **workerd rejects a pure-CJS `module.exports = { fetch }` bundle with
    error 10021** — the deploy succeeds but every request dies with
    `Error: No event handlers were registered` (code 10021), because
    workerd only registers handlers from a module worker's
    `export default { fetch }`. Fix: ship an ESM wrapper
    (`api/worker-module.mjs`) that imports the CJS core (`api/worker.js`)
    and re-exports it as the default, and point `wrangler.toml` `main` at
    the wrapper. Keep the core CJS so the Node suite stays require()-able
    (`test/worker.test.js`, `test/worker-edge.test.js`,
    `test/openapi-parity.test.js`), and keep the wrapper's export keys in
    lockstep with the core's `module.exports` (`fetch`, `isBlockedHost`).

0.2 **`[assets]` needs an explicit `binding = "ASSETS"`** — without it
    wrangler leaves the binding unset, `env.ASSETS` is undefined, and every
    static path silently falls back to the JSON descriptor instead of
    serving the branded `web/index.html` (and the asset-backed discovery
    files). Keep `directory` and, when the worker must stay in front of
    every request, `run_worker_first = true`.

0.3 **assets-runtime may 307 on `/web/index.html`** — passing the original
    request object straight into `env.ASSETS.fetch()` can return a 307
    (the assets runtime canonicalizes the path) instead of the file.
    Always build a **fresh** `Request` for the asset path (same method +
    headers) before calling `env.ASSETS.fetch`, so the fetch follows the
    canonicalization internally and the client sees a real 200. Keep the
    fresh Request's method the same as the original (GET *and* HEAD —
    HEAD-parity house convention).

0.4 **account_id + deploy steps are still per §2** — map
    `CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DEPLOY_TOKEN"` for `wrangler deploy`
    only. The custom-domain binding is the API PUT
    (`PUT /accounts/{account_id}/workers/domains`,
    `{"hostname":"slop-checker.lazynext.com","service":"lazynext-ai-slop-checker","environment":"production","zone_id":…}`)
    — the deploy token had `workers/domains` scope on 2026-11-17; if the
    PUT ever returns 401/403, the binding is a founder dashboard action
    per the monorepo AGENTS.md (Workers → the worker → Settings → Domains
    → Add). Re-creating the worker script drops the binding while the
    proxied DNS record stays — the fast-fail 522 trap — so re-apply the
    PUT after any recreate.

0.5 After any deploy, re-run the live guard once before calling it done:
    `npm run live` from `ai-slop-checker/` (scripts/live-check.js) asserts
    the whole surface — health, rules manifest, scan contract, MCP
    handshake, SSRF guard, asset gating, sibling-host isolation — against
    the real origin and exits non-zero on any failure.