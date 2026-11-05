# GitHub Star Lists — Full Idea Triage (35/35)

**Date:** 2026-11-05 (IST)
**Scope:** Every repository still on both GitHub star lists — **Implementation References (18)** and **Market Intelligence (17)** = **35 total**
**Lists:** [Implementation References](https://github.com/stars/lazynextai/lists/implementation-references) · [Market Intelligence](https://github.com/stars/lazynextai/lists/market-intelligence)
**Predecessors:** [github-star-list-autonomous-ai-company-os-2026-11-02.md](./github-star-list-autonomous-ai-company-os-2026-11-02.md) (51-item audit, 16-item prune, list split) · [market-intelligence-opportunity-scan-2026-11-03.md](./market-intelligence-opportunity-scan-2026-11-03.md) (business/market read)
**Method:** authenticated `gh api graphql` for list membership and full repository metadata (stars, forks, language, licence, archived, fork, size, `pushedAt`), then `gh api repos/{owner}/{repo}/readme` for README-level signals on all 35. No cloning. No source review beyond what each public README publishes.
**Safety:** docs-only. No code changed, no product files touched, no external accounts opened, no signups, nothing deployed, nothing purchased. One branch, one PR, not merged.

---

## 1. How to read this document

This is an **idea map**, not a dependency list, and not a recommendation to copy code. Every repository is scored on one question: *does it contain a reusable idea that fits surfaces Lazynext already runs?*

Three honesty rules apply:

1. **README-level evidence is labelled.** Most of these repositories are prototypes with 1–3 stars. A README claim is a claim. Where the only evidence is the README, the row says `README-only`. Where there is no README at all, the row says so — that is a finding.
2. **"Already covered" is not a compliment to the repo.** It means Lazynext independently shipped a stronger version. Several of the most-cited repositories here are behind what the platform already does.
3. **Licence is a first-class risk.** Twelve of the 35 repositories are code with **no licence file at all**. Under default copyright that means *all rights reserved*: they may be read for ideas and may not be copied, vendored, or adapted. Section 9 covers this.

### Column key

| Column | Meaning |
|---|---|
| **Category** | What kind of thing the repo is (governance, growth/CRM, memory, positioning, etc.) |
| **Useful ideas / features / tools** | Only what the README actually demonstrates, in the repo's own terms |
| **Current Lazynext equivalent** | `Already have` / `Partial` / `Absent`, plus the concrete existing surface |
| **Disposition** | `already covered` · `build candidate` · `research-only` · `reject` |
| **Fit** | 0–5. 5 = high-leverage idea mapping onto shipped surfaces with a small shape. 0 = no defensible fit. |
| **Implementation notes** | Mapped to Workers / D1 / KV / Queues / Vectorize / Durable Objects / dashboard / connectors / MCP / A2A |
| **Risk flags** | `license` · `stack mismatch` · `personal-ID gate` · `external-provider gate` · `business scope` |
| **Why** | The one-line reason the disposition is what it is |

---

## 2. Coverage and counts

| Metric | Count |
|---|---:|
| Repositories on Implementation References | 18 |
| Repositories on Market Intelligence | 17 |
| **Total rows in this document** | **35** |
| Unique `owner/repo` keys | 35 |
| Duplicate rows | 0 |
| Rows carrying a Markdown link | 35 |
| Rows marked `README-only` or `NO README` | 35 |

### Disposition split

| Disposition | Count | Meaning for the roadmap |
|---|---:|---|
| **already covered** | 4 | Lazynext already ships an equal-or-stronger version. No work. |
| **build candidate** | 5 | A real, small idea worth building inside existing surfaces. |
| **research-only** | 14 | Read for patterns and positioning. No build. |
| **reject** | 12 | Conflicts with a house rule or has no defensible fit. |
| **Total** | **35** | |

**Only 5 of the 35 rows are build candidates, and they feed 5 bounded work items** — four of which are small enough to start this week (Section 5). That is the headline: this list is a research corpus, not a backlog.

### Fit distribution

| Fit | Count | Reading |
|---|---:|---|
| 5 | 2 | Direct product gap, small shape |
| 4 | 3 | Strong reusable idea |
| 3 | 9 | Useful pattern, needs design |
| 2 | 7 | Positioning / research value only |
| 1 | 8 | Peripheral, or a single narrow lesson |
| 0 | 6 | No defensible fit |
| **Total** | **35** | |

### Licence distribution (exact, per row)

| Licence | Count | Repos |
|---|---:|---|
| **MIT** | 12 | clawcompany · cyber-ai-team · ai-company-os-github · auto-co-meta · wizard-l1 · agent-os · enterprise-B2B · mindlens · EmpireOS · os1-samantha · AICompanyOS · crazy-pumpkin-os |
| **Apache-2.0** | 1 | CortexOS |
| **`NOASSERTION`, MIT text on disk** | 1 | AetherOS (retains a Nous Research attribution clause — read the `LICENSE` before any reuse) |
| **No licence file — code repos** | 12 | company-os · nexus-ai · company-ops · HunterOS · aicompanyos · aetherion-os · ujjwalredd fork · ArcOS · ServiceOS · AilaAI-OS · N8N-Agent · job-search-os |
| **No licence — profile / site / self** | 9 | 7 `api-evangelist/*` profiles · VIATREE-site · lazynextai/Autonomous-AI-Company-OS |
| **Total** | **35** | |

> **12 code repositories carry no licence at all.** Under default copyright that is *all rights reserved*: ideas may be read, nothing may be copied. Section 9 states the policy and the safe/unsafe line.


---

## 3. Master table — Implementation References (18)

| # | Repository | Category | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 1 | [Claw-Company/clawcompany](https://github.com/Claw-Company/clawcompany) · 489★ · MIT · TypeScript | Roles, templates, memory, cost UX *(README-only)* | 38 roles, 6 templates, 4-layer company memory, 9 tools, model routing, per-mission cost, report export, `npx` onboarding. | **Partial:** agents/roles, D1 `company_brain`, `briefings`, `ledger.ts`; no role catalogue, cost-per-mission display, or export gallery. | **build candidate** | 4 | Templates and roles → `worker/src/manifests.ts`; cost → `worker/src/ledger.ts`; export → existing `/pdf` Browser Rendering route; no new runtime. | `license: MIT` · `stack mismatch: Node/desktop sibling` | Templates-as-data and cost-per-outcome fit; do not port its runtime. |
| 2 | [Node-Features/company-os](https://github.com/Node-Features/company-os) · 2★ · Go · **no licence** · pre-alpha | Organization semantics, M&E, finance *(README-only)* | Mission → policy → objectives → departments → workflows → capabilities → results; Research/M&E/Finance feedback triangle; authority boundaries. | **Partial:** `decisions.ts`, `readiness.ts`, `ledger.ts`, and `manifests.ts` cover the concepts, but not a full mission hierarchy. | **research-only** | 3 | Keep the existing manifest/KV/D1 layer; do not add a Go organization runtime or second control plane. | `license: no licence` · `stack mismatch: Go` · `business scope: pre-alpha` | Best conceptual framing; most of the safe substance is already shipped under different names. |
| 3 | [Hyper-AI-Lab/cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) · 19★ · MIT · Python | Governance, observer, readiness *(README-only)* | Independent observer, evidence/goal-drift/prompt-injection critique, owner approvals with replay protection and expiry, readiness gates, canonical business records. | **Already have:** `observer.ts`, `core/tools/observer.py`, `decisions.ts`, `readiness.ts`, dashboard `/governance`. | **already covered** | 3 | Verify target-bound approval reuse in `decisions.ts`; do not import ERPNext/Postgres/Qdrant/Temporal. | `license: MIT` · `stack mismatch` · `external-provider gate: ERPNext` | Lazynext independently built the same governance layer on D1/KV. |
| 4 | [Mistico06/ai-company-os-github](https://github.com/Mistico06/ai-company-os-github) · 1★ · MIT · Python | Role packs, phase gates, evidence *(README-only)* | 119 role packs vs 19 executable agents; owner ≠ reviewer; 23-phase SOP; evidence gates; `INSUFFICIENT EVIDENCE`; deterministic drills/rubrics. | **Partial:** `task_log`, observer, readiness, and evidence vocabulary exist; reviewer separation and rubric view do not. | **build candidate** | 4 | Add reviewer metadata to existing task/decision records; use D1/evidence rows and deterministic checks, not a new workflow engine. | `license: MIT` · `stack mismatch: Python/SQLite` · `business scope: many roles untested` | “Observed behaviour beats declared capability” is directly reusable and safe. |
| 5 | [piyush06singhal/nexus-ai](https://github.com/piyush06singhal/nexus-ai) · 1★ · Python · **no licence** | Full company OS, audit *(README-only)* | Typed lifecycle, bounded recovery, approvals, audit hash chain, kill switch, multi-tenancy, mock provider, readiness report; README claims 156 tables and large tests. | **Partial:** `task_log`, `episodic_events`, breakers, decisions, readiness; no audit hash chain or kill switch. | **research-only** | 3 | Study a future tamper-evident event chain; do not reproduce its 156-table Postgres design. | `license: no licence` · `stack mismatch: Postgres/Redis/Docker` | Valuable comparative architecture, but wrong shape and no reuse rights. |
| 6 | [NikitaDmitrieff/auto-co-meta](https://github.com/NikitaDmitrieff/auto-co-meta) · 52★ · MIT · TypeScript | Thin autonomous loop *(README-only)* | Small consensus baton, 14 agents, Markdown state, templates, cost-per-cycle, escalation cadence, no-delete/no-spend limits. | **Partial:** Lazynext fleet is more durable; manifests and ledger exist, but cycle cost is not shown. | **research-only** | 3 | Use as simplicity benchmark; represent new work as existing task + event + artifact. | `license: MIT` · `external-provider gate: Claude CLI` | Transfer the thin-loop discipline, not its execution harness. |
| 7 | [yongbin-lab/wizard-l1](https://github.com/yongbin-lab/wizard-l1) · 2★ · MIT · Python | Goal → task DAG *(README-only)* | JSON-schema goal decomposition; acceptance, dependencies, priority, confirmation gates; append-only heartbeat; mock mode. | **Partial:** task insertion and agent tick exist, but no goal plan/DAG/dependency fields are operator-visible. | **build candidate** | 4 | Extend `task_log` and existing MCP/A2A task entry with acceptance/dependencies; Workers AI may plan, `agentTick` remains the only scheduler. | `license: MIT` · `stack mismatch: Python/Claude CLI` | Smallest clear reference for a plan-before-execute surface. |
| 8 | [agentxagi/agent-os](https://github.com/agentxagi/agent-os) · 2★ · MIT · Shell | Operations and breakers *(README-only)* | Content/engagement/growth breakers, sprint creation, task board, quality gates, stale-task checks. | **Already have:** `breakers.ts`, `outbound_breakers.py`, social Queue, backoff, orphan rescue, dead-corpus dedup. | **already covered** | 3 | Breakers are already D1-backed and safer; no second sprint scheduler. | `license: MIT` · `stack mismatch` · `external-provider gate` | Lazynext’s shipped breaker path is the stronger equivalent. |
| 9 | [itsPremkumar/company-ops](https://github.com/itsPremkumar/company-ops) · 1★ · Python · **no licence** | Constitution and confidence gate *(README-only)* | Single constitution, confidence-gated loop, escalation, self-improvement log, revenue tracking. | **Partial:** `.cursor/rules`/`AGENTS.md` are the operating constitution; decision gate uses authority, not confidence. | **research-only** | 2 | Add documentation only if wanted; do not replace the existing authority model with a vague confidence score. | `license: no licence` · `business scope: single-file skill` | The useful idea is already present at much higher resolution in the operating rules. |
| 10 | [DevChiniwala/CortexOS](https://github.com/DevChiniwala/CortexOS) · 3★ · Apache-2.0 · TypeScript/Rust/Tauri | Evidence-verified GTM *(README-only)* | Exact/normalized/fuzzy claim verification, source HTML, corroboration, evidence links, ICP scoring only from verified facts. | **Partial and close:** `worker/src/evidence.ts` already has exact/normalized/fuzzy/none and verified/inferred/unknown; evidence summary API exists, but no corroboration UI. | **build candidate** | 5 | Add source-domain distinctness/corroboration to evidence records; expose through CRM lead evidence route and dashboard. No Tauri. | `license: Apache-2.0` · `stack mismatch: Tauri/Rust` | Best direct product-gap signal in the list. |
| 11 | [SwastikSynqAI/enterprise-B2B-multimodal-agent](https://github.com/SwastikSynqAI/enterprise-B2B-multimodal-agent) · 2★ · MIT · TypeScript | Growth signals and configurable ICP *(README-only)* | ICP YAML, signal weights, prediction thresholds, engine schedules, provider config, self-optimizing super-agent. | **Partial:** CRM qualification and engaged/subscribed segments exist; no editable ICP weights. | **build candidate** | 3 | Add optional `icp`/`signal_weights` to existing validated company manifest; consume in CRM scoring. | `license: MIT` · `external-provider gate: LinkedIn/Apollo` · `business scope` | Configurable ICP is useful; its LinkedIn automation is explicitly excluded. |
| 12 | [sagar300408-stack/HunterOS](https://github.com/sagar300408-stack/HunterOS) · 2★ · Python · **no licence** | SDR review queue *(README-only)* | Offer → ICP → research → pain → scoring → human review; approve/reject/regenerate; CSV export; compliance limits and unsubscribe. | **Partial:** campaign gate and unsubscribe are live; no per-message review queue. | **research-only** | 3 | Use only as UX research for the approval inbox; campaign approval stays one decision per campaign, not one provider call per recipient. | `license: no licence` · `business scope` · `stale: 2026-05` | Good review-queue reference, but not a clean implementation candidate. |
| 13 | [lora-sys/aicompanyos](https://github.com/lora-sys/aicompanyos) · 5★ · TypeScript · **no licence** | Quality loop and preference learning *(README-only)* | Immutable five-dimension grading; critic feedback; never-degrade best version; stop ladder; preference learning; TUI/web UI. | **Partial:** retries and error feedback exist; no graded generation loop or best-version retention. | **research-only** | 3 | Borrow stop/retention semantics for code or content artifacts; keep it inside existing task acceptance. | `license: no licence` · `stack mismatch: Node/Next` | Interesting quality pattern, but too broad for a safe near-term build. |
| 14 | [KOSASIH/aetherion-os](https://github.com/KOSASIH/aetherion-os) · 13★ · TypeScript · **no licence** | Company bootstrap and economic agents *(README-only)* | One-prompt company bootstrap, seven role taxonomy, Kanban tasks, treasury and shareholder yield on Solana. | **Partial:** manifests can bootstrap goals/roles; no chain treasury. | **reject** | 1 | Keep role naming as research only. No Solana, wallet, treasury, or on-chain payout work. | `license: no licence` · `business scope: blockchain` · `external-provider gate` | Explicitly conflicts with the no-blockchain rule. |
| 15 | [mdsabibahamedsad/AetherOS](https://github.com/mdsabibahamedsad/AetherOS) · 2★ · `NOASSERTION` (MIT text) · Python/Electron | Many surfaces, memory, delegation *(README-only)* | One core behind desktop/TUI/CLI/gateway; MCP catalogue; approvals; cancellation correctness; skill archiving; bounded delegation; cron catch-up; injection scanners. | **Partial:** dashboard/PWA, CLI, MCP, A2A, widget exist; approvals and memory are present in narrower form. | **research-only** | 3 | Translate ideas to dashboard/PWA/MCP/A2A; no Electron runtime, second cron, or desktop build. | `license: NOASSERTION` · `stack mismatch: Electron` · `business scope` | Useful surface design; its desktop runtime is out of scope. |
| 16 | [kevin91nl/mindlens](https://github.com/kevin91nl/mindlens) · 1★ · MIT · Python | Holding-company knowledge work *(README-only)* | Workspace/vault discovery, research lab, venture studio, Telegram natural-language interface, agent workspaces. | **Partial:** company brain, Vectorize knowledge search, Telegram connector; single-company rather than multi-workspace. | **research-only** | 2 | Study workspace/knowledge vocabulary; do not introduce multi-tenant holding-company scope. | `license: MIT` · `stack mismatch: Python/vault` · `business scope` | Useful framing, not a product gap for Lazynext now. |
| 17 | [ujjwalredd/Autonomous-AI-Company-Operating-System](https://github.com/ujjwalredd/Autonomous-AI-Company-Operating-System) · 8★ · Python · **no licence** | Historical provenance fork *(README + metadata)* | Older Redis/Supabase/Chroma version of the company OS and imported project lineage. | **Already have:** canonical work is `lazynextai/Autonomous-AI-Company-OS`; current architecture is Cloudflare-first. | **reject** | 1 | Keep only as provenance link; never use it as the current implementation reference. | `license: no licence` · `stack mismatch` · `business scope: superseded` | Historical context, not a feature source. |
| 18 | [lazynextai/Autonomous-AI-Company-OS](https://github.com/lazynextai/Autonomous-AI-Company-OS) · 1★ · TypeScript · current canonical repo | Self-reference and shipped platform *(README + metadata)* | Cloudflare Workers/D1/KV/Vectorize/Queues, agents, governance, MCP/A2A, public API, dashboard, connectors. | **Already have:** this is the canonical implementation. | **already covered** | 5 | Use as the source of truth for what is already live; do not create a second project or control plane. | `business scope: self-reference` | It is the product, not an outside idea source. |

---

## 4. Master table — Market Intelligence (17)

| # | Repository | Category | Useful ideas / features / tools | Current Lazynext equivalent | Disposition | Fit | Existing-surface notes | Risk flags | Why |
|---:|---|---|---|---|---|---:|---|---|---|
| 19 | [api-evangelist/pango](https://github.com/api-evangelist/pango) · 1★ · profile only | Market positioning *(profile README)* | Kin Score **20.0** (best in set); “agentic OS” for logistics; 100+ carriers; markets API-first with **no published OpenAPI/SDK**; one MCP server; pricing page routes to `book-demo`. | **Already have:** OpenAPI 3.1 with declared security schemes, `/mcp`, `/a2a`, `agent.json`, `llms.txt`, `/health`, free tier and public pricing. | **research-only** | 2 | Marketing/listing copy only — “we publish what they only claim”; no product change. | `business scope: logistics vertical` · `external-provider gate` | Strongest proof of the category’s claim-versus-publish gap, which is already a Lazynext advantage. |
| 20 | [api-evangelist/junaai](https://github.com/api-evangelist/junaai) · 2★ · profile only | Market positioning *(profile README)* | Kin Score **8.2**; “Agentic Factory OS”; enterprise SAP/Siemens integrations; human-in-the-loop and traceability messaging; no public API or pricing. | **Partial:** governance and readiness pages exist; the narrative is not packaged for buyers. | **research-only** | 1 | Copy/narrative only; no factory vertical work. | `business scope: industrial vertical` | Competitor lens only. |
| 21 | [api-evangelist/ai-build](https://github.com/api-evangelist/ai-build) · 1★ · profile only | Market positioning *(profile README)* | Kin Score **18.5**; additive-manufacturing OS with computer-use control of CAD/CAE/CAM; no public API/docs. | **Absent**, correctly. | **reject** | 0 | None. | `business scope: hardware/manufacturing` | No domain assets, no surface fit, and a new vertical is a new product. |
| 22 | [api-evangelist/absurd](https://github.com/api-evangelist/absurd) · 1★ · profile only | Market positioning *(profile README)* | Kin Score **3.0**; “Creative OS for AI video”; deliberately sales-led: four-route sitemap, no pricing page, no dev portal, no GitHub org. | **Partial:** public pricing, free tier, self-serve checkout. | **research-only** | 2 | Marketing contrast only. | `business scope: video production` | Its missing self-serve funnel justifies Lazynext’s transparent pricing as a wedge. |
| 23 | [api-evangelist/arx](https://github.com/api-evangelist/arx) · 1★ · profile only | Agent discovery precedent *(profile README)* | Kin Score **10.9**; defense autonomy; publishes an `llms.txt` (one of only two agent artifacts in the whole set); no public API. | **Already have:** `llms.txt`, `/.well-known/agent.json`, MCP, A2A, OpenAPI. | **research-only** | 2 | Add an “agent-ready” badge line to marketing/status copy; artifacts already exist. | `business scope: defense` | Validates agent-discovery artifacts as differentiators, which Lazynext already ships more completely. |
| 24 | [api-evangelist/alphabet](https://github.com/api-evangelist/alphabet) · 1★ · profile only | Control profile *(profile README)* | Kin Score **3.3**; broad big-tech surface; near-zero agent artifacts. | **Already have** more agent artifacts than the profile documents. | **reject** | 0 | None. | `business scope: none` | Control entry for the rubric method, not an idea source. |
| 25 | [api-evangelist/applied-intuition](https://github.com/api-evangelist/applied-intuition) · 1★ · **ARCHIVED** | Archived profile *(README)* | Physical-AI/vehicle-OS profile; archived; no software. | **Absent**, correctly. | **reject** | 0 | None. | `archived` · `business scope: vehicles` | Archived and unrelated; keep only as market history. |
| 26 | [Zenieverse/EmpireOS](https://github.com/Zenieverse/EmpireOS) · 2★ · MIT · TypeScript | Human workspace as source of truth *(README-only)* | Notion as central nervous system and audit trail; MCP-style `queryDatabase`/`createPage`/`updatePage` tools; agents act on human-readable records; goal creation triggers strategy agent. | **Partial:** dashboard `/governance`, decision packages, observer, audit; no external workspace mirror. | **research-only** | 2 | The useful lesson is “humans approve in the workspace they already read”; our dashboard is that workspace. Do not add a Notion dependency. | `license: MIT` · `external-provider gate: Notion` · `business scope` | Good narrative, weaker than shipped governance. |
| 27 | [Eginn-33/VIATREE-site](https://github.com/Eginn-33/VIATREE-site) · 3★ · HTML · site only | Positioning site *(README-only, 22KB repo)* | Marketing site for “7 departments / 27+ agents”, each department locked to a different model vendor; 15 blog posts. | **Partial:** provider-agnostic dispatch; no per-department vendor claim. | **research-only** | 1 | Marketing copy only; do not claim per-department vendors we do not enforce. | `business scope: marketing site` · `evidence: no implementation` | A positioning artifact, not an implementation. |
| 28 | [BigRaj01/ArcOS](https://github.com/BigRaj01/ArcOS) · 1★ · TypeScript · **no licence** · **NO README** | Blockchain economic agents *(metadata + tree only)* | Agents that plan, work, and pay each other in USDC on Circle Arc; pnpm monorepo; no README at all. | **Absent**, correctly. | **reject** | 0 | None. | `license: no licence` · `business scope: blockchain` · `no README` | Blockchain payments are a standing no-go, and there is no README evidence to evaluate. |
| 29 | [ChaitanyaJoshi1769/ServiceOS](https://github.com/ChaitanyaJoshi1769/ServiceOS) · 1★ · TypeScript · **no licence** | Service-business positioning *(README-only)* | “OS for autonomous AI-native service companies”; buzzword enterprise stack (K8s/Kafka/LangGraph); positioning toward service businesses. | **Partial:** a service-business buyer is reachable with existing CRM/sequences. | **reject** | 1 | Positioning note only; no infrastructure import. | `license: no licence` · `stack mismatch` · `business scope` | Name-level market signal, no reusable mechanism. |
| 30 | [gagan114662/os1-samantha](https://github.com/gagan114662/os1-samantha) · 1★ · MIT · Swift · 19.5 MB | Desktop voice assistant *(README-only)* | Swift desktop “AI office”; realtime voice mode; “company mode”; local tool access; 147 open issues. | **Partial:** dashboard PWA, widget, CLI; no voice surface. | **reject** | 1 | Map voice ideas to widget/chat/Telegram later; no desktop runtime. | `license: MIT` · `stack mismatch: Swift desktop` · `business scope` | Desktop-only runtime conflicts with the Cloudflare-first rule. |
| 31 | [grunewaldtheo9-coder/AilaAI-OS](https://github.com/grunewaldtheo9-coder/AilaAI-OS) · 1★ · JavaScript · **no licence** | VM/computer-use OS *(README-only)* | Gemini-controlled secure Linux VM; Firebase; local development and deploy path; safety model. | **Partial:** Worker-bounded browser/render tools; no VM control plane. | **reject** | 0 | None. | `license: no licence` · `stack mismatch: VM/Firebase` · `business scope: security` | Heavy VM trust boundary with no fit to the product. |
| 32 | [walid-khalafi/AICompanyOS](https://github.com/walid-khalafi/AICompanyOS) · 1★ · MIT · C# | Alternative ecosystem *(README-only, 149-char README)* | .NET + Microsoft Agent Framework; Clean Architecture; autonomous multi-agent software company platform. | **Absent**, correctly. | **reject** | 1 | None. | `stack mismatch: .NET` · `business scope: stack island` | No meaningful README detail and a completely different ecosystem. |
| 33 | [xingzihai/crazy-pumpkin-os](https://github.com/xingzihai/crazy-pumpkin-os) · 1★ · MIT · Python | Goal-inbox software company *(README-only)* | Goal file inbox; strategist/developer/reviewer/ops roles; live web dashboard; `pip install`; interactive init. | **Already have:** fleet, task queue, dedup, gates, dashboard, PR flow. | **already covered** | 2 | No work. Its “goal inbox” is the same idea as the deferred goal board noted in Section 5, with a weaker execution path. | `license: MIT` · `stack mismatch: Python` | Conceptually duplicated by the shipped fleet. |
| 34 | [zer0-A1/N8N-Agent](https://github.com/zer0-A1/N8N-Agent) · **17★** · Python · **no licence** · stale 2025-10 | Personal administration agent *(README-only)* | Text/voice assistant for calendar, inbox, CRM, email, meetings; executive/manager/reporter agent types; workflow integrations. | **Partial:** tickets, CRM, sequences, Telegram; no personal calendar/inbox assistant. | **reject** | 1 | Demand signal only: consumer ops out-tractions company OS. | `license: no licence` · `business scope: personal/B2C` · `stale` | Highest-starred repo in the list, and still out of scope: a consumer product, not company operations. |
| 35 | [kirtidhi/job-search-os](https://github.com/kirtidhi/job-search-os) · 1★ · Python · **no licence** | Consumer job-search vertical *(README-only)* | Five-stage application pipeline; ATS scraping; tailored resume and cover letter; company research; Google Workspace sync; daily orchestrator. | **Absent**, correctly. | **reject** | 0 | None. | `license: no licence` · `business scope: B2C` · `external-provider gate: Google Workspace` | A consumer vertical with scraping at its core; no company-ops fit. |

> **Coverage check: 18 + 17 = 35 rows.** Every repository on both lists appears exactly once. All links resolve to the canonical `owner/repo` from the GraphQL response.

---

## 5. Top 5 safe build candidates

Each candidate is deliberately small and extends something that already exists. None introduces a new control plane, a new scheduler, a second database, a framework, or a desktop/mobile runtime. Order is by value-to-risk, not by ambition.

### How the 5 candidates map to the 35 rows

| Candidate | Build-candidate rows that feed it | Notes |
|---|---|---|
| **C1** Readiness & health digest | *(none — gap-fill)* rows 2, 3, 8 are `already covered` | The *mechanisms* are shipped; only the weekly **surfacing** is missing. This is a gap in our presentation, not a feature borrowed from a repo — stated plainly so it is not mistaken for new capability. |
| **C2** Mission → outcome → cost report | **Row 1** (cost per mission), **Row 7** (goal → plan), **Row 5/6** (cost/latency metrics, per-cycle cost) | Row 5 and 6 are `research-only`; only their measurement idea is used. |
| **C3** Unified approval inbox + reviewer separation | **Row 4** (owner ≠ reviewer), **Row 12** (review queue UX) | Row 12 is `research-only`; it informs the UI only. |
| **C4** Evidence corroboration | **Row 10** | The strongest single match: the verification vocabulary already exists in `evidence.ts`. |
| **C5** Company template packs | **Row 1** (6 templates / 38 roles) | Row 1 feeds both C2 and C5 — one repo, two small extractions. |
| **Row 11** Configurable ICP weights | **Row 11** | Build candidate, but **deferred to Later**: the manifest schema addition should land after C5 establishes the pack format. |

All five candidates are independently specified. **None requires reading any repository's source**, so the twelve unlicensed code repos are not a blocker for any of them.


### C1 — Weekly readiness and health digest

| | |
|---|---|
| **Inspired by** | [cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) readiness gates · [Node-Features/company-os](https://github.com/Node-Features/company-os) M&E/Finance loop · [agent-os](https://github.com/agentxagi/agent-os) monitoring |
| **User value (founder)** | One page and one email a week answering: what is configured, what actually passed a live probe, what went stale, what broke, which approvals were blocked, which breakers tripped. Ends the “is anything silently dead?” question without opening six dashboards. |
| **Smallest implementation shape** | A local-fleet script (`scripts/weekly_digest.py`) that reads the existing internal endpoints — `/capability/matrix`, `/decision/blocks`, `/ledger/summary`, `mon:last_sweep`, `cron:last_tick`, `/api/v1/connectors` — writes one `briefings` row (`kind='digest'`) and sends it with the existing Brevo sender. **No new table, no new cron entry:** gate on KV `digest:last_run` inside the existing daily maintenance gate. |
| **Existing files / surfaces to extend** | `worker/src/readiness.ts` · `worker/src/ledger.ts` · `worker/src/decisions.ts` · `worker/src/services.ts` (`brevoSend`) · `scripts/health_check.py` · `dashboard/app/(app)/briefings/page.tsx` |
| **Acceptance criteria** | Exactly one digest per 7 days; every figure cites the key or endpoint it came from; a failed read renders `unavailable` rather than a number; email lands at `support@lazynext.com`; the MCP tool `list_briefings` returns it; no writes outside `briefings`. |
| **Dependencies** | Internal bearer token, Brevo sender (live), `maint:last_run` gate (live). |
| **Risks** | **Fabricated figures** if executed by the cloud worker — that path has no D1/KV read access (house rule 12). Must run in the local fleet. Mitigation: script asserts a live read for every number and prints the source. |
| **Effort** | **S** — 1–2 days including a regression test on the formatter. |

### C2 — Mission → plan → outcome → cost report

| | |
|---|---|
| **Inspired by** | [wizard-l1](https://github.com/yongbin-lab/wizard-l1) goal → task DAG · [Node-Features/company-os](https://github.com/Node-Features/company-os) M&E/Finance · [clawcompany](https://github.com/Claw-Company/clawcompany) per-mission cost · [nexus-ai](https://github.com/piyush06singhal/nexus-ai) cost/latency metrics |
| **User value (founder)** | State a goal in plain language, get a small reviewed plan of tasks instead of one vague task — then see, for that goal: which tasks served it, which were accepted, how many retries, what they cost, and what business result followed. This is the missing “was it worth it?” line that every reference in the list advertises and none of them demonstrates with real data. |
| **Smallest implementation shape** | Two halves, both small. **(i) Plan:** a `plan_goal` MCP tool / `POST /api/v1/tasks/plan` that has Workers AI propose 3–10 tasks with `acceptance` + `deps` + `priority`, written into the **existing** `task_log` insert path as `pending` rows (the `agentTick` cron remains the only executor). **(ii) Report:** a read-only dashboard page `/outcomes` fed by `/ledger/summary` + `task_log` + `briefings`. Add one nullable `mission` text column to `task_log` (additive migration), populated from the active manifest goal at insert time. No aggregation service, no warehouse, no new scheduler. |
| **Existing files / surfaces to extend** | `worker/src/mcp.ts` (add `plan_goal` beside `create_task`) · `worker/src/index.ts` task insert path + `taskAlreadyTried` dedup · `worker/src/ledger.ts` (`summarizeLedger`, `taskLedgerRows`, `estimateCostCents`) · `dashboard/app/(app)/tasks` · `dashboard/app/api/svc/route.ts` (`READ_PATHS`) · `worker/src/openapi.ts` |
| **Acceptance criteria** | Totals reconcile with `/ledger/summary` for the same window; unknown mission renders `unassigned`, not zero; cost shown in cents + USD with the estimator named; the outcomes page is read-only; a plan never exceeds 10 tasks and never bypasses dedup (`taskAlreadyTried`); a planned task is still executed only by `agentTick`; OpenAPI route-parity test passes. |
| **Dependencies** | Ledger rows being written (live); Workers AI binding (live); task rows carrying `mission`. |
| **Risks** | Retro-tagging historical tasks is approximate — present it as “since this shipped”, not history. Avoid inventing revenue attribution: business outcome stays a manual annotation. A planner that produces plausible-but-unrunnable tasks would flood the queue — cap it, and route plans through the existing dedup so dead classes cannot respawn. |
| **Effort** | **M** — 3–4 days (planner + report). |

### C3 — Unified human approval inbox (phone-friendly PWA)

| | |
|---|---|
| **Inspired by** | [HunterOS](https://github.com/sagar300408-stack/HunterOS) review queue · [ai-company-os-github](https://github.com/Mistico06/ai-company-os-github) independent reviewer · [cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) owner approvals |
| **User value (founder)** | One list of everything waiting on a human — decision packages, flagged campaign sends, connector approvals — with approve / reject / void plus a reason, usable from a phone. Today approval state is split between the `approvals` bus channel and the Governance page. |
| **Smallest implementation shape** | Extend the existing `dashboard/app/(app)/approvals/page.tsx` to also read `/decision/packages` (already a whitelisted read path) and post the decide action through `/api/svc` with an **exact-path** allowlist entry. Reuse `decision_packages.decide`; no new store. Show expiry and target so a stale approval cannot be mistaken for a fresh one. |
| **Existing files / surfaces to extend** | `dashboard/app/(app)/approvals/page.tsx` · `dashboard/app/api/svc/route.ts` · `worker/src/decisions.ts` · `dashboard/components/Toast.tsx` · `dashboard/public/manifest.webmanifest` (already a PWA) |
| **Acceptance criteria** | Approve and void both write one `episodic_events` row (scope `decision`); a double tap cannot double-approve (`consumed`/`outcome` guard); expired packages render disabled; the allowlist regex stays exact-path so no mutating route becomes reachable by pattern; mobile viewport usable at 390px. |
| **Dependencies** | `config:decision_enforce=approval` (live), existing decide route. |
| **Risks** | Two approval mechanisms coexisting could confuse — label the bus-based ones as legacy and plan a single vocabulary. Widening `/api/svc` is the one security-sensitive step; keep it literal. |
| **Effort** | **M** — 3–5 days. |

### C4 — Evidence pipeline: claim → source → verified

| | |
|---|---|
| **Inspired by** | [CortexOS](https://github.com/DevChiniwala/CortexOS) deterministic verification · [ai-company-os-github](https://github.com/Mistico06/ai-company-os-github) `INSUFFICIENT EVIDENCE` |
| **User value (founder)** | Every claim used in outreach or a briefing shows its source URL, when it was fetched, the excerpt hash, how it was matched, and whether it is verified, inferred, or unknown. Corroboration across independent domains becomes visible. This is the difference between “our SDR said so” and “here is the page.” |
| **Smallest implementation shape** | Extend `worker/src/evidence.ts`: add `corroboration_count` and `source_domain` distinctness to the existing record shape (additive columns, migration 014), then surface it on the CRM lead detail and in briefings. The verification vocabulary (`exact`/`normalized`/`fuzzy`/`none` → `verified`/`inferred`/`unknown`) **already exists** — this is completion, not new design. |
| **Existing files / surfaces to extend** | `worker/src/evidence.ts` · `worker/src/index.ts` (`/evidence/record`, `/evidence/list`) · `GET /api/v1/crm/evidence/summary` · `dashboard/app/(app)/crm` · `dashboard/app/api/svc/route.ts` (`READ_PATHS` already permits `/crm/leads/{id}/evidence`) |
| **Acceptance criteria** | A claim with no excerpt and no hash always reads `unknown`; two sources on the same domain do **not** count as corroboration; the lead view shows disposition + method + fetched time; summary endpoint counts match the rows; no claim is rendered as `verified` on a `fuzzy` match alone. |
| **Dependencies** | Evidence capture at enrichment time (partially live). |
| **Risks** | Rows only exist where capture happened — no backfill. Do not retrofit “verified” onto old CRM notes; display coverage instead. |
| **Effort** | **M** — 3–4 days. |

### C5 — Company template packs (starter manifests)

| | |
|---|---|
| **Inspired by** | [clawcompany](https://github.com/Claw-Company/clawcompany) 6 templates / 38 roles · [auto-co-meta](https://github.com/NikitaDmitrieff/auto-co-meta) `saas`/`docs-site`/`api-backend` templates · [wizard-l1](https://github.com/yongbin-lab/wizard-l1) goal-first bootstrap |
| **User value (founder)** | Start a company shape in one step instead of hand-editing a manifest: goals, roles, connector permissions, review thresholds and schedules pre-filled for a plausible business (solo SaaS, service/agency, content-led). Activation is reversible. |
| **Smallest implementation shape** | 3 JSON packs authored as data + validated by the **existing** `validateManifest()` and activated by the existing `/manifests/activate`. Add a picker to the dashboard settings page. **Zero runtime change** — roles stay data, exactly as `manifests.ts` intends. |
| **Existing files / surfaces to extend** | `worker/src/manifests.ts` · `KV config:manifest:active` · `dashboard/app/(app)/settings/page.tsx` · `docs/` for the pack reference |
| **Acceptance criteria** | All packs pass `validateManifest` in a test; activation writes one row + KV pointer; rollback = activate previous version; no pack grants `admin` connector permission by default; every role name maps to a real agent in `agents/`, not an invented persona. |
| **Dependencies** | Manifest route (live). |
| **Risks** | **Over-promising**: a template must not imply capabilities we do not run (e.g. a “trading desk” pack). Start with shapes the fleet genuinely supports. |
| **Effort** | **S** — 1–2 days, mostly authoring + tests. |

### Evaluated but not selected

| Candidate idea | Verdict | Reason |
|---|---|---|
| **Lightweight sprint/goal board** | **Defer, fold into C2** | A board already exists (`/tasks`). Adding sprint entities creates a second planning surface beside `task_log`, which is the “second control plane” pattern we are avoiding. The `mission` tag in C2 captures the useful part. |
| **API / agent-readiness distribution** | **Do now, but it is copy, not code** | The artifacts are already live and route-parity tested (OpenAPI 3.1 with security schemes, `/mcp`, `/a2a`, `agent.json`, `llms.txt`, `/health`). The work is marketing/listing copy and a status-page badge — no engineering build. |
| **Configurable ICP weights** ([enterprise-B2B](https://github.com/SwastikSynqAI/enterprise-B2B-multimodal-agent)) | **Later** | Real value, but it needs a scoring design and a manifest schema addition; smaller and safer after C5 establishes the pack format. |
| **Tamper-evident audit chain** ([nexus-ai](https://github.com/piyush06singhal/nexus-ai)) | **Later** | A `prev_hash` chain on `episodic_events` touches the hottest write path in D1; needs its own design and backfill decision. |
| **Voice surface** ([os1-samantha](https://github.com/gagan114662/os1-samantha)) | **Never as a runtime** | Voice is a thin input over the existing widget/Telegram path at best; a desktop/Swift runtime is out of scope. |

---

## 6. LinkedIn integration plan — staged, non-deploying

**Founder's position:** LinkedIn “will be unblocked in a few days.”
**Standing rule:** no personal selfie, passport, or personal ID for company accounts. No signups opened. No unauthorized automation.
**This section deploys nothing.** It is a staged plan so that the day the provider gate opens, the company-side work is already done and reviewed.

### 6.0 Current factual state — read this first

Three findings from the operating ledger must not be lost in the optimism:

1. **The block is not an account block, it is a verification-class block.** Two case cycles (`261029-028204`, closed-unresolved twice) produced the same answer both times: the *account owner* must contact LinkedIn directly.
2. **LinkedIn’s own AI Help Assistant confirms account recovery = government ID + selfie only.** There is no published company-document path for merge/close.
3. **Therefore “unblocked in a few days” most likely means one of two things, and they are not the same:** (a) the founder completes a personal-ID step *themselves*, or (b) the founder obtains a legitimate company Page / app authorization through a supported business route. Only (b) changes anything for the platform. **This plan assumes nothing about which one, and does no work that depends on (a).**

### 6.1 (a) Company-only work that can be done now — no LinkedIn contact, no signup

All of this is internal preparation behind the existing connector abstraction. It is safe, reversible, and useful even if LinkedIn never opens.

| # | Work item | Where it lives | Why it is safe now | Acceptance criteria |
|---:|---|---|---|---|
| A1 | **Provider adapter interface** — formalize `linkedin` as a dispatch target with `capabilities`, `auth_kind`, `dry_run`, `rate_limit` declared as data | `worker/src/services.ts` `_DISPATCH` table · `core/tools/connectors.py` | Pure refactor of an existing registry; no network call | Adapter registered with `auth_kind: "oauth2_org"`, reports `configured:false` while `conn:linkedin` is empty; existing connector tests still pass |
| A2 | **Organization / page mapping** — a documented place to record *which* organization URN and page the company would post as | KV `conn:linkedin:meta` (new key, empty) + `docs/connectors/linkedin.md` | Storing an ID we already own is not a provider action | Key documented with the exact shape; no value written until a real authorized org exists |
| A3 | **OAuth callback scaffolding** — reuse the existing `connect_oauth.ts` PKCE flow, register scopes as configuration | `worker/src/connect_oauth.ts` (`/api/v1/connect/linkedin/start\|callback`) | The route already exists; adding a provider entry does not call LinkedIn | Start route returns a clear `provider_not_authorized` error (not a crash) while the gate is closed; redirect URI pinned to `https://ai-company.lazynext.com` |
| A4 | **Content approval queue** — route LinkedIn drafts through the existing decision package, not direct dispatch | `worker/src/decisions.ts` (`approval` class) + `social_posts` | Already the policy for external dispatch | A LinkedIn post cannot reach a provider without an approved, unexpired package for it; blocked attempt writes one `decision_gate` row |
| A5 | **Audit and event model** — every LinkedIn attempt (allowed, blocked, dry-run, failed) records exactly one `episodic_events` row | existing connector audit path | Reuses the current audit write | Row carries `connector:"linkedin"`, `mode: dry_run\|live`, `outcome`, and the decision package id if any |
| A6 | **Rate limits and dry-run** — per-day cap and a `dry_run` mode that produces the exact payload without a network call | `social_posts` + adapter flag | No provider contact in dry-run | Dry-run returns the rendered payload + the cap counter; cap enforced before any send attempt |
| A7 | **Copy and honesty pass** — no public claim of a “LinkedIn integration” until a real authorized post exists | marketing site, connector docs | Copy only | No listing/marketing page states LinkedIn as connected |

**Deliberately excluded from (a):** anything that requires a LinkedIn token, a LinkedIn app review, an organization admin grant, or a member data permission.

### 6.2 (b) What requires a supported LinkedIn company / app authorization path

These only become possible when LinkedIn-side authorization genuinely exists. Each needs a *supported* route — never a workaround.

| Work item | Requires | Note |
|---|---|---|
| Real dispatch to a company Page | An authorized organization URN + `w_organization_social` scope from an admin of that organization | This is the only path that posts as the company |
| `conn:linkedin` credential | The OAuth2 org token from that grant | Stored in KV as `<access_token>[:<org_id>]`, matching the documented `conn:` format |
| OAuth app registration | A LinkedIn developer app owned by the company, with the redirect URI pinned | App creation may itself require a verified company Page — so Page creation precedes app creation |
| Posting as a *member* | A member-level token | **Not** the company voice; keep it out of the company dispatch path |
| Lead/member data reads | Explicit member data permissions | Out of scope for a company OS; do not request |

**Sequencing risk to state plainly:** a verified company Page is usually a prerequisite for both app review and organization posting, and Page creation has itself been the blocked step. So (b) may be impossible until (c) is resolved — in either direction.

### 6.3 (c) What still requires founder human intervention and explicit authorization

| Item | Why it needs the founder | What the founder would have to say |
|---|---|---|
| Any personal-ID verification | Standing rule forbids it; it is a personal identity act, not a company act | An explicit, specific authorization naming LinkedIn and the document class — the platform will not ask again unless the founder raises it |
| Accepting LinkedIn’s Terms / developer agreement | Legal acceptance on behalf of the company | Confirmation that the company accepts them |
| Requesting the organization admin grant | Only an org admin can grant it | Which person is the admin, and confirmation they will grant it |
| Creating or verifying the company Page | Often identity-gated | Which route they intend to use |
| Enabling live dispatch | Money/reputation-bearing external action | Explicit go-ahead, after a dry-run output has been reviewed |

### 6.4 (d) No-go items — permanent, not staged

| No-go | Why |
|---|---|
| **Personal-ID bypass** (borrowed ID, altered document, third-party “verification service”) | Fraudulent; also the standing rule forbids personal ID outright |
| **Scraping LinkedIn** (profiles, connections, search results) | Violates their terms, risks the domain and the brand |
| **Sharing credentials** (a member's password, cookie/session reuse, “just log in as me”) | Credential sharing; destroys the audit story |
| **Unofficial automation** (browser bots driving a member session, third-party “growth” tools on a member account) | Exactly the pattern their enforcement targets; unreviewable and unauditable |
| **Purchased connections / engagement** | Reputation risk, no product value |
| **Silent re-tries after a block** | Turns one failed attempt into an enforcement signal |

### 6.5 State machine for the gate

```
CLOSED ──(A1–A7 done)──► READY (dry-run only, no provider call)
READY ──(founder authorizes a supported route)──► AUTHORIZING
AUTHORIZING ──(real org token + scope granted)──► LIVE (decision-gated dispatch)
any state ──(block / policy signal)──► CLOSED (stop, record, do not retry)
```

**Until the transition out of `READY` is explicitly authorized, the only honest public statement is: “LinkedIn is not connected.”**

---

## 7. Desktop-app ideas → platform-native equivalents

Four repositories in the list are desktop, TUI, voice, or local-VM products: [os1-samantha](https://github.com/gagan114662/os1-samantha) (Swift desktop + realtime voice), [AetherOS](https://github.com/mdsabibahamedsad/AetherOS) (Electron + TUI + CLI + gateway), [AilaAI-OS](https://github.com/grunewaldtheo9-coder/AilaAI-OS) (Gemini-driven VM), [CortexOS](https://github.com/DevChiniwala/CortexOS) (Tauri). **No desktop runtime is adopted.** Every idea that survives is re-expressed on a surface that already ships or is one thin page away.

| Desktop/TUI/voice idea | Source repo(s) | Platform-native equivalent | Status | Notes |
|---|---|---|---|---|
| One agent core across many surfaces | AetherOS, clawcompany | The platform Worker is already the single capability core; dashboard, PWA, widget, CLI, MCP, A2A are thin clients | **Already have** | This is the architecture. Preserve it; never duplicate business logic into a surface. |
| Streaming chat with visible tool cards | AetherOS · ClawCompany | Dashboard `/conversations` + widget chat; render tool/step rows from `episodic_events` | **Partial** — chat exists, step rendering is thin | Additive UI only; no new backend concept |
| Realtime voice mode | os1-samantha · AetherOS | Not built. Nearest honest equivalent is the widget/Telegram text path | **Defer / reject as runtime** | Voice would need a client-side audio runtime; out of scope. Do not claim voice. |
| Terminal dashboard (TUI) | aicompanyos · AetherOS | `scripts/lazynext_cli.py` + `wrangler tail`-style logs | **Partial** | Extend the existing CLI, not a new TUI framework |
| Cancellation semantics (“never mislabeled as success”) | AetherOS | `task_log.status` + phantom-completion veto already refuses success claims without evidence | **Already have** | The strongest shipped version of this idea is our veto gate |
| Bounded delegation / subagents | AetherOS | Fleet agents + A2A `tasks/send` | **Partial** | Depth limits would be a policy constant, not a new runtime |
| Scheduled jobs with catch-up windows | AetherOS · mindlens | Existing cron (`*/10`) + daily gates (`maint:last_run`, `seq:last_run`) | **Already have** | Adding a catch-up window is a small gate tweak, not a scheduler |
| Skills stored as files, archived not deleted | AetherOS | Prompt/role files in `agents/`; manifests hold role data | **Partial** | Archival-instead-of-delete is a good idea for role packs (C5) |
| Prompt-injection scanners | AetherOS | Not centralized | **Later** | A small scanning step before untrusted content reaches an agent is a legit future candidate; needs its own scoping |
| Local file/vault knowledge ingestion | mindlens · AetherOS | `knowledge_base/` + Vectorize `company-knowledge` + `/api/v1/knowledge/search` | **Already have** | Ingest path exists; no vault product needed |
| Offline-first local state | os1-samantha · AetherOS | PWA shell cache (`sw.js`) covers the app, scans stay network-only | **Partial, intentionally** | Offline *execution* is not a goal; offline *shell* is already shipped |
| Personal (calendar/inbox/meetings) assistant | N8N-Agent · os1-samantha | Not built, and not wanted as a consumer feature | **Reject** | Company-scoped only; the 17★ here is consumer demand, not our market |
| VM control of a real desktop | AilaAI-OS | Browser Rendering + `/render` + exec container, bounded | **Partial, deliberately bounded** | Never a general-purpose VM control plane |

**Rule for the engineering team:** if a desktop idea cannot be expressed as a Worker route, a dashboard page, a PWA view, an MCP tool, an A2A method, a widget message, or a CLI command, it is not adopted.

---

## 8. ERPNext / second-database ideas → existing stores

[cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) is built on **ERPNext + PostgreSQL + Qdrant + Temporal**; [nexus-ai](https://github.com/piyush06singhal/nexus-ai) on **156 Postgres tables + Redis**; [enterprise-B2B](https://github.com/SwastikSynqAI/enterprise-B2B-multimodal-agent) on **SQLite/Prisma**; [ai-company-os-github](https://github.com/Mistico06/ai-company-os-github) on **53 SQLite tables**. **None of these systems is imported.** The modules are mapped onto D1, KV, the bus, the ledger, and connectors — all already live.

| ERP-like module | What the reference does | Lazynext equivalent | Status | Safe candidate? |
|---|---|---|---|---|
| **Departments / org units** | ERPNext departments; `company_experiments.csv` phases; Nexus org chart | Roles exist as agent code; `company_manifests` model goals/roles/permissions as data | **Partial** | **Yes** — C5 template packs are the honest version of this |
| **Workflows / approvals** | ERPNext workflow doctypes; Temporal workflows; owner approval gates | `decision_packages` (draft→approved→executed→voided/expired) + `decisionGate()` on connector, social, campaign and signwell paths | **Already live** | Completed; only the **reviewer separation** idea (C3) remains |
| **Finance / cost** | ERPNext accounting; per-mission cost; budget anomalies | `outcome_ledger` + `ledgerSummary` + `estimateCostCents` | **Partial (live data, no view)** | **Yes** — C2 |
| **CRM / leads** | ERPNext CRM, opportunities, pipeline stages | D1 `crm_leads` with LLM qualification + statuses; evidence records | **Already live** | Enhancement only (C4 corroboration) |
| **Inventory / assets** | ERPNext stock, items, warehouses | `store_products` / `store_orders` (D1) + `media:*` KV asset store | **Partial** | **No** — there is no physical inventory; do not model one |
| **Procurement / suppliers** | ERPNext purchase orders | Absent, intentionally | **Absent** | **No** — no supplier relationship exists |
| **Projects / tasks** | ERPNext projects; Nexus tasks; agent-os Paperclip board | `task_log` + `milestones` + dashboard `/tasks` | **Already live** | Enhancement only (C2 mission tag) |
| **Support / tickets** | ERPNext tickets | `support_tickets` + inbound email → ticket + outbound reply | **Already live** | None |
| **HR / people** | 119 role packs, cognitive profiles, staffing audits | Agents + `team` page; no human HR module | **Partial / not needed** | **No** — one founder, no HR domain |
| **Audit trail** | ERPNext audit log; Nexus hash chain | `episodic_events` with `query_audit` on every write | **Already live** | Hash-chaining is **Later** (see C-list) |
| **Multi-tenancy** | Nexus `company_id` on every table | Single company by design | **Not applicable** | **No** — multi-tenant is a different product |
| **Second database** | Postgres/Redis/SQLite in every reference | D1 (relational) + KV (fast/flags) + Vectorize (semantic) | **Already live** | **Never** — no second datastore |

**Rule:** the platform has exactly one relational store (D1), one fast key-value store (KV), one vector index (Vectorize), one queue, and one bus. Any ERP idea must fit those five or it is rejected.

---

## 9. Licence and provenance policy

### 9.1 The rule

**Ideas may be reimplemented independently. Source may not be copied.** Concretely, for every repository in this document:

1. **Read the README and public documentation.** That is the evidence base here.
2. **Write the idea down in our own words**, as a requirement with acceptance criteria — never as a diff, never as a translated file, never as a renamed copy.
3. **No vendoring.** No `git clone` into this repo, no `node_modules`-style vendoring, no "we'll just adapt this file".
4. **No structure copying.** Rewriting a file line-by-line in TypeScript is a derivative work, not an independent implementation. If the shape is recognisable, it is copied.
5. **Attribute the inspiration** in the PR or design doc ("inspired by X's approach to Y") — that is honest and costs nothing.

### 9.2 Licence classes in this list

| Class | Repos | What may be done | What may not |
|---|---|---|---|
| **Permissive (12 MIT + 1 Apache-2.0)** — 13 | clawcompany, cyber-ai-team, ai-company-os-github, auto-co-meta, wizard-l1, agent-os, enterprise-B2B, mindlens, EmpireOS, os1-samantha, AICompanyOS, crazy-pumpkin-os, CortexOS (Apache-2.0) | Ideas freely; code reuse *technically* permitted with notices — but the house rule is **still ideas-only** | Copying code without the licence text + copyright notice |
| **Apache-2.0 specifically** | CortexOS | Same as above, plus patent grant and NOTICE obligations if code were ever reused | Reusing without NOTICE handling |
| **No licence file (all rights reserved)** — 12 | company-os, nexus-ai, company-ops, HunterOS, aicompanyos, aetherion-os, ujjwalredd fork, ArcOS, ServiceOS, AilaAI-OS, N8N-Agent, job-search-os | **Read the README for ideas only.** Reimplementation from the *idea*, with no reference to the source during implementation | Any copying, adaptation, vendoring, or "port" — there is no grant of rights |
| **`NOASSERTION` / needs human read** | AetherOS (MIT text + Nous Research attribution) | Read the actual `LICENSE` before reusing anything, and prefer ideas-only | Assuming it is clean MIT |
| **Archived** | applied-intuition (archived 2026-08) | Historical/market reference | Treating it as maintained or current |
| **Non-code** | api-evangelist/* (profiles), VIATREE-site (static HTML) | Quoting/describing the *market facts* they publish | Treating a profile as the company's own claims or as software |
| **Stale** | N8N-Agent (2025-10), HunterOS (2026-05), ujjwalredd (2026-02) | Historical pattern | Planning against an abandoned codebase |

\* `AetherOS` reports `NOASSERTION` in GitHub metadata; its `LICENSE` file is an MIT text with a retained Nous Research attribution clause.

### 9.3 AGPL — the specific call-out

**No repository on either list is AGPL.** The only AGPL exposure in the company is unrelated to this triage: the self-hosted `postiz@1.0.0` dependency, already dispositioned as snoozed-with-accepted-risk (run unmodified, not distributed). If a future list addition is AGPL, the rule is: **read for ideas only; never link, vendor, or run a modified copy in a distributed product** without a deliberate licence decision.

### 9.4 What "learn safely" means for the unlicensed repos

| Safe | Unsafe |
|---|---|
| Reading the README's feature list and writing an independent requirement | Opening the source and translating functions |
| Describing a concept in a design doc ("separate observer agent") | Copying prompts, schemas, or SQL verbatim |
| Inspecting behaviour the README documents | Reproducing a directory layout |
| Naming the repo as inspiration | Claiming compatibility or derivation |

### 9.5 Provenance of this document

Every metadata value here came from the GitHub API on 2026-11-05. Every feature claim is sourced to a README string, and rows marked `README-only` have no deeper verification. **No source file from any repository was read to produce this triage.** Where a README claim looked implausible (e.g. "1192 tests", "156 tables"), it is reported as the repo's claim, not as verified fact.

---

## 10. Reject / park list

### 10.1 Permanent rejects (house rules — do not revisit)

| Item | Repos | Why |
|---|---|---|
| **Blockchain / USDC / Solana payments** | [ArcOS](https://github.com/BigRaj01/ArcOS), [aetherion-os](https://github.com/KOSASIH/aetherion-os) | Standing rule: no blockchain, no crypto payments. Note the distinction: **ordinary fiat payment ideas remain allowed** — Dodo stays in test mode, Stripe-adjacent flows stay as they are. The rejection is the chain, not payments. |
| **Personal-ID / LinkedIn bypass** | (none needed — policy) | A personal ID or selfie is never used for a company account, and no bypass method is acceptable. See Section 6.4. |
| **Desktop runtime** | [os1-samantha](https://github.com/gagan114662/os1-samantha), [AetherOS](https://github.com/mdsabibahamedsad/AetherOS), [AilaAI-OS](https://github.com/grunewaldtheo9-coder/AilaAI-OS), [CortexOS](https://github.com/DevChiniwala/CortexOS) | Cloudflare-first; no Electron/Tauri/Swift product surface |
| **Second control plane / second database** | [nexus-ai](https://github.com/piyush06singhal/nexus-ai), [company-os](https://github.com/Node-Features/company-os), [ServiceOS](https://github.com/ChaitanyaJoshi1769/ServiceOS) | One D1, one KV, one Vectorize, one queue, one scheduler (`*/10` cron) |
| **ERPNext / general ERP** | [cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) (as a dependency) | Section 8: modules mapped, system not adopted |
| **Paid listings / paid signups** | — | No paid directory placement, no paid review skips (same rule as AlternativeTo / directree) |
| **Native apps (iOS/Android/desktop)** | [os1-samantha](https://github.com/gagan114662/os1-samantha) | PWA is the distribution channel |
| **Consumer / B2C verticals** | [N8N-Agent](https://github.com/zer0-A1/N8N-Agent), [job-search-os](https://github.com/kirtidhi/job-search-os), [mindlens](https://github.com/kevin91nl/mindlens) (holding-company scope) | Company-scoped product only |
| **Vertical physical-AI markets** | [pango](https://github.com/api-evangelist/pango), [junaai](https://github.com/api-evangelist/junaai), [ai-build](https://github.com/api-evangelist/ai-build), [arx](https://github.com/api-evangelist/arx), [applied-intuition](https://github.com/api-evangelist/applied-intuition) | No domain assets; entering one is a new product |
| **Scraping as a data source** | [job-search-os](https://github.com/kirtidhi/job-search-os), [enterprise-B2B](https://github.com/SwastikSynqAI/enterprise-B2B-multimodal-agent) (LinkedIn) | Terms-of-service risk to the brand |

### 10.2 "Already shipped" — do not rebuild

| Idea | Repo(s) that inspired it | Already live as |
|---|---|---|
| Governance with authority classes & approvals | cyber-ai-team, company-os, ai-company-os-github | `worker/src/decisions.ts` + `/decision/packages` + `config:decision_enforce=approval` |
| Observer / independent critique | cyber-ai-team | `observer.ts` + `core/tools/observer.py` (observe-only, never blocks) |
| Outbound circuit breakers | agent-os | `breakers.ts` + `outbound_breakers.py`, mode `active` |
| Readiness / capability matrix | cyber-ai-team, ai-company-os-github | `readiness.ts` + `/capability/matrix` + `/governance` |
| Outcome & cost ledger | clawcompany, company-os, nexus-ai | `ledger.ts` + `/ledger/summary` |
| Declarative company manifest | clawcompany, auto-co-meta | `manifests.ts` + `/manifests/validate\|activate` |
| Task dedup + dead corpus | company-os | `DEAD_CORPUS_WHERE` in `worker/src/index.ts` + `cto_agent` mirror |
| Evidence verification vocabulary | CortexOS | `evidence.ts` (`exact`/`normalized`/`fuzzy`/`none` → `verified`/`inferred`/`unknown`) |
| Agent surfaces (MCP / A2A / agent.json / llms.txt) | arx, pango | `/mcp`, `/a2a`, `/.well-known/agent.json`, `llms.txt` |
| Mission/authority framing | company-os | `AGENTS.md` + `.cursor/rules` + decision packages |

### 10.3 Parked (revisit only on a trigger)

| Item | Trigger to revisit |
|---|---|
| LinkedIn company posting | Founder authorizes a **supported** company authorization route (Section 6.5) |
| Configurable ICP weights | After C5 template packs land |
| Tamper-evident audit chain | After a dedicated design note on `episodic_events` write cost |
| Prompt-injection scanning for agent inputs | When an untrusted-content ingestion path is built |
| Multi-company / holding-company view | Only if a second real company entity exists |
| Voice input | Only if a client-side audio path becomes acceptable |

---

## 11. Roadmap

**Now** = start this week, no new architecture. **Next** = after Now lands. **Later** = needs a design note first. **Never** = decided, do not revisit.

| Item | When | Owner | Acceptance criteria | Founder approval? |
|---|---|---|---|---|
| **C1** Weekly readiness/health digest | **Now** | Fleet/ops | One digest per 7 days; every figure cites its source; unreadable values render `unavailable`; lands in `briefings` + email | No — internal read-only reporting |
| **C5** Company template packs (3 packs) | **Now** | Platform | All packs pass `validateManifest`; activation reversible; no `admin` connector permission by default | No — but pack *names/content* reviewed before activation |
| **Agent-readiness copy + badge** | **Now** | Marketing/positioning | Artifacts linked from site + status; no claim beyond what is live | No — copy-only, no new claims |
| **C4** Evidence pipeline completion | **Next** | Platform | Corroboration needs distinct domains; `unknown` when unanchored; lead view shows method + fetched time | No |
| **C2** Mission → outcome → cost report | **Next** | Platform + fleet | Totals reconcile with `/ledger/summary`; `unassigned` never counted as zero cost; read-only page | No |
| **C3** Unified approval inbox | **Next** | Dashboard | Double-tap cannot double-approve; expired packages disabled; `/api/svc` stays exact-path | **Yes** — it touches the approval surface and the proxy allowlist |
| **Configurable ICP weights** | **Later** | Platform | Weights validated in the manifest; scoring reproducible from stored weights | No |
| **Tamper-evident audit chain** | **Later** | Platform | `prev_hash` chain verifies; write-cost impact measured before enabling | **Yes** — touches the hottest D1 write path |
| **Prompt-injection scan step** | **Later** | Platform | Scans before untrusted content enters an agent prompt; findings recorded, not silently dropped | No |
| **LinkedIn A1–A7 preparation** | **Now** (internal only) | Platform | Dry-run produces payload without network; blocked attempts write one audit row; no public “connected” claim | **Yes** for any step that contacts LinkedIn |
| **LinkedIn live dispatch** | **Later — gated** | Founder | Only after a supported company authorization path exists and dry-run output is reviewed | **Yes — explicit, specific** |
| **Blockchain / Solana payments** | **Never** | — | — | Decided (house rule) |
| **Desktop / Electron / Tauri / Swift runtime** | **Never** | — | — | Decided |
| **Second database / control plane / ERPNext** | **Never** | — | — | Decided |
| **Native iOS/Android apps** | **Never** | — | — | Decided (PWA ships) |
| **Personal-ID / LinkedIn bypass / scraping** | **Never** | — | — | Decided (standing rule) |
| **Paid directory listings or review skips** | **Never** | — | — | Decided |

### Suggested order and why

1. **C1 then C5** — both are small, both are pure additive use of shipped routes, and together they give the founder a weekly honest picture plus a faster way to start a company shape. Neither can break production.
2. **C4** — the only candidate that closes a *product* gap (trustworthy outreach) rather than an internal-convenience gap. It is also the cheapest because the vocabulary already exists in `evidence.ts`.
3. **C2** — depends on nothing, but is more useful once C1 has established the digest habit.
4. **C3** — highest user value of the five, but it is the only one that changes how approvals behave, so it needs a founder decision and a careful allowlist change.
5. **LinkedIn A1–A7** — do the internal preparation now so the gate opening is a one-day switch, not a two-week project. Expect nothing to change until the founder resolves the provider side.

---

## 12. Blockers, limits and what this document does not claim

### Blockers

| Blocker | Owner | Effect |
|---|---|---|
| **LinkedIn verification is personal-ID class** | Founder | Any real LinkedIn posting is blocked until a *supported company* authorization path exists. Section 6 is preparation only. |
| **No licence on 12 code repos** | Legal/ops (informational) | Ideas only; no code reuse. This does not block any candidate in Section 5, all of which are independently specified. |
| **Cloud worker cannot read D1/KV** | Engineering | C1 **must** run in the local fleet. A worker-executed digest would fabricate figures (this exact failure happened on 2026-11-03). |
| **`/api/svc` is a security boundary** | Engineering | C3 requires a literal allowlist entry, never a pattern that can reach a mutating route. |
| **README-only evidence** | Research | Maturity claims from these repos are unverified. Do not cite them as benchmarks. |

### What this document does not claim

- It does **not** claim any repository is production-ready, well-tested, or safe to depend on — only what its README says.
- It does **not** claim Lazynext is missing nothing; it claims that **these 35 repositories** offer only 5 buildable ideas.
- It does **not** recommend copying code from any repository, including the permissively licensed ones.
- It does **not** assert that LinkedIn will unblock; it prepares for either outcome.
- It does **not** change code, deploy anything, or touch any external account.

### Verification performed

| Check | Result |
|---|---|
| List membership via authenticated GraphQL | 18 + 17 = 35 |
| Total table rows | 35 |
| Unique repo keys | 35 |
| Duplicate rows | 0 |
| Row numbering 1–35 continuous | Yes |
| Disposition counts match Section 2 | 5 build / 14 research / 4 already / 12 reject |
| Fit-score counts match Section 2 | 2·5★ / 3·4★ / 9·3★ / 7·2★ / 8·1★ / 6·0★ |
| Every row has a Markdown link | Yes |
| Every row marks `README-only` / `NO README` | Yes |
| Code, product files, external accounts touched | None |

---

*Docs-only research artifact. Prepared 2026-11-05 on branch `feat/full-idea-triage-map`. No merge.*
