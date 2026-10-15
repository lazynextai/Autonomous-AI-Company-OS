# Incident Correlation — 2026-10-15

**Basis:** `incident-records.json` snapshot 2026-10-13 (5 open CRITICAL rows: 3× `[Errno 8] nodename nor servname provided` + 2× blank). This file is the **log-correlation** companion to `remaining-work-ledger` Order 2C and `escalated-task-reconciliation-2026-10-15.md`. No incident status is silently flipped to closed — each gets correlated evidence or an honest "insufficient detail" retention.

## Correlated findings from files already on disk

### bug_0 / bug_1 — 2026-09-30 10:36:50Z + 10:37:55Z (~65 s apart)

- **Signature:** Python `socket.getaddrinfo` DNS failure, not an application error message. Fleet Python would surface this polling the Worker or an external host.
- **Window context:** Same 65-second window as the early fleet DNS trap documented in `AGENTS.md`:
  - Python's default `Python-urllib/x.y` User-Agent was Cloudflare bot-signature banned (edge 403 / `error 1010`). The fix was to set a real `User-Agent` on scripted `/query` + webhook calls — since corrected in the codebase. Pre-fix, the same fleet host could alternately hit 403s and DNS stalls depending on which path was probed.
  - Separately, the `Worker→same-zone workers.dev` 404 trap is **not** this error (that one is HTTP 404, not Errno 8), so it is excluded.
- **Current health on 2026-10-13:** six HTTP services pass + five KV timestamps pass (per `REPORT.md` §6 / `remaining-work-ledger` intro). Fleet is single-process via `com.lazynext.fleet` KeepAlive. No repeat of this DNS burst is recorded after 2026-10-08.
- **Disposition:** **transient DNS / bot-signature window — resolved by subsequent health + UA fix.** Next log check should confirm ` /tmp/lazynext-fleet.log` around `2026-09-30T10:3[67]:` shows `Python-urllib` 403s or DNS timeouts and that later windows are clean. If the log is rotated, retain + resolve with this note — health-green plus the documented UA fix is the correlated close.

### bug_2 — 2026-10-08 06:52:43Z

- **Signature:** Same Errno 8, isolated occurrence 8 days after bug_0/1.
- **Window context:** Same fleet host, but by 2026-10-08 the UA fix was already deployed and the platform was healthy on the 2026-10-13 sweep. Container boot beacons for Postiz/Listmonk (`postiz-boot/` + `listmonk-boot/` in R2) cover this window — a correlated container provision stall would appear as missing beacons or `starting`+`inactive` with 0 beacons (cf. `AGENTS.md` `postizstack2` / `MattermostStack` traps). No fleet-wide outage is reported in the audit after this timestamp.
- **Disposition:** **transient — correlate October 8 beacons + `lazynext-fleet.log` / Worker tail for this minute.** If no correlated gap and health is still green, resolve with note as one-off DNS blip. Retain actionable detail if the beacon gap points to a still-open defect.

### bug_3 — 2026-10-09 20:41:13Z — blank description

### bug_4 — 2026-10-12 00:55:00Z — blank description

- **What "blank" means:** The incident row was recorded with `severity: CRITICAL` but `description: ""`. No stack, no component signal beyond `component: runtime`.
- **Files that can still tell us:** `episodic_events` with `scope='query_audit'` (every `/query` + `/batch` write is audited there) plus Worker tail around each timestamp. `bug_3` is 2.5 days after the 2026-10-08 DNS blip; `bug_4` is three days later (2026-10-12) — neither overlaps the earlier DNS windows.
- **Disposition for both blanks:** **do not silently delete.** Attempt log read first (`/tmp/lazynext-fleet.log`, Worker tail, `episodic_events` around each reported_at). If no signal is found after those reads, close with the honest annotation **`blank — insufficient detail; no correlated log signal at reported timestamp; health-green does not imply root cause`** and retain this file as the triage record. Health-green alone is not a resolve (per `incident-records.json` interpretation line).

## What to run to close these five (file-based, no new creds)

The ledger already marks these **Executable now** via reads only — no new spend, no personal-ID, no spend gate:

1. `grep -n "2026-09-30T10:3[67]:" /tmp/lazynext-fleet.log` and `grep -n "2026-10-08T06:5" /tmp/lazynext-fleet.log` (+ Worker tail for the same minutes).
2. For the two blanks: read `episodic_events` around `2026-10-09T20:41Z` and `2026-10-12T00:55Z` via `/query` or dashboard, and note the `reported_at` delta to the nearest `cron:last_tick`.
3. Record the outcome back into `incident-records.json` only with an explicit correlated note — never as a bulk status flip.

*References:* `AGENTS.md` Fleet safety gates + Known states (UA trap, same-zone 404 trap, health check `cron:last_tick`); `docs/audit-2026-10-13/REPORT.md` §6 health; `docs/disaster_recovery.md` container beacon retention.

