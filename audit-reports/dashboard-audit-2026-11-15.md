# Lazynext Dashboard Audit — 2026-11-15

**Scope:** `dashboard/` (Next.js App Router + OpenNext on Workers: `ai-company-dashboard`).  
**Mode:** Audit only — report file is the only write; no product code edits; no git mutations; no secrets printed.  
**Live surface:** `https://dashboard.lazynext.com`  
**Deployed worker version (CF deployments API, 2026-11-15):** current version id `f10f3aca-5d7c-4c98-95bf-827f3dc7c3ec` (deployment created `2026-11-11T00:12:33Z`). Historical AGENTS note `206c01da` is **stale**.  
**Lint:** `cd dashboard && npx eslint .` → **0 problems** (exit 0).  
**Screenshots on hand:** `dashboard-audit-screens/login-page.png` only (prior capture).

---

## 0. Inventory

### 0.1 Page routes (`dashboard/app/**/page.tsx`) — **42**

| Group | Count | Routes |
|---|---:|---|
| Public (ungated by design) | 5 | `/login`, `/signup`, `/verify`, `/forgot`, `/reset` |
| App (`(app)/`) | 37 | `/`, `/429`, `/agents`, `/agents/[id]`, `/analytics`, `/api-keys`, `/approvals`, `/audit`, `/billing`, `/bookings`, `/brain`, `/briefings`, `/campaigns`, `/code`, `/code/[name]`, `/conversations`, `/crm`, `/deployments`, `/design`, `/feed`, `/governance`, `/knowledge`, `/logs`, `/media`, `/notifications`, `/playground`, `/products`, `/sandbox`, `/search`, `/settings`, `/signatures`, `/store`, `/tasks`, `/tasks/[id]`, `/team`, `/tickets`, `/webhooks` |

Sidebar NAV covers most app pages; **`/webhooks` exists as a page but is absent from `Sidebar.tsx` NAV** (reachable by URL / command palette if linked elsewhere).

### 0.2 API routes (`dashboard/app/api/**/route.ts`) — **20**

`2fa`, `auth`, `billing`, `connect/[id]`, `copilot`, `email`, `funnel`, `keys`, `kv`, `login`, `logout`, `media`, `publish`, `query`, `sandbox/exec`, `svc`, `tick`, `webhooks`, `webhooks/deliveries`, `websearch`.

### 0.3 Proxy / session model (`dashboard/proxy.ts`)

- Public pass-through: `/login`, `/forgot`, `/signup`, `/verify`, `/reset`, `/api/login`, `/api/auth`, `/_next*`, `/favicon*`, **and any pathname containing `.`**.
- Pages: owner cookie `lazynext_session === DASHBOARD_SESSION_TOKEN` **or** member HMAC cookie `lz_user_session`.
- `/api/*` (except `/api/logout` for members): **owner session only** → 401 JSON otherwise.
- Unauthenticated app pages: **307 → `/login`** (verified).

### 0.4 `/api/svc` whitelist (verified against live governance reads)

**GET `READ_PATHS`:** `/api/v1/ops/breakers`, `/api/v1/crm/evidence/summary`, `/api/v1/crm/leads/:id/evidence`, `/capability/matrix`, `/decision/packages`, `/observer/reviews`, `/decision/blocks?limit=N`.  
**POST `ALLOWED`:** CRM / tickets / booking / store / marketing contacts+campaigns(+`/:id/send`) / signwell / connectors / native sign requests.  
Token split in `workerFetch`: `/api/v1/*` → `LAZYNEXT_API_KEY` (lzk_); prefixless governance → internal `CLOUDFLARE_API_TOKEN`.

Worker targets for those reads exist under `worker/src` (`decisions`, `observer`, `readiness`/`capability`, `breakers`, CRM evidence, etc.) — consistent with prior mapping.

---

## 1. Live spot-check evidence

### 1.1 Unauthenticated HTTP (no redirect follow)

