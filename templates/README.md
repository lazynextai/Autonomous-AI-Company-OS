# Company template packs

Starter manifests for the Lazynext company OS — declarative goals, roles,
connector permissions, review thresholds and schedules. Each pack is **data**:
it configures the platform through the existing manifest routes and never
multiplies runtime agents.

| Pack | Shape | Review thresholds |
|---|---|---|
| `lean-startup.json` | The shipped Lazynext configuration distilled — 13 real agents across marketing, sales, engineering and ops | `cost_cents 2500` · `min_evidence 2` · `risk medium` |
| `agency-accessibility.json` | Accessibility consulting agency — client audit/remediation delivery | `cost_cents 1000` · `min_evidence 3` · `risk high` (stricter: client-facing work) |

## Invariants

- Every pack passes the shipped validator in `worker/src/manifests.ts`
  (`validateManifest`) — pinned by `worker/test/templates.test.mjs` against the
  real JSON files, the real connector catalogue (`CONNECTOR_IDS` in
  `worker/src/services.ts`) and the real fleet roster (`scripts/run_agents.py`).
- No pack grants `admin` connector permission by default.
- Every `roles[].id` maps to an agent the fleet actually runs (`ceo`, `cto`,
  `marketing`, `sales`, `customer_success`, `backend`, `frontend`, `qa`,
  `devops`, `code_review`, `knowledge`, `hr`, `finance`) — no invented personas.
- Editing a pack requires bumping its `version`: `POST /manifests/validate`
  upserts by `(name, version)` with `INSERT OR IGNORE`, so the same version
  keeps the previously stored body.

## Listing the packs

The packs are bundled into the worker at deploy time (static JSON imports in
`worker/src/templates.ts`; Workers have no runtime filesystem), so the
catalogue needs no KV sync:

```bash
# name + description + version (internal bearer — same gate as /manifests)
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://ai-company.lazynext.com/templates

# with the full manifest body, ready to pipe into validate
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  'https://ai-company.lazynext.com/templates?include_body=1'
```

## Activating a pack (one-liner path, no auto-activation)

A pack is validated and activated through the **existing** routes. Nothing in
the platform activates a pack by itself.

```bash
BASE=https://ai-company.lazynext.com
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# 1. copy pack -> manifest body -> validate (stores a validated version)
curl -s -H "$AUTH" -H "content-type: application/json" \
  -d "$(curl -s -H "$AUTH" "$BASE/templates?include_body=1" \
        | jq -c '.packs[] | select(.name=="agency-accessibility") | .body')" \
  "$BASE/manifests/validate"

# 2. activate the stored version returned above (name + version)
curl -s -H "$AUTH" -H "content-type: application/json" \
  -d '{"name":"agency-accessibility","version":1}' \
  "$BASE/manifests/activate"
```

Activation writes the D1 row (`company_manifests`) plus the KV intent pointer
`config:manifest:active` — it never mutates `company_brain`. Rollback is
activating the previous version (or the other pack).
