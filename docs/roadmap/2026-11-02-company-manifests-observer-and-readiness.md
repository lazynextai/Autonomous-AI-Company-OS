# Design Proposal — Company Template Manifests, Independent Observer Pass, Capability/Readiness Matrix (P2)

**Date:** 2026-11-02
**Status:** Proposal (P2, not scheduled)
**Source:** [Star-list review — roadmap opportunities 5, 6, 7](../research/github-star-list-autonomous-ai-company-os-2026-11-02.md)
**Pattern references:** `Claw-Company/clawcompany` (role/template packaging), `auto-co-meta` (thin harness, template bootstrap), `Hyper-AI-Lab/cyber-ai-team` (governor/observer separation, readiness evidence), `Mistico06/ai-company-os-github` ("observed behaviour beats declared capability").

## Problem

Three related gaps:

1. **Every company instance is configured by hand.** Goals, connector permissions, review thresholds, and schedules live in `company_brain` columns and KV config keys with no declarative, validated manifest — so a fresh environment (or a disaster-recovery restore) cannot be re-seeded predictably, and there is no diffable record of *intent*.
2. **No independent checkpoint before external side effects.** Generation and execution both live in the fleet's task loop; nothing reviews *plans* for prompt injection, policy violations, or goal drift before a plan becomes an action. The existing kill-lists and protected-file gates are deterministic backstops, not an observer that returns "evidence gap: X" or "safe to proceed".
3. **Capability claims are untested.** `GET /api/v1/connectors` reports credential *presence*; nothing reports what has passed a live probe, what is stale, and what is merely documented. A "readiness" claim on the dashboard is not the same as a probe result.

## Existing surface reused

| Concern | Reused surface |
|---|---|
| Manifest storage + validation | D1 (new `company_manifests` table, single active row + versions) — same pattern as `outbound_breaker_config` single-row config |
| Connector permission model | existing `conn:*` KV creds + `CONNECTOR_IDS` + the admin/write/read scope gates in `handleServices` |
| Scheduled manifest checks | existing `*/10` cron tick (`scheduled()`), waiting on `cron:last_tick` like every sweep |
| Observer evidence gap source | existing `crm_lead_evidence` disposition counts (`summary.unknown`), `decision_packages.outcome` (from the P1 proposal), `email_events` degraded rates (from the P1 breakers implementation) |
| Capability probes | existing `GET /api/v1/connectors` status map, `scripts/health_check.py` pattern, `scan_stats` corpus for the product worker |
| Review output | `episodic_events` scope `observer` + an `lvk_`-style read route in the house style |

## Minimal schema / route changes

```sql
CREATE TABLE IF NOT EXISTS company_manifests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'company',
  version INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,                  -- validated JSON manifest
  valid INTEGER NOT NULL DEFAULT 0,    -- 0 until schema validation passes
  activated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (name, version)
);
CREATE INDEX IF NOT EXISTS idx_company_manifests_active ON company_manifests(activated, id);

CREATE TABLE IF NOT EXISTS capability_readiness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capability TEXT NOT NULL UNIQUE,     -- connector id or service name
  last_probe_at TEXT,
  last_probe_ok INTEGER,               -- 1 = live probe passed
  last_error TEXT,
  documented INTEGER NOT NULL DEFAULT 0, -- claimed in docs but never probed
  keystore TEXT,                       -- kv | secret | none
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
```

**Routes** (all `x-internal`; update `worker/src/openapi.ts`):

- `POST /manifests/validate` — validate a JSON manifest against a fixed JSON-Schema-ish check (goals strings, connector ids ⊆ `CONNECTOR_IDS`, thresholds 0..1, schedules in the allowed cron shape). No activation on validate.
- `POST /manifests/activate` — activate `version N` only after validation; writes the full body to `company_brain` intent columns (goals / thresholds) without touching the live spaces they govern.
- `GET /manifests` / `GET /manifests/latest` — list / current active.
- `POST /observer/review` — run the bounded observer pass on a proposed plan; returns `{recommendation: safe|evidence_gap|policy_concern, gaps:[...]}` and **never executes**.
- `GET /capability/matrix` — join the readiness table with `GET /api/v1/connectors` status to render configured / probed-ok / stale / documented-only.

The `*/10` sweep refreshes `capability_readiness` for connected connectors with a zero-side-effect probe (head request against the provider base URL, or `GET /2/users/by/username/Lazynextai`-style read probes where no post is required).

## Test strategy

- **pytest:** manifest validator table-driven cases (valid goals, unknown connector id → reject, out-of-range threshold → reject, bad cron shape → reject); migration 012 idempotence + DDL drift guard against the worker self-heal code; readiness matrix joins against a fake connector-status map.
- **node --test:** lift the validator and the `observer/review` classifier (shipped-source lift, same as `crm-evidence.test.mjs`); an observer pass over a plan with zero evidence gaps returns `safe`, over a plan citing only `unknown`-disposition claims returns `evidence_gap`; the probe sweep records `last_probe_ok=0` on a provider 503 without touching credentials.
- **No live probes in CI.** Tests stub the provider fetch; the sweep's probe loop only ever runs in the real worker with `ctx.waitUntil`.

## Non-goals (explicit)

- No new governance framework or control plane (no Temporal/LangGraph/Postgres-Docker per the research report's constraints).
- No blockchain-verified audit trail; no LinkedIn automation; no desktop runtime; no ERPNext.
- The observer **reviews, never executes** — no veto-execute loop, no new scheduler. It is a bounded pass that returns a recommendation; the existing deterministic gates (protected files, kill-lists, phantom-completion, breakers) remain the enforcement layer.
- Manifests never reconfigure the deployed worker's bindings or the container stack — they re-seed `company_brain` intent fields only.
- Capability probes never post, never send mail, and never mint credentials.

## Rollback

All tables are additive; the sweep and routes are best-effort. Rollback = drop the three tables, remove the routes + sweep block. Activation writes only `company_brain` intent columns that nothing else reads today, so reverting activation restores the prior values from `company_manifests` (the activated row keeps the previous body as the row superseded). No existing surface is modified on the way in or out.