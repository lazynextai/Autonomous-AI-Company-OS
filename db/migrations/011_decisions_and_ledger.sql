-- Governance decision packages + outcome/cost ledger (roadmap P1/P2).
-- Additive only. Re-running is safe; no existing table or column is modified.
-- authority class: auto (reversible/internal) | approval (external, reversible) | human_only (money/legal/identity/irreversible)
-- outcome lifecycle: draft -> approved | rejected | voided; approved -> executed | failed | voided | expired.
CREATE TABLE IF NOT EXISTS decision_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    objective TEXT,
    proposed_action TEXT,
    authority TEXT NOT NULL DEFAULT 'auto' CHECK (authority IN ('auto', 'approval', 'human_only')),
    evidence TEXT DEFAULT '[]',
    cost_projection_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_projection_cents >= 0),
    target TEXT,
    expiry_at TEXT,
    decided_by TEXT,
    outcome TEXT NOT NULL DEFAULT 'draft' CHECK (outcome IN ('draft', 'approved', 'rejected', 'executed', 'failed', 'voided', 'expired')),
    rollback TEXT,
    executed_task_id TEXT,
    voided_reason TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_decision_packages_outcome ON decision_packages(outcome, created_at);
CREATE INDEX IF NOT EXISTS idx_decision_packages_target ON decision_packages(target);

-- Append-only join keys over already-existing audit surfaces. dedupe_key is
-- NULL for live dispatch rows (one per event) and a stable key for sweep rows
-- (task:<task_id>, campaign:<id>) so daily builds never duplicate.
CREATE TABLE IF NOT EXISTS outcome_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('task', 'connector', 'campaign', 'scan')),
    ref_id TEXT NOT NULL,
    agent_id TEXT,
    provider TEXT,
    model TEXT,
    duration_ms INTEGER,
    retries INTEGER NOT NULL DEFAULT 0,
    est_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (est_cost_cents >= 0),
    acceptance TEXT NOT NULL DEFAULT 'n/a' CHECK (acceptance IN ('passed', 'failed', 'n/a')),
    downstream_note TEXT,
    dedupe_key TEXT UNIQUE,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_ref ON outcome_ledger(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_outcome_ledger_provider ON outcome_ledger(provider);