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
docker build -t lazynext/ai-slop-checker:1.2.0 .
docker run --rm -p 3000:3000 -e PORT=3000 lazynext/ai-slop-checker:1.2.0
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