-- Additive CRM claim provenance and outbound breaker policy.
-- Safe to re-run on D1; no existing lead qualification fields are changed.
CREATE TABLE IF NOT EXISTS crm_lead_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    claim TEXT NOT NULL,
    source_url TEXT,
    fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    evidence_excerpt TEXT,
    evidence_hash TEXT,
    verification_method TEXT NOT NULL DEFAULT 'none' CHECK (verification_method IN ('exact','normalized','fuzzy','none')),
    confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
    provider TEXT,
    disposition TEXT NOT NULL DEFAULT 'unknown' CHECK (disposition IN ('verified','inferred','unknown')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_lead_evidence_lead ON crm_lead_evidence(lead_id, id DESC);

CREATE TABLE IF NOT EXISTS outbound_breaker_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    volume_limit INTEGER NOT NULL DEFAULT 100,
    volume_window_ms INTEGER NOT NULL DEFAULT 3600000,
    failure_limit INTEGER NOT NULL DEFAULT 5,
    failure_window_ms INTEGER NOT NULL DEFAULT 600000,
    error_rate_limit REAL NOT NULL DEFAULT 0.5,
    error_rate_window_ms INTEGER NOT NULL DEFAULT 600000,
    deliverability_limit REAL NOT NULL DEFAULT 0.2,
    deliverability_window_ms INTEGER NOT NULL DEFAULT 86400000,
    enabled INTEGER NOT NULL DEFAULT 1,
    tripped_reason TEXT,
    tripped_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO outbound_breaker_config (id) VALUES (1);
