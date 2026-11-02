# Design Proposal — Governance Decision Package + Outcome & Cost Ledger (P1)

**Date:** 2026-11-02
**Status:** IMPLEMENTED 2026-11-03 (PR #13) — `decision_packages` + `outcome_ledger` (migration 011), routes in `worker/src/decisions.ts` / `ledger.ts`, dispatch paths open/close a decision package fail-closed (opt-in gate via `config:decision_enforce`, default off), daily sweep builds idempotent rows. Verified: pytest + `node --test` green before merge.
**Source:** [Star-list review — roadmap opportunities 2 & 4](../research/github-star-list-autonomous-ai-company-os-2026-11-02.md)
**Pattern references:** `Node-Features/company-os` (authority classes, evaluation/finance feedback), `Hyper-AI-Lab/cyber-ai-team` (owner approvals, canonical records), `piyush06singhal/nexus-ai` (approval gates, audit), `Claw-Company/clawcompany` (per-mission cost).

## Problem

Two governance gaps exist today:

1. **Decisions are not packaged.** High-impact actions (a connector dispatch, a campaign send, a task that mutates the product repo, a breaker threshold change, enabling SignWell auto-sign) all *act* with an audit row, but the *why* — objective, proposed action, authority class, evidence, target, expiry, rollback path — is scattered across `task_log`, `episodic_events`, `bus_messages`, and operator notes. Nothing renders them as one inspectable, decision-package record.
2. **Cost and outcome are not closed.** `task_log` records completion; `episodic_events` scope `connector` records sends; `email_events` records Brevo callbacks; `scan_stats` records scans. But no single view joins task → provider/model → duration → retries → estimated spend → acceptance result → downstream metric. The founder briefings cannot answer "what did this actually cost and did it move a number?"

## Existing surface reused

| Concern | Reused surface |
|---|---|
| Decision record storage | D1 (new `decision_packages` table) + `episodic_events` (write-audit every record, scope `decision`) |
| Task outcome source | existing `task_log` rows (status/attempts/result/error_log) |
| Connector/cost source | existing `episodic_events` scope `connector` (`{id, ok, status, source}`) and `email_events` (tags `campaign:<id>`, `seq:<stage>`, `ticket:<id>`) |
| Provider/model attribution | `bus_messages` `conversations` payloads already carry `model`; Workers AI runs are the only model provider today |
| Acceptance / downstream metric | existing `crm_leads.status` transitions, `email_events` `clicked-trial`, `scan_stats` score rows |
| Operator delivery | inbox digest via existing `brevoSend` + `marketingFooter` (transactional footerless path) |

## Minimal schema / route changes

```sql
CREATE TABLE IF NOT EXISTS decision_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  objective TEXT,
  proposed_action TEXT,
  authority TEXT NOT NULL DEFAULT 'auto',   -- auto | approval | human_only
  evidence TEXT,                            -- JSON: [{claim, disposition, package_id}]
  cost_projection_cents INTEGER,
  target TEXT,                              -- metric/URL the action intends to move
  expiry_at TEXT,
  decided_by TEXT,
  outcome TEXT,                             -- approved | executed | rejected | voided | expired
  rollback TEXT,                            -- operator note: how to undo
  executed_task_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_decision_packages_outcome ON decision_packages(outcome, created_at);

-- Cost/outcome ledger: append-only join keys, not a metrics warehouse
CREATE TABLE IF NOT EXISTS outcome_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,                   -- task | connector | campaign | scan
  ref_id TEXT NOT NULL,
  agent_id TEXT,
  provider TEXT,                            -- workers-ai (only model provider today)
  model TEXT,
  duration_ms INTEGER,
  retries INTEGER,
  est_cost_cents INTEGER,
  acceptance TEXT,                          -- passed | failed | n/a
  downstream_note TEXT,                     -- e.g. "crm lead 12 → engaged"
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_ref ON outcome_ledger(ref_type, ref_id);
```

**Routes** (all `x-internal` on the platform worker; hand-maintained table in `worker/src/openapi.ts` must list them):

- `POST /decision/packages` — create/decide a package; every write also inserts an `episodic_events` row with scope `decision` (matching the `/query` audit pattern).
- `GET /decision/packages?outcome=&limit=` — list.
- `POST /ledger/append` — append a ledger row (fleet + operator tooling).
- `GET /ledger/summary?days=` — grouped by `ref_type`/`provider`: total, est cost, acceptance pass-rate.

The daily maintenance sweep appends ledger rows for tasks completed in the last 24h (joining `task_log` with `bus_messages` for model attribution) — same pattern as `syncShippedFeatures`.

## Test strategy

- **pytest:** migration 011 applies on top of 001..010 idempotently; `decision_packages`/`outcome_ledger` columns and outcome CHECK constraint present; self-heal DDL in `worker/src` matches the migration (same drift guard as the P1 evidence/breaker schema tests).
- **node --test (`worker/test/*.mjs`):** lift `handleServices`-adjacent handlers like the existing `roadmap-routes.test.mjs` — create/list/decide flow; ledger append guards ref-type enum; decision packages render evidence from `crm_lead_evidence` without mutating it.
- **Fleet-local:** run one cycle with a mocked `agentTick` completing a fake task and assert one ledger row lands — exercised in `tests/unit`, never against production.

## Non-goals (explicit)

- No blockchain/immutable-hash chain for the ledger (`nexus-ai`'s audit hash chains are out of scope; D1 write-audit + the existing retention policy is the record).
- No LinkedIn automation; no desktop runtime; no second Postgres/Docker control plane.
- No ERPNext, no new analytics framework, no standalone metrics warehouse — the ledger is join keys over existing tables only.
- No cost *billing* of the fleet — estimates are informational, in cents, derived from Workers AI pricing constants.
- No new scheduling/control-plane loop; the daily sweep rides the existing `runDailyMaintenance` gate (`maint:last_run`).

## Rollback

The tables are additive and the sweep writes are best-effort (`catch(() => {})` like every other sweep). Rollback = delete `decision_packages`/`outcome_ledger` rows (or drop the tables) and remove the 3 routes + sweep block; no existing table, task queue, or connector path changes. No data migration exists to reverse because no column on an existing table is modified.