| Path | Result |
|---|---|
| `/` | **307** → `/login` |
| `/governance`, `/approvals`, `/billing`, and other app pages sampled | **307** → `/login` |
| `/login`, `/signup`, `/verify`, `/forgot`, `/reset` | **200** |
| `/api/svc`, `/api/query`, `/api/funnel`, `/api/billing` | **401** `{"error":"unauthorized"}` |
| `/api/login` GET | **405** (POST-only — expected) |
| `/api/query` POST (no cookie) | **401** |
| `/api/kv` POST (no cookie) | **401** |
| `/api/sandbox/exec` POST (no cookie) | **401** |

### 1.2 Authenticated HTTP (owner passphrase + TOTP from KV `flag:two_factor` + `2fa:secret`)

Login: `POST /api/login` → `{ok:true}` + `Set-Cookie: lazynext_session` (httpOnly).

| Path | Result |
|---|---|
| `/`, `/governance`, `/approvals`, `/billing`, `/crm`, `/media`, `/settings`, `/campaigns`, `/signatures`, `/api-keys`, `/agents`, `/tasks`, `/webhooks`, `/analytics`, `/sandbox` | **200** HTML shell `title=Lazynext`, not loginish |
| `/bogus-audit-path-xyz` | **404** (auth gate ≠ route existence — good) |
| `GET /api/svc?path=/decision/packages` | **200** `{packages}` |
| `GET /api/svc?path=/decision/blocks?limit=20` | **200** `{blocks}` |
| `GET /api/svc?path=/capability/matrix` | **200** `{generated_at,summary,connectors,services}` |
| `GET /api/svc?path=/observer/reviews` | **200** `{reviews}` |
| `GET /api/svc?path=/api/v1/ops/breakers` | **200** `{policy,stats,trips}` |
| `GET /api/svc?path=/api/v1/crm/evidence/summary` | **200** `{summary,corroboration}` |
| `GET /api/funnel` | **200** funnel keys present |
| `GET /api/billing` | **200** `{ok,subscriptions}` |
| `GET /api/keys` | **200** `{keys}` (key material shape not dumped) |
| `GET /api/media` | **200** `{media}` |
| `GET /api/webhooks` | **200** `{webhooks}` |

### 1.3 Auth-bypass probe (dotted paths)

| Path (no cookie) | Result |
|---|---|
| `/agents/test` | **307** → `/login` (correct) |
| `/agents/test.js` | **200** full app shell (Sidebar “Overview”, “Sandbox”, …) |
| `/tasks/foo.bar` | **200** app shell |
| `/code/readme.md` | **200** app shell |
| `/governance.json` | **404** (no matching route) |

Cause: `dashboard/proxy.ts` early-return `pathname.includes(".")` intended for static assets also skips the session gate for **any** dynamic segment containing a dot.

Mitigation observed today: detail pages are `"use client"` and load data via `/api/query` (still **401** without owner cookie), so **D1 data did not leak** in this probe. The **session gate for the protected UI still fails**.

### 1.4 Platform health

Authenticated `GET ${CLOUDFLARE_API_URL}/health` returned only `{"ok": true}` (no nested `dashboard:true` field in this response shape). Separate CF deployments API confirmed the dashboard worker is live. HTTP checks above are the authoritative dashboard liveness signal for this audit.

### 1.5 Security response headers (`GET /login`)

Absent: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.  
(Contrast: marketing apex serves HSTS/CSP via `marketing/public/_headers` — dashboard has no equivalent.)

---

## 2. Findings by severity

### CRITICAL

_None confirmed for live data exfiltration._  
(The dotted-path gate failure is classified **HIGH** because `/api/*` remains owner-gated and client pages do not SSR D1 rows today.)

### HIGH

**H-1. Session gate bypass for any URL whose pathname contains `.`**
- File: `dashboard/proxy.ts` (early allow when `pathname.includes(".")`).
- Evidence: unauthenticated `GET /agents/test.js`, `/tasks/foo.bar`, `/code/readme.md` → **200** with authenticated chrome; undotted `/agents/test` → **307** `/login`.
- Impact: anyone can load the private app shell (nav, layout, client bundles for those routes). Data APIs still 401, but this defeats the documented “everything except login requires session” invariant and will become a data leak the moment any bypassed route SSRs or embeds secrets.
- Fix direction: replace `includes(".")` with an explicit static allowlist (e.g. `/favicon.ico`, known asset extensions under `/_next` already excluded) **or** only skip when the path is clearly a static file (`/\.[a-z0-9]+$/` **and** not under `/agents|/tasks|/code|/…`). Re-test: dotted dynamic ids must 307; `/_next/static/...` must stay public.
- Verify: `curl -I` undotted vs dotted; auth-GET still 200; eslint + deploy `ai-company-dashboard`.

