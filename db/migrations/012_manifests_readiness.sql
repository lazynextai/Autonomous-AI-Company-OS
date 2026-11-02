-- Company template manifests + capability readiness (roadmap P3/P5).
-- Additive only and safe to re-run. No existing table is altered: the active
-- manifest pointer lives in KV (config:manifest:active) plus the activated row
-- here, so the live company_brain row the fleet reads is never mutated.
CREATE TABLE IF NOT EXISTS company_manifests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'company',
    version INTEGER NOT NULL DEFAULT 1,
    body TEXT NOT NULL,
    valid INTEGER NOT NULL DEFAULT 0 CHECK (valid IN (0, 1)),
    activated INTEGER NOT NULL DEFAULT 0 CHECK (activated IN (0, 1)),
    validation_errors TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (name, version)
);
CREATE INDEX IF NOT EXISTS idx_company_manifests_active ON company_manifests(name, activated, id);

-- Readiness evidence: one row per probed capability. `documented` records that
-- the capability is claimed in the library/docs; `last_probe_ok` is only ever
-- 1 when a zero-side-effect read probe actually succeeded.
CREATE TABLE IF NOT EXISTS capability_readiness (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capability TEXT NOT NULL UNIQUE,
    last_probe_at TEXT,
    last_probe_ok INTEGER,
    last_error TEXT,
    documented INTEGER NOT NULL DEFAULT 0 CHECK (documented IN (0, 1)),
    probe_supported INTEGER NOT NULL DEFAULT 1 CHECK (probe_supported IN (0, 1)),
    keystore TEXT,                    -- kv | secret | none
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_capability_readiness_probe ON capability_readiness(last_probe_ok, last_probe_at);