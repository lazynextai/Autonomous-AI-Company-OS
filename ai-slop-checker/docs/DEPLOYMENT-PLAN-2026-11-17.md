# Deployment Plan — Lazynext AI Slop Checker (v1.4.1)

**Date:** 2026-11-17
**Product:** `ai-slop-checker/` v1.4.1 (merged to `main` as `145f307` via PR #92, 2026-11-17)
**Status:** PLANNING ONLY — nothing in this document was executed. No deploy, no domain binding,
no account or service creation, no posting. The run book below runs **only after founder
authorization** in a later session.
**Decision asked of the founder:** see the authorization checklist (§F).

Facts in this document come from reading the product tree (`wrangler.toml`, `Dockerfile`,
`.dockerignore`, `docs/DEPLOYMENT.md`, `api/worker.js`, `api/server.js`, `web/`, `package.json`,
`test/worker.test.js`, `ROADMAP.md`, `docs/RELEASE-2026-11-17.md`) and the sibling product's
deploy patterns (`products/accessibility-checker/scripts/deploy.mjs`, house `AGENTS.md`). No
command in this document was run against any live environment.

---

## A. Decision matrix — recommended primary path

Three ways to host the product, compared honestly:

| Option | What you get | What it costs | Verdict |
|---|---|---|---|
| **(i) Cloudflare Worker** (wrangler.toml already exists; `api/worker.js` is the edge entry) | Full API surface (`/scan`, `/judge`, `/rules`, `/openapi.json`, `/mcp`, `/a2a`, agent card), global edge, same-origin web checker, zero new infra | Needs `CLOUDFLARE_DEPLOY_TOKEN` auth; a small pre-deploy patch to make `/llms.txt` + `/openapi.json` edge-portable (they use `node:fs` today); one custom-domain binding | **RECOMMENDED PRIMARY** |
| **(ii) Docker** (existing `Dockerfile`, node:20-alpine, non-root, port 3000, HEALTHCHECK) | One persistent Node process with the full local surface incl. `POST /scan-project` (local filesystem) | Needs image build + registry push + container/DO hosting + health/restart supervision; heaviest option; more moving parts than the feature set justifies (see §D) | Secondary fallback only |
| **(iii) Static-only hosting of `web/`** | The web checker runs the engine fully in-browser today (it loads `src/scanner.js` etc. as browser globals) | Loses the API surface: `/scan` server-side URL fetch, `/judge`, `/rules`, `/mcp`, `/a2a`, agent card, `/openapi.json`, `/llms.txt`, same-origin URL scans | Rejected as primary; useful only as a graceful-degradation story if the API is ever switched off |

### Why the Worker wins

- **The product already ships a Workers entry.** `wrangler.toml` (`name = "lazynext-ai-slop-checker"`,
  `main = "api/worker.js"`, `compatibility_date = "2024-11-01"`) and `api/worker.js` (a CJS module
  exporting `fetch`) are part of the merged PR, and `docs/DEPLOYMENT.md` already documents the
  wrangler path. The edge entry mirrors the Node server's HTTP contract route-for-route, minus
  filesystem features which it deliberately answers with 400/501.
- **Zero runtime dependencies, deterministic engine — the cheapest possible deploy.** No build
  step, no install step, no native deps; `node --test` runs in 1.65 s and the engine scans at
  ~7–12 KB/ms. A Worker is the natural fit: the whole product is a few hundred KB of plain JS.
- **Free-tier friendly.** URL scans are outbound `fetch`es (wait time is not CPU time), the
  request count is trivial at launch, and the house Cloudflare account is already on a paid
  plan (~$5.53/mo total per the 2026-11-01 billing close) — this worker adds no new tier, no new
  subscription, no new card.
- **Sibling-proven pattern.** `products/accessibility-checker` runs the same worker at two hosts
  via `scripts/deploy.mjs` + `workers/domains` bindings; the marketing worker serves static
  assets through `env.ASSETS.fetch(request)` with `run_worker_first`. The slop checker can
  follow the same shapes.
- **Same-origin web checker = no CORS work.** `web/app.js` talks to the API with relative
  `fetch("scan")` / `fetch("health")` calls and loads the engine via parent-relative script
  tags (`../data/…`, `../src/…`). Hosting the API and the web surface on **one** hostname gives
  feature parity with zero CORS/OPTIONS code (the product has none today, which is correct for
  same-origin and would need adding only for cross-origin API consumers).

The recommendation is a **single Worker serving both the API and the web checker on one
dedicated hostname** (API routes first, static web surface as the same worker's asset/static
map — one host, one origin, one deploy artifact). This mirrors the sibling product's "same
worker, different root response" model without ever colliding with the a11y product's hosts.

---

## B. Target topology

### B.1 Hostname recommendation

Evaluate the existing hosts first (all verified in AGENTS.md Live surfaces, all live):

| Host | Currently bound to | Reuse for slop checker? |
|---|---|---|
| `checker.lazynext.com` | `accessibility-checker` (a11y product UI root; host-aware `/`) | ❌ Collides with the live a11y product's root behavior |
| `api.lazynext.com` | `accessibility-checker-api` (a11y API mirror) | ❌ Same worker, and `aug`-sharing a host would break the a11y API |
| `app.lazynext.com` | `accessibility-checker` (product app) | ❌ Same |
| `slop-checker.lazynext.com` | **Not bound — free** | ✅ **RECOMMENDED** (already named as the proposed canonical in `docs/DEPLOYMENT.md` §2) |
| `slop.lazynext.com` | Not bound — free | ✅ Acceptable short alternative if the founder prefers it (would mean editing the product docs' canonical references) |
| `status.lazynext.com` | `status-redirect` (301 → apex status) | ❌ Different purpose |

**Recommended: `slop-checker.lazynext.com`** — it is already written into the product's own
`docs/DEPLOYMENT.md` as the proposed canonical hostname, it is a dedicated Lazynext-branded
name, and it can never collide with the a11y product because it is a distinct hostname bound to
a distinct worker. `slop.lazynext.com` is a fine shorter alternative (both are unbound today);
choosing it just changes the docs references in one more execution step.

### B.2 Worker and bindings

- **Worker name:** `lazynext-ai-slop-checker` (the name already in `wrangler.toml` and
  `docs/DEPLOYMENT.md` — keep it; the directory is `ai-slop-checker/`, the script name differs
  by the `lazynext-` prefix, which is fine and matches both documents).
- **Entry (`main`):** `api/worker.js`.
- **No D1. No KV at launch.** The A2A surface uses a bounded in-memory recent store (30-min TTL,
  per `api/agent-surfaces.js` + ROADMAP "A2A is deliberately lightweight"). KV persistence is a
  roadmap follow-up, not a launch requirement: add one `kv_namespaces` binding (e.g.
  `SLOP_RECENT`) later if A2A task replay must survive worker restarts.
- **No service bindings, no secrets.** The worker has zero env/secret usage today — nothing to
  rotate, nothing to mint. Credentials referenced later in this document are **names only**,
  set via the founder/key-rotation process documented in AGENTS.md (never values in code or
  config).
- **Web surface:** served by the same worker (see §B.3). Static-only hosting of `web/` is
  rejected as primary — it strips the API surface (§A).
- **Api-only split evaluated and rejected:** splitting `api/worker.js` (host A) from a static
  `web/` (host B) forces CORS + OPTIONS handling the product does not have, degrades URL scans
  (the web app's same-origin `/scan` POST would become a cross-origin request or fall back to
  browser-direct fetches that most sites block), and splits the deploy into two artifacts for no
  benefit. One worker, one host stays the cleanest surface.

### B.3 Web surface on the worker (same-origin)

`web/index.html` loads the engine with parent-relative script tags that the browser normalizes
to site-root paths when the page is served at `/`:

- `/` → `web/index.html`
- `/app.js`, `/style.css`, `/sw.js`, `/register-sw.js`, `/manifest.webmanifest`, `/icons/*` → `web/`
- `/data/slop-patterns.js` → `data/slop-patterns.js`
- `/src/scanner.js`, `/src/rewriter.js`, `/src/project-scanner-browser.js` → `src/`
- `/assets/*` → `assets/` (logo/favicon)

The local server already implements exactly this map (`resolveStatic` in `api/server.js`). The
execution session should mirror it on the worker as a small static route map served when no API
route matches (GET/HEAD only). Two implementation styles are both house-proven:

1. **Embed a curated static map in the worker** (like the a11y product's `sync-page.mjs` +
   `binaryFiles` in `deploy.mjs`) — exact control, no exposure of `test/`/`docs/`/`bench/`, no
   new Cloudflare config surface. **Preferred.**
2. Declare the web + engine files as `[assets]`/`env.ASSETS.fetch(request)` with
   `run_worker_first = true` (the marketing worker pattern) — convenient, but the assets
   directory has to contain the whole product tree to satisfy the parent-relative paths, which
   also serves `test/`, `bench/`, `docs/`, `skill/`, `.cursor/` (harmless on a PUBLIC repo — the
   monorepo is public — but noisy and uncurated).

Style 1 is recommended: exact file list, no drift, one artifact, and it keeps the existing
repo layout untouched (no duplicated engine files inside `web/`).

> **Note for the web surface:** `web/app.js` already has a pure in-browser engine mode
> (`detectApiAvailability()` → same-origin `/health` probe; "engine: in-browser (pure checks)").
> Same-origin hosting keeps the richer API-assisted path; the in-browser fallback means a total
> API outage degrades the checker to text/HTML scans rather than breaking the page.

---

## C. Run book — execute ONLY after founder authorization (later session)

Preconditions: founder has answered §F (license/naming, hostname, deploy token, paid-tier, and
runbook-vs-automation). This session performed the planning only.

### C.0 Required pre-deploy code changes (execution session; not part of this planning PR)

1. **Make `/llms.txt` and `/openapi.json` edge-portable.** `api/worker.js` serves both via
   `require("node:fs").readFileSync(path.join(__dirname, …))`. `node:fs` does not exist at the
   Workers runtime (stateful fs is not available on the edge; even `nodejs_compat` does not give
   arbitrary `readFileSync` on Workers). Locally the test passes because Node has the filesystem;
   on the edge these two routes would error. Fix (small, additive): replace the two
   `readFileSync` calls with embedded constants — `llms.txt` is 1.9 KB and `api/openapi.json` is
   33.7 KB, both trivially embeddable as module constants or `[text_blobs]`; or serve them from
   a KV binding. Update `test/worker.test.js` discovery test accordingly (it currently passes in
   Node against the fs path).
2. **Add the static web route map** (§B.3, style 1) with unit-test coverage for at least `/`
   (html), `/app.js`, `/data/slop-patterns.js`, `/src/scanner.js`.
3. **No CORS work needed** for same-origin hosting. If the founder later wants cross-origin API
   consumers, add CORS + `OPTIONS` handling on the worker as a separate change (none exists
   today — correct for same-origin).
4. **Optional hardening (recommended, not blocking):** add the sibling-style SSRF guard on
   `/scan {url}` and `rules_url` — the worker already validates `http(s)`-only + 10 s timeout +
   2 MB cap + redirect-follow, but does not yet resolve and block private/loopback/link-local/
   metadata hosts the way `isSafeDocUrl()` does in the a11y product. And an optional per-IP daily
   cap (`rl:slop:<ip>:<day>`) to keep the free count honest once the hostname is public.
5. **Re-run the full gate:** `cd ai-slop-checker && npm run check` (corpus gate → `node --test`
   345/345 → e2e 26/26 on port 8793; 8792 is refused as the sibling's reserved port). All steps
   must pass before deploy.

### C.1 Deploy token check

```sh
cd ai-slop-checker
# House convention (names only — values come from the repo .env at execution time):
#   CLOUDFLARE_DEPLOY_TOKEN — the real Cloudflare REST token (Wrangler deploy auth)
#   CLOUDFLARE_ACCOUNT_ID   — the account id, referenced by name; fill the wrangler.toml
#                              account_id placeholder from it (do NOT commit the value)
[ -n "$CLOUDFLARE_DEPLOY_TOKEN" ] && echo "deploy token present"
[ -n "$CLOUDFLARE_ACCOUNT_ID" ] && echo "account id present"
```

If either is unset, stop — do not proceed (per the credentials rules in AGENTS.md; the founder
sets these via the existing key-rotation process; never read or print `.env` values here).

### C.2 Deploy the worker

```sh
cd ai-slop-checker
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_DEPLOY_TOKEN"   # wrangler only, house convention
npx wrangler deploy
# → publishes `lazynext-ai-slop-checker` to workers.dev first (workers_dev = true)
```

Notes:
- Plain `wrangler deploy` is correct **because the worker needs no bindings** (no `PLATFORM`
  service binding like the a11y sibling, no secrets). The sibling's `deploy.mjs` exists
  precisely because omitting `bindings` metadata silently drops them; the slop checker has none,
  so `wrangler deploy` is the clean path. If C.0.2 used embed-style statics, the deploy script
  can stay `wrangler deploy` (the static map lives inside `api/worker.js`).
- If a KV binding for A2A persistence is ever added, declare it in `wrangler.toml` under
  `kv_namespaces` before deploying — never via `wrangler secret put` for the KV id itself.

### C.3 Custom-domain binding (`slop-checker.lazynext.com`)

**> House trap (must know before touching this): deleting or replacing a worker script drops
> its `workers/domains` binding but leaves the proxied DNS record — every request then
> fast-fails 522 in ~40 ms (found live on `api.lazynext.com`; fixed by re-binding). Rollback via
> `wrangler rollback` does NOT drop the binding; deleting/recreating the script does. Re-bind via
> the same PUT below after any recreate.**

Preferred: declare the custom domain in `wrangler.toml` (`custom_domains = ["slop-checker.lazynext.com"]`)
and let `wrangler deploy` create the binding. Fallback (if the deploy token lacks Custom Domains
edit scope — house note says the deploy token can 401 this API):

```sh
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_DEPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "hostname": "slop-checker.lazynext.com",
        "service": "lazynext-ai-slop-checker",
        "environment": "production",
        "zone_id": "ff0ad1848e936913a9c4b4e85b1f04af"
      }'
```

(`zone_id` = lazynext.com zone per AGENTS.md — re-verify at execution time. If the PUT 401s,
fall back to the founder dashboard: Workers → `lazynext-ai-slop-checker` → Settings → Domains →
Add — per the house note that the deploy token can 401 the domains API.)

### C.4 DNS verification

- `curl -sI https://slop-checker.lazynext.com/` → **200** (not 522, not 404).
- `dig +short slop-checker.lazynext.com` → proxied Cloudflare addresses (does not expose origin).
- Re-check all THREE of the a11y hosts if anything was touched nearby — but this plan binds a
  **new** hostname to a **new** worker, so `checker.`/`api.`/`app.` must remain untouched; a
  522 on any of them means something else regressed (see the marketing-worker warning in AGENTS.md).

### C.5 Live verification checklist (post-deploy, `curl` from this machine)

```sh
curl -s https://slop-checker.lazynext.com/health          # {"ok":true,"engine":"lazynext-ai-slop-checker","version":"1.4.1"}
curl -s https://slop-checker.lazynext.com/rules           # manifest; count: 279 patterns / 27 categories
curl -s -X POST https://slop-checker.lazynext.com/scan \
     -H 'Content-Type: application/json' \
     -d '{"text":"We must leverage this."}'               # 200; matches contains "w-leverage"
curl -s https://slop-checker.lazynext.com/openapi.json    # openapi: 3.1.0
curl -s -X POST https://slop-checker.lazynext.com/mcp \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'   # 200; result.serverInfo.name == "lazynext-ai-slop-checker" (the tested initialize shape; params are ignored)
curl -s https://slop-checker.lazynext.com/.well-known/agent.json   # 200 agent card
curl -s https://slop-checker.lazynext.com/               # 200 HTML page (web checker)
curl -sI https://slop-checker.lazynext.com/data/slop-patterns.js   # 200 application/javascript (static map)
```

Also: `curl -I` (HEAD) on `/health`, `/rules`, `/openapi.json` — read-only surfaces should
answer HEAD per house HEAD-parity convention (product worker pattern). A browser smoke on the
web checker (text scan + a URL scan) and an A2A `tasks/send` + `tasks/get` round trip.

**CORS/OPTIONS note:** same-origin hosting means the page needs no CORS. Documented here so the
operator knows there is intentionally no `Access-Control-Allow-*` today: if a cross-origin
consumer needs the API later, add CORS + `OPTIONS` handling to the worker then.

**URL-scan note:** `/scan {url}` runs a server-side `fetch` on the worker — fine on Workers
(outbound fetch, wait time is not CPU time), but keep the existing http(s)-only check, the 10 s
timeout, the 2 MB cap, and the redirect-follow behavior; review the C.0.4 SSRF guard before
letting arbitrary hosts be scanned.

### C.6 Rollback

- `npx wrangler rollback --name lazynext-ai-slop-checker` reverts to the previous deployed
  version (keeps the domain binding — no 522).
- If the script was deleted/recreated instead, re-run C.3's PUT immediately (522 trap) before
  anything else.
- Domain-level un-publish would be a founder decision; never delete the proxy record without
  removing the binding first.

---

## D. Docker secondary path (only if the Worker is rejected)

The product's `Dockerfile` is ready (node:20-alpine, non-root `slop` user, `EXPOSE 3000`,
`HEALTHCHECK` polling `/health` every 30 s, `CMD node api/server.js`) and the release doc
bumped tags to `1.4.1`. If the founder chooses containers instead of a Worker:

```sh
cd ai-slop-checker
docker build -t lazynext/ai-slop-checker:1.4.1 .
docker run --restart unless-stopped -p 8793:3000 -e PORT=3000 lazynext/ai-slop-checker:1.4.1
# host port 8793 → container port 3000 (the image listens on 3000; 8793 keeps the
# house/local e2e port convention outward-facing; verify with:
curl -s http://127.0.0.1:8793/health
```

- Host it on the existing CF Containers/self-hosted pattern (`ops/` style: DO class, restart
  policy, `/health` healthcheck — the image already carries it; add boot beacons only if
  observability is needed).
- Pros: full local surface, incl. `POST /scan-project` and URL `render-scan` with the optional
  playwright collector.
- Cons: image build + registry push + container lifecycle + supervision; zero-secret posture
  still easy (`.dockerignore` excludes `.env*`, `wrangler.toml`, tests) but the blast radius is
  bigger; a persistent node process is more moving parts than the deterministic engine needs.
- **Not recommended as primary.** The worker covers every public-facing route the product has;
  the only things Docker adds are local-filesystem features that make no sense on a public host.

---

## E. Security, cost, monitoring, rollback

**Security**
- Zero secrets: the worker has no env/secret reads at all; the Dockerfile + `.dockerignore`
  exclude `.env*`; nothing in this plan stores, prints, or references a credential value
  (names only, set via the founder/key-rotation process per AGENTS.md).
- No personal data ingestion: scan input is ephemeral — reports are returned and not persisted
  (the only store is the bounded in-memory A2A recent list, 30-min TTL). No logs retained by
  design; no analytics, no fingerprinting, no tracking.
- URL scans: outbound-only `fetch` with http(s)-only validation, 10 s timeout, 2 MB cap,
  redirect-follow; recommended SSRF guard (C.0.4) before public exposure.
- Rate caps: none shipped today; optional `rl:slop:<ip>:<day>` (C.0.4) keeps public abuse
  bounded.

**Cost**
- Worker free tier is adequate at launch (100k requests/day; URL scans' fetch wait time is not
  CPU time; heavy ~200 KB HTML scans are ~28 ms CPU which is comfortable on the house's existing
  plan). The account already runs a paid Cloudflare plan (~$5.53/mo total closing on
  2026-11-01); this worker adds **no new paid tier, no new subscription, no new card**. No D1,
  no R2.
- Docker path would add build/registry/container costs — another reason it's secondary.

**Monitoring**
- The worker answers `GET /health` (200, `ok:true`) — the house pattern for liveness.
- Enabling the worker to show up in the existing 15-min health check
  (`scripts/health_check.py`) and on the status page is a repo-root ops change → deferred, and
  needs a separate founder/ops nod (§G).
- `npm run check` is the pre-deploy gate (corpus → tests → e2e); it must be green before every
  deploy (C.0.5).

**Rollback**
- `wrangler rollback` (C.6); the 522 trap applies only if the script is deleted/recreated
  (re-bind via C.3 PUT).

---

## F. Founder authorization checklist (explicit yes/no gates)

Before the run book in §C can execute, the founder decides:

1. **License / naming** — the MIT license header and the Lazynext naming policy for this
   open product are **still unconfirmed** (carried from the release validation, `docs/RELEASE-2026-11-17.md` §7.2 and `ATTRIBUTIONS.md`). The repo product is `private: true` and not
   published, but the LICENSE/header policy governs what an open Lazynext product may say.
   Standing house rule: no personal ID; company documents only where supported.
2. **Hostname** — approve `slop-checker.lazynext.com` (recommended) or the shorter
   `slop.lazynext.com` (acceptable; adds a docs-reference edit step).
3. **Deploy token usage** — approve using `CLOUDFLARE_DEPLOY_TOKEN` (wrangler) + the
   workers/domains binding for this hostname; if the token 401s the domains API, approve the
   founder-dashboard binding fallback.
4. **No paid tier needed** — confirm this deploys inside the existing plan (no new paid
   Cloudflare tier, no new card, no paid post-office/Docker infra).
5. **Once-runbook vs automation** — approve a one-time manual run book execution (recommended
   for v1) vs. a repeatable script; **no CI workflow is created** — `.github/` is devops-role
   gated per house rules, and the ROADMAP's `slop-check` action needs a separate founder decision
   on enforcement policy (hard fail vs comment-only) before devops can build it.

(Out of scope of this deploy, kept separate: npm publishing — needs the license confirmation +
an npm account; plugin/distro packaging; social posting — house rule "do not post".)

---

## G. Deferred items and reasons

- **No telemetry/analytics** — by design: the product keeps no logs, no tracking; monitoring =
  `/health` + optional `[observability]`.
- **No CI gate created** — `.github/` is devops-gated per house rules; the `slop-check`
  action needs a founder enforcement-policy decision first (deliberately not created here).
- **A2A KV persistence** — roadmap item; the in-memory 30-min store is the documented
  lightweight analogue; KV binding is a launch-optional follow-up.
- **SSRF guard + rate caps** — recommended hardening (C.0.4), not blockers for launch.
- **Health-check script + status page inclusion** — repo-root ops change (`scripts/health_check.py`),
  deferred to a separate ops decision.
- **npm publish / plugin packaging** — founder-gated (license + account), unrelated to hosting.
- **Web-surface asset strategy if style 2 (`[assets]`) is chosen** — needs `_headers`/`_redirects`
  care and a curated exclude story; style 1 (embedded static map) avoids it.