**H-2. Member login reuses the founder TOTP secret (`2fa:secret`)**
- File: `dashboard/app/api/auth/route.ts` (login branch reads `flag:two_factor` + `2fa:secret`, OTPAuth label `"founder"`).
- Evidence: same KV keys as owner `/api/login`; no per-user TOTP storage.
- Impact: every member account is forced onto the founder authenticator (or 2FA is effectively a shared company factor). Compromised member credentials + stolen founder TOTP = member session; operational coupling is wrong for multi-user.
- Fix direction: per-user TOTP (`users.totp_secret` / KV `2fa:user:<id>`), enroll via `/api/2fa` scoped to member; keep founder secret only for owner passphrase login. Until then, document “single-operator 2FA” explicitly in Settings.

### MEDIUM

**M-1. Dashboard serves no browser security headers**
- Evidence: live `/login` lacks CSP, HSTS, XFO, nosniff, referrer/permissions policies (see §1.5). No matches in `dashboard/` for those header names.
- Impact: clickjacking / MIME sniffing / missing HSTS on the control plane; weaker posture than `lazynext.com` marketing.
- Fix direction: add Workers `_headers` / OpenNext `headers` for `dashboard.lazynext.com` (start with HSTS + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff`; CSP can allow Next inline as marketing does). Redeploy dashboard; verify with `curl -I`.

**M-2. Owner `/api/query` is an unrestricted SQL proxy**
- File: `dashboard/app/api/query/route.ts` → `queryWorker(sql, params)` with no statement allowlist.
- Evidence: by design for the founder console; unauth → 401; auth owner can run arbitrary D1 SQL the internal token permits (reads used widely via `queryApi` in pages).
- Impact: stolen `lazynext_session` cookie = full D1 read/write through the browser origin (XSS or physical access amplification).
- Fix direction: defense-in-depth — allowlist `SELECT` for most UI calls; require explicit mutating routes for writes; or split read-only query endpoint. Not blocking for single-founder use, but should be on the fix backlog.

**M-3. Owner `/api/kv` + `/api/sandbox/exec` + `/api/email` are high-power mutators**
- Files: `dashboard/app/api/kv/route.ts` (get/put ttl 31536000 / delete any key), `sandbox/exec/route.ts` (`POST /exec`), `email/route.ts` (`/email/send`).
- Evidence: all behind owner session only (401 unauth — verified for query/kv/sandbox).
- Impact: same blast radius as H-session theft — KV wipe/poison, container exec, arbitrary Brevo send.
- Fix direction: key-prefix allowlists for KV UI; confirm sandbox UI cannot be reached by members (already true); optional step-up / decision package for email+exec.

**M-4. Member sessions can open app pages but all data APIs are owner-only**
- Evidence: `proxy.ts` allows member on pages; `/api/*` requires owner (except logout).
- Impact: members see empty/erroring shells — confusing authz model; invites false confidence that “team” access works.
- Fix direction: either gate member page routes to a small allowlist, or mint a read-scoped path for members; document current “owner-only data plane” in UI.

**M-5. Docs / ops drift on dashboard version + health shape**
- Evidence: AGENTS.md cites deployed `206c01da`; CF API current version `f10f3aca…` (2026-11-11). Platform `/health` returned only `{ok:true}` here (no `dashboard:true` field).
- Impact: operators may trust stale version notes or wrong health key.
- Fix direction: refresh AGENTS deployed-version note after each dashboard deploy; align `scripts/health_check.py` expectations with the live `/health` schema (HTTP probe of `dashboard.lazynext.com` already exists).

### LOW

**L-1. `/webhooks` page not in Sidebar NAV**
- File: `dashboard/components/Sidebar.tsx` vs `dashboard/app/(app)/webhooks/page.tsx`.
- Impact: discoverability only; page works when URL known (auth-GET 200).
- Fix: add NAV entry (or remove page if retired).

**L-2. C4/C5 worker surfaces not mirrored in dashboard UI**
- Worker has `/templates`, `/report/mission/:taskId`, `/ledger/summary`, `/manifests` (internal). Dashboard governance panels cover breakers / readiness / decisions / gate blocks / evidence / approvals inbox — **not** template packs or mission reports.
- Impact: operators must use bearer curls for C2/C5; not a defect in existing panels.
- Fix: optional read-only panels via `/api/svc` GET whitelist extensions (exact paths only).

**L-3. Screenshot corpus incomplete**
- Only `dashboard-audit-screens/login-page.png`. Auth pages were verified by HTTP, not visual capture in this pass.
- Fix: optional capture of `/governance` + `/approvals` after login for the next visual pass.

**L-4. Campaign send UX does not surface decision-gate 503 distinctly**
- File: `campaigns/page.tsx` `send()` toasts `d.error` on failure — works if worker returns `{error,reason}`, but no dedicated “needs decision package” copy.
- Impact: operators may misread gate blocks as Brevo failures (backend gate is correct; UX clarity only).
- Fix: if `status===503` and `error` mentions decision gate, link to `/approvals` / `/governance`.

---

## 3. Pages / surfaces OK (this pass)

| Surface | Verdict |
|---|---|
| Public auth pages 200 | OK |
| Unauth app pages 307 → `/login` (undotted) | OK |
| Unauth `/api/*` 401 | OK |
| Owner login + TOTP | OK |
| Auth shell pages sampled (15) 200 | OK |
| Bogus path 404 under auth | OK |
| Governance `/api/svc` reads (6) 200 | OK |
| Funnel / billing / keys / media / webhooks APIs 200 | OK |
| `/api/svc` whitelist design (exact GET + constrained POST) | OK (do not widen to mutating wildcards) |
| ESLint | OK (0 problems) |
| Live deploy present (`f10f3aca…`) | OK |

---

## 4. Tooling used

- Filesystem globs: `dashboard/app/**/page.tsx`, `dashboard/app/api/**/route.ts`
- Static review: `proxy.ts`, `app/api/svc/route.ts`, `lib/worker.ts`, `app/api/{login,auth,query,kv,sandbox/exec}/*`, governance components, Sidebar
- Live HTTP: Python `urllib` (curl PATH issues in subshell) against `dashboard.lazynext.com` + platform `/health` + CF Workers deployments API
- Auth: `.env` `DASHBOARD_PASSPHRASE` + KV `2fa:secret` TOTP (HMAC-SHA1; secret not printed)
- Lint: `npx eslint .` in `dashboard/`
- Prior context: route/proxy mapping, `dashboard-audit-screens/login-page.png`, backend audit report format

---

## 5. Unverified / out of scope this pass

- Full visual UI review of all 37 app pages (no new screenshots beyond existing login).
- Member end-to-end signup/login (would send real mail / need a test user) — member **code path** reviewed; not live-exercised.
- OAuth connect start/callback browser flows (`/api/connect/[id]`).
- Mutating owner actions (campaign send, connector dispatch, sandbox exec, KV put) — intentionally not fired.
- OpenNext build reproducibility / `next build` (lint only).
- Whether dotted-path 200 responses include RSC flight payloads with embedded data beyond the shell (HTML inspection showed nav chrome; deep RSC decode not done).
- Exact byte parity between local `dashboard/` git HEAD and deployed `f10f3aca` bundle.

---

## 6. Suggested fix order

1. **H-1** — close `pathname.includes(".")` gate bypass; redeploy dashboard; re-probe dotted URLs.  
2. **M-1** — add security headers on dashboard responses.  
3. **H-2** — per-user TOTP (or document single-operator 2FA and disable member signup).  
4. **M-2/M-3** — harden query/kv/exec blast radius.  
5. **M-4/L-*** — member UX + NAV + docs version note.

---

*End of dashboard audit 2026-11-15.*
