-- Per-campaign consent basis (migration 013).
--
-- The marketing footer's "why are you receiving this" line must match how an
-- audience was actually acquired. Sequence/waitlist recipients opted in via
-- /leads or /api/v1/waitlist; a cold outreach campaign's recipients are
-- Serper-discovered prospects whose addresses were published on their company
-- websites and who never signed up — sending them the opt-in sentence claims
-- consent they never gave (the exact thing a spam complaint cites).
--
-- SQLite has no ADD COLUMN IF NOT EXISTS (verified: it is a parse error), so
-- re-run safety comes from the worker self-heal `ensureCampaignConsentColumn`
-- in worker/src/services.ts, which PRAGMA-checks the column before ALTERing.
-- This file is therefore one-shot: on a re-run the single ALTER fails with
-- "duplicate column name: consent_basis" and nothing changes — the backfill
-- below is idempotent and harmless either way. Deploys that land before this
-- file runs self-heal at first campaign read.
ALTER TABLE email_campaigns ADD COLUMN consent_basis TEXT NOT NULL DEFAULT 'opt_in';

-- Outreach campaign 9 (2026-11-03) is the first cold-prospect send: mark it
-- explicitly. Name-guarded so a recycled id on a fresh database can't be
-- mis-stamped; idempotent on re-run.
UPDATE email_campaigns SET consent_basis = 'prospect'
 WHERE id = 9 AND name = 'outreach-shipped-stack-2026-11-03';