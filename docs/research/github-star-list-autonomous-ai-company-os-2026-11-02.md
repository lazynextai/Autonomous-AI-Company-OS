# GitHub Star List Review: Autonomous AI Company OS

**Reviewed:** 2026-11-02 (IST)  
**List:** https://github.com/stars/lazynextai/lists/autonomous-ai-company-os  
**Source:** GitHub GraphQL API via authenticated `gh` CLI  
**Scope:** All 51 list items; repository metadata, README-level review of the highest-signal projects, lifecycle and duplication audit.  
**Safety:** No stars, list entries, repositories, issues, or GitHub settings were changed.

## Executive assessment

This is a broad discovery list rather than a ready-made dependency shortlist. It contains 51 repositories, but the strongest practical signal is concentrated in a small group:

- **Governed execution and organization semantics:** `Node-Features/company-os`, `Hyper-AI-Lab/cyber-ai-team`, `Mistico06/ai-company-os-github`, `piyush06singhal/nexus-ai`.
- **Low-overhead autonomous loops:** `NikitaDmitrieff/auto-co-meta`, `yongbin-lab/wizard-l1`, `agentxagi/agent-os`, `itsPremkumar/company-ops`.
- **Memory, roles, templates, and operator UX:** `Claw-Company/clawcompany`, `mdsabibahamedsad/AetherOS`, `lora-sys/aicompanyos`.
- **Evidence-first sales/research:** `DevChiniwala/CortexOS`, `SwastikSynqAI/enterprise-B2B-multimodal-agent`, `sagar300408-stack/HunterOS`.
- **Market intelligence rather than reusable code:** the seven `api-evangelist/*` profiles.

The list is valuable as a living research corpus, but it should not be treated as a dependency backlog. Most projects are prototypes, pre-alpha systems, concept repositories, or alternate stacks (Python/Postgres/Docker/Solana/Desktop) that do not fit Lazynext’s Cloudflare-first production architecture.

## Counts and triage

| Classification | Count | Meaning |
|---|---:|---|
| **Core-relevant** | 18 | Directly informs Lazynext’s agent runtime, governance, memory, operations, research, or growth work. |
| **Adjacent / research** | 16 | Useful patterns or competitive intelligence, but not a direct implementation candidate. |
| **Low-signal / weak fit** | 17 | Empty, tiny, stale, duplicate, archived, profile-only, or insufficiently documented for roadmap use. |
| **Prune candidates** | 16 | Recommended for removal from this list after human review; recommendations are non-destructive and not executed. |
| **Archived repositories** | 1 | `api-evangelist/applied-intuition`. |
| **Zero-byte repositories** | 4 | `EmpGrip/EmpGrip`, `HamzaBasar/Hamza-ai-business-os`, `anshurishabh/AI-Autonomous-Company-OS`, `willchen48/ASCO-AI-Software-Company-OS`. |
| **Self/provenance repositories** | 2 | `lazynextai/Autonomous-AI-Company-OS` and `ujjwalredd/Autonomous-AI-Company-Operating-System`. |
| **API Evangelist profile repositories** | 7 | Public API/company profiles, not software implementations. |

> Counts are analyst classifications, not GitHub labels. A “prune candidate” can still be worth retaining as historical context.

## Complete inventory of all 51 items

### Core-relevant (18)

| Repository | Observed signal | Lazynext relevance |
|---|---|---|
| [Claw-Company/clawcompany](https://github.com/Claw-Company/clawcompany) | 489 stars; MIT; TypeScript; 38 roles, 6 templates, 4-layer memory, 9 tools, `npx` onboarding. | **High.** Study role/template packaging, compressed company memory, provider routing, exportable reports, and low-friction onboarding. Its maintenance has slowed while the team focuses on a closed-source sibling, so borrow patterns rather than depend on it. |
| [Node-Features/company-os](https://github.com/Node-Features/company-os) | 2 stars; Go; active; pre-alpha organization runtime. | **High.** Strongest conceptual reference for mission → governance → objectives → departments → workflows → capabilities → evidence. Study authority classes, durable state, evaluation/finance feedback, provider-independent routing, and feature provenance. |
| [Hyper-AI-Lab/cyber-ai-team](https://github.com/Hyper-AI-Lab/cyber-ai-team) | 19 stars; MIT; Python; active; ERPNext/Postgres/Qdrant/Temporal; A2A/MCP direction. | **High, architectural only.** Study governor/observer separation, owner approvals, readiness evidence, replay protection, canonical records, backups, and FOSS-first resource policy. Do not import its Docker-heavy stack into Lazynext. |
| [Mistico06/ai-company-os-github](https://github.com/Mistico06/ai-company-os-github) | 1 star; MIT; 119 role packs, 23-phase SOP, 13 gates, SQLite evidence model. | **High.** Excellent governance and “observed behaviour beats declared capability” framing. Study independent reviewers, phase gates, evidence/provenance, drills, staffing audits, and explicit insufficiency states. Treat maturity claims as intentionally limited: most roles are untested. |
| [piyush06singhal/nexus-ai](https://github.com/piyush06singhal/nexus-ai) | 1 star; full-stack; 156 tables; approvals, recovery, audit, KPIs, marketplace; large test suite claimed. | **High, comparative.** Study typed execution lifecycle, bounded recovery, multi-tenant company records, mock provider, audit hash chains, kill switch, and approval gates. Keep a watch on operational complexity and verify claims before adopting ideas. |
| [NikitaDmitrieff/auto-co-meta](https://github.com/NikitaDmitrieff/auto-co-meta) | 52 stars; MIT; TypeScript; 14-agent Claude Code loop; Git/Markdown state; templates; safety limits. | **High.** Study the deliberately thin harness, consensus relay baton, cycle history/cost reporting, human escalation cadence, template bootstrap, and explicit no-delete/no-spend limits. Lazynext already has a more durable fleet; use this as a simplicity benchmark. |
| [yongbin-lab/wizard-l1](https://github.com/yongbin-lab/wizard-l1) | 2 stars; MIT; 468-line Python CLI; DAG, confirmation gates, heartbeat JSONL. | **High for design review.** Study minimal goal-to-DAG decomposition, dependency ordering, confirmation metadata, append-only transitions, mock mode, and explicit v0 gaps. Good reference for a small task-state fixture, not a new runtime. |
| [agentxagi/agent-os](https://github.com/agentxagi/agent-os) | 2 stars; MIT; circuit breakers, sprint creation, Paperclip board, quality gates, 15-minute monitoring. | **High for operations.** Study independent content/engagement/growth breakers, stale-task reassignment, retry/escalation states, and quality gates. Lazynext’s social scheduler and dead-corpus protections are better grounded; compare semantics rather than copy. |
| [itsPremkumar/company-ops](https://github.com/itsPremkumar/company-ops) | 1 star; self-contained Python; constitution + confidence-gated loop + self-improvement log. | **High for governance.** Study a compact constitution, confidence threshold, escalation, and self-improvement trail. This maps well to Lazynext’s existing safety rules and could inform a concise operator-facing policy artifact. |
| [DevChiniwala/CortexOS](https://github.com/DevChiniwala/CortexOS) | 3 stars; Apache-2.0; TypeScript/Rust/Tauri; evidence-backed GTM and deterministic claim verification. | **High for Sales/Research.** Study source-grounded claims, exact/normalized/fuzzy verification tiers, corroboration across independent sources, and visible evidence links. This is a direct roadmap signal for CRM enrichment quality and outreach trust. |
| [SwastikSynqAI/enterprise-B2B-multimodal-agent](https://github.com/SwastikSynqAI/enterprise-B2B-multimodal-agent) | 2 stars; MIT; TypeScript; LangGraph/Prisma; signal ingestion → prediction → outreach → GTM → monitoring. | **High for growth research.** Study configurable ICP/signal weights, prediction types, engine schedules, provider configuration, and super-agent optimization. Avoid LinkedIn automation and credential-heavy assumptions; Lazynext’s native LinkedIn gate is closed. |
| [sagar300408-stack/HunterOS](https://github.com/sagar300408-stack/HunterOS) | 2 stars; Python; AI SDR focused; last push 2026-05-15. | **Medium-high.** Study lead discovery, pain-point extraction, personalized outreach, and pipeline stages. Stale and API-dependent; use as competitive/UX research only. |
| [lora-sys/aicompanyos](https://github.com/lora-sys/aicompanyos) | 5 stars; concept-oriented autonomous organization. | **Medium-high.** Useful for framing agents owning P&L and end-to-end company responsibilities. No clear implementation maturity; retain as product-positioning research, not code. |
| [KOSASIH/aetherion-os](https://github.com/KOSASIH/aetherion-os) | 13 stars; 1 fork; TypeScript; “one prompt = one company”; Solana/7-agent model. | **Medium.** Study concise company bootstrap and autonomous role positioning. Blockchain/payment assumptions are out of Lazynext scope; do not add a chain integration. |
| [mdsabibahamedsad/AetherOS](https://github.com/mdsabibahamedsad/AetherOS) | 2 stars; very large Python repo; desktop/TUI/CLI/gateway; memory, skills, cron, delegation, approvals. | **Medium-high for operator UX.** Study one agent core across surfaces, skill curation without deletion, bounded delegation, scheduled jobs, cancellation semantics, prompt-injection defenses, and permissions. Do not adopt the desktop stack. |
| [kevin91nl/mindlens](https://github.com/kevin91nl/mindlens) | 1 star; MIT; holding-company OS / knowledge pipelines / self-improving agents. | **Medium.** Potential inspiration for company-wide knowledge and holding-company views; README-level evidence is limited. |
| [NEXUS predecessor / ujjwalredd/Autonomous-AI-Company-Operating-System](https://github.com/ujjwalredd/Autonomous-AI-Company-Operating-System) | 8 stars; Python; older provenance fork, last push 2026-02-20. | **Context only but retain.** Useful historical comparison for the project’s origin and imported Devin work. It is not the canonical Lazynext repository and should not be used as implementation guidance over current code. |
| [lazynextai/Autonomous-AI-Company-OS](https://github.com/lazynextai/Autonomous-AI-Company-OS) | 1 star; current Lazynext repository; TypeScript; Cloudflare Workers/D1; pushed 2026-11-01. | **Keep.** This is the canonical project record and should remain in the list as a self-reference. |

### Adjacent / research (16)

| Repository | Observed signal | Recommendation/use |
|---|---|---|
| [api-evangelist/pango](https://github.com/api-evangelist/pango) | Public API profile for an AI logistics/agentic OS; no software. | Keep only if the list is also a market-intelligence notebook; mine API discoverability, agent-readiness, and logistics positioning. |
| [api-evangelist/junaai](https://github.com/api-evangelist/junaai) | Public profile for industrial factory OS. | Market/positioning research; useful comparison for industrial autonomy, not a dependency. |
| [api-evangelist/ai-build](https://github.com/api-evangelist/ai-build) | Public profile for additive-manufacturing AI OS. | Market research on computer-use agents and vertical workflows. |
| [api-evangelist/absurd](https://github.com/api-evangelist/absurd) | Public profile for AI video creative OS. | Market research for autonomous content/marketing workflows. |
| [api-evangelist/arx](https://github.com/api-evangelist/arx) | Public profile for defense robotics autonomy. | Peripheral physical-AI/robotics market intelligence; no product fit. |
| [api-evangelist/alphabet](https://github.com/api-evangelist/alphabet) | Public profile of a large technology company/API surface. | Broad ecosystem research only; not specific to Lazynext. |
| [api-evangelist/applied-intuition](https://github.com/api-evangelist/applied-intuition) | Archived public profile for autonomous vehicle infrastructure. | Historical physical-AI comparison; archived, low current value. |
| [Zenieverse/EmpireOS](https://github.com/Zenieverse/EmpireOS) | 2 stars; MIT; Notion-centered company OS. | Study human decisions captured in a workspace and agent execution from that record; likely duplicate with stronger references. |
| [Eginn-33/VIATREE-site](https://github.com/Eginn-33/VIATREE-site) | 3 stars; static site for 7-department/27-agent OS; active site. | Positioning and department taxonomy research; little implementation evidence. |
| [BigRaj01/ArcOS](https://github.com/BigRaj01/ArcOS) | TypeScript; autonomous agents paying each other in USDC/Arc; Vercel demo. | Interesting economic-agent concept, but payments/blockchain are explicitly out of current Lazynext scope. |
| [ChaitanyaJoshi1769/ServiceOS](https://github.com/ChaitanyaJoshi1769/ServiceOS) | TypeScript; service-company OS; last push 2026-06-19. | Keep as a service-business positioning reference only; insufficient technical evidence. |
| [gagan114662/os1-samantha](https://github.com/gagan114662/os1-samantha) | 19.5MB Swift desktop/voice office fork. | Desktop assistant research; not compatible with Cloudflare-first product. |
| [grunewaldtheo9-coder/AilaAI-OS](https://github.com/grunewaldtheo9-coder/AilaAI-OS) | JavaScript; Gemini-controlled secure Linux VM. | Computer-use/VM-control concept; security and infrastructure mismatch. |
| [walid-khalafi/AICompanyOS](https://github.com/walid-khalafi/AICompanyOS) | MIT; C#/.NET; enterprise multi-agent platform. | Alternative ecosystem reference; no direct stack fit. |
| [xingzihai/crazy-pumpkin-os](https://github.com/xingzihai/crazy-pumpkin-os) | MIT; Python; install/configure AI software company; no issues enabled. | Small conceptual reference; low evidence and low activity. |
| [zer0-A1/N8N-Agent](https://github.com/zer0-A1/N8N-Agent) | 17 stars; Python; calendar/email/CRM/teams agent; last push 2025-10-17. | Study workflow integration positioning, but stale and potentially platform-policy-sensitive. Do not use as a connector blueprint. |

### Low-signal / weak-fit (17)

| Repository | Reason for low signal | Action |
|---|---|---|
| [EmpGrip/EmpGrip](https://github.com/EmpGrip/EmpGrip) | Zero-byte repository; no language/license/implementation signal. | Prune candidate. |
| [HamzaBasar/Hamza-ai-business-os](https://github.com/HamzaBasar/Hamza-ai-business-os) | Zero-byte repository; no implementation signal. | Prune candidate. |
| [anshurishabh/AI-Autonomous-Company-OS](https://github.com/anshurishabh/AI-Autonomous-Company-OS) | Zero-byte repository; no description. | Prune candidate. |
| [willchen48/ASCO-AI-Software-Company-OS](https://github.com/willchen48/ASCO-AI-Software-Company-OS) | Zero-byte repository; no implementation signal. | Prune candidate. |
| [vermadhruv174-svg/ai-software-company-os](https://github.com/vermadhruv174-svg/ai-software-company-os) | 2KB; one star; minimal metadata. | Prune candidate unless retained as a concept bookmark. |
| [jasdy43/ai-city-os](https://github.com/jasdy43/ai-city-os) | 2KB; one star; TypeScript but no meaningful evidence. | Prune candidate. |
| [agentboard-live](https://github.com/TickyPrincess/agentboard-live) | Tiny 95KB repository; one star; last push 2026-03-28. | Prune candidate; no current roadmap signal found. |
| [mohsinshahzad4142/ai-company-os](https://github.com/mohsinshahzad4142/ai-company-os) | 116KB; README presents telemetry/dashboard claims but little verifiable implementation context. | Prune candidate. |
| [shajindi-gif/ai-os](https://github.com/shajindi-gif/ai-os) | 22KB; one star; limited README/implementation signal. | Prune candidate. |
| [overandor/membra-company-os](https://github.com/overandor/membra-company-os) | 418MB monorepo dominated by unrelated trading/blockchain material; no clear focused company OS boundary. | Prune candidate; retain `membra-companyos-v2` only if comparison is needed. |
| [overandor/membra-companyos-v2](https://github.com/overandor/membra-companyos-v2) | 195MB; duplicated Membra ecosystem; broad/unfocused. | Prune candidate or consolidate to one Membra reference. |
| [kirtidhi/job-search-os](https://github.com/kirtidhi/job-search-os) | Job-search vertical, not company operations; last push 2026-06-28. | Prune candidate unless vertical-agent examples are desired. |
| [lightofeternallifes-star/project-forge-revenue-os](https://github.com/lightofeternallifes-star/project-forge-revenue-os) | HTML/marketing-like repository with limited implementation evidence. | Prune candidate. |
| [L0Rd5/alexi-agents](https://github.com/L0Rd5/alexi-agents) | Python multi-agent OS concept; low stars and limited metadata. | Prune candidate unless tri-tier memory is specifically being researched. |
| [Nikapeace/joycore-os](https://github.com/Nikapeace/joycore-os) | 2 stars; MIT; small TypeScript prototype; last push 2026-06-22. | Prune candidate; overlap with stronger company-OS references and limited evidence. |
| [kevinpsj0/bot-labs-inc](https://github.com/kevinpsj0/bot-labs-inc) | 1 star; tiny repository; no retrievable README in the API review. | Prune candidate; insufficient evidence to justify retention. |
| [ufuksamet0/autonomous-company-os](https://github.com/ufuksamet0/autonomous-company-os) | 1 star; Apache-2.0; TypeScript; 10.7MB; last push 2026-08-30. | Adjacent reference at best; prune if the list is limited to high-signal implementation research. |

> `itsPremkumar/company-ops`, `KOSASIH/aetherion-os`, and `lora-sys/aicompanyos` appear in more than one analytical bucket because they are either useful for a narrow idea or weak as implementation references. The final action should follow the purpose of the list.

## Useful takeaways for Lazynext

### 1. Make governance an explicit, inspectable layer
The strongest references begin with the organization and authority model rather than with a collection of agents. Useful patterns:

- Mission, policies, objectives, departments, workflows, capabilities, and results as separate concepts (`Node-Features/company-os`).
- Automatic / approval-required / human-only authority classes (`Node-Features/company-os`).
- Independent observer/critic that can veto weak evidence, prompt injection, policy violations, or goal drift (`Hyper-AI-Lab/cyber-ai-team`).
- Independent owner and reviewer; phase completion requires evidence, not configuration (`Mistico06/ai-company-os-github`).
- Constitution + confidence-gated action loop (`itsPremkumar/company-ops`).

**Lazynext implication:** document these as a compact governance contract around the already-shipped task fleet, connector admin scope, approval flows, dead-corpus rules, and protected-file gates. Do not build a new governance framework or rewrite the current worker.

### 2. Strengthen evidence and provenance, especially in CRM/research
`CortexOS` offers the clearest productizable gap: every claim should retain source HTML, matching method, corroboration count, and a deterministic trust score. `Mistico06/ai-company-os-github` similarly records provider provenance and refuses to claim capabilities that were not observed.

**Lazynext implication:** roadmap a read-only evidence/provenance view for CRM enrichment and research outputs. It should expose source URLs, retrieval time, extracted claim, verification status, and provider. This aligns with existing lead qualification and avoids hallucinated outreach.

### 3. Prefer small durable loops over framework expansion
`auto-co-meta` and `wizard-l1` demonstrate that the core of an autonomous company can be a small loop plus a durable baton/DAG/log. Their useful ideas are consensus handoff, dependency-aware tasks, explicit confirmation flags, mock mode, and append-only heartbeats.

**Lazynext implication:** audit whether each new capability can be represented as a task, event, artifact, and verifiable acceptance condition using existing D1/KV/bus infrastructure. Avoid introducing LangGraph, Temporal, Postgres, or a second scheduler merely because a reference uses them.

### 4. Package roles and templates without multiplying runtime code
`ClawCompany` demonstrates the UX value of built-in roles, company templates, provider routing, compressed memory, report export, and one-command onboarding. `Mistico06` demonstrates role packs plus a small number of executable officers.

**Lazynext implication:** keep role/prompt definitions as data or documentation where possible; add a small number of tested capabilities rather than one runtime agent per persona. A future “company template” can configure goals, connector permissions, and review thresholds without forking the platform.

### 5. Add outcome/cost feedback, not only task completion
`Node-Features/company-os` explicitly closes the loop with Monitoring & Evaluation and Finance. `ClawCompany` exposes per-mission cost. `NEXUS` models token/cost/latency metrics and bounded recovery.

**Lazynext implication:** roadmap a minimal outcome ledger: task/agent/provider, input/output cost estimate, duration, retries, acceptance result, and business outcome where available. Start with existing task logs, connector audit events, scan stats, and campaign metrics; do not create a standalone analytics system.

### 6. Add circuit breakers to outbound automation
`agentxagi/agent-os` has independent content-quality, engagement-signal, and follower-growth breakers. This maps well to Lazynext’s social queue and connector dispatch.

**Lazynext implication:** add policy-level stop conditions around outbound volume, repeated provider failures, unusual response/error rates, and engagement or deliverability degradation. Keep breakers admin-visible and fail-closed for external side effects.

### 7. Keep one agent core across surfaces
`AetherOS` shows the value of one runtime behind desktop, CLI, TUI, and messaging surfaces, with shared permissions, cancellation, skills, and memory.

**Lazynext implication:** preserve the existing platform worker as the capability core and expose thin surfaces (dashboard, MCP, A2A, widget, connectors). Do not create a second desktop runtime or duplicate business logic.

## Roadmap opportunities mined from the list

These are proposals, not automatically approved tasks. They are deliberately scoped to existing Lazynext surfaces:

1. **Evidence-backed CRM enrichment (P1):** Store claim-level source URL, fetch timestamp, evidence excerpt/hash, verification method, and confidence beside prospect notes; show “verified / inferred / unknown” in the dashboard. Inspired by `CortexOS` and `Mistico06`.
2. **Governance decision package (P1):** For high-impact tasks/connectors, render objective, proposed action, authority class, evidence, cost, target, expiry, and rollback/void path in one auditable record. Inspired by `Node-Features`, `Cyber AI Team`, and `NEXUS`.
3. **Outbound circuit breakers (P1):** Add connector-specific volume/error/deliverability breakers to the existing social queue and connector audit path. Inspired by `agent-os`; no new scheduler.
4. **Outcome and cost ledger (P1):** Extend existing task/audit records with duration, retry count, provider/model, estimated spend, acceptance result, and downstream metric. Inspired by `ClawCompany`, `Node-Features`, and `NEXUS`.
5. **Company template manifests (P2):** A declarative manifest for goals, roles, connector permissions, review thresholds, and schedules; validate before activation. Inspired by `ClawCompany` and `auto-co-meta`.
6. **Independent observer pass (P2):** A bounded review step for generated task plans and external side effects; it should return evidence gaps or a safe approval recommendation, not execute. Inspired by `Cyber AI Team`.
7. **Capability/readiness matrix (P2):** Report what is configured, what has passed a live probe, what is stale, and what is merely documented. Inspired by `Mistico06` and `Cyber AI Team`.
8. **Thin goal-to-DAG experiment (P3):** A small internal experiment using existing task insertion and acceptance fields, with mock mode and no production fleet changes. Inspired by `wizard-l1`.
9. **Research/market watch digest (P3):** Keep the API Evangelist profiles and vertical-company references in a separate market-intelligence report or scheduled digest rather than mixing them with implementation stars.

### Explicit non-opportunities

Do **not** add blockchain/USDC/Solana payments, LinkedIn automation, a desktop agent runtime, a second Postgres/Docker control plane, ERPNext, or a new framework solely because starred repositories use them. They conflict with current product scope, connector gates, or Cloudflare-first architecture.

## Prune candidates (recommendation only)

No stars were removed. The following 16 entries are the clearest candidates for a future human-approved cleanup:

1. `EmpGrip/EmpGrip` — zero-byte repository, no usable metadata.
2. `HamzaBasar/Hamza-ai-business-os` — zero-byte repository, no usable metadata.
3. `anshurishabh/AI-Autonomous-Company-OS` — zero-byte repository, no description or implementation.
4. `willchen48/ASCO-AI-Software-Company-OS` — zero-byte repository, no implementation.
5. `jasdy43/ai-city-os` — 2KB/one-star placeholder with no meaningful evidence.
6. `vermadhruv174-svg/ai-software-company-os` — 2KB/one-star placeholder.
7. `TickyPrincess/agentboard-live` — tiny, stale (last push 2026-03-28), no current roadmap signal.
8. `mohsinshahzad4142/ai-company-os` — dashboard/telemetry claims but insufficient implementation evidence and low signal.
9. `shajindi-gif/ai-os` — tiny, low-signal repository with limited documentation.
10. `lightofeternallifes-star/project-forge-revenue-os` — broad revenue-OS description but little verifiable implementation signal.
11. `Nikapeace/joycore-os` — small prototype overlapping stronger company-OS references.
12. `kevinpsj0/bot-labs-inc` — tiny repository with no retrievable README and insufficient evidence.
13. `ufuksamet0/autonomous-company-os` — broad/independent OS with no differentiating signal found.
14. `overandor/membra-company-os` — 418MB broad trading/blockchain monorepo; weak company-OS focus.
15. `overandor/membra-companyos-v2` — 195MB duplicate/broad Membra ecosystem; consolidate to one reference if needed.
16. `api-evangelist/applied-intuition` — archived API profile with no reusable code; retain only for physical-AI market history.

### Conditional cleanup candidates

These are not recommended for immediate removal because each has a narrow research value: `kirtidhi/job-search-os` (vertical workflow), `KOSASIH/aetherion-os` (economic-agent concept), `L0Rd5/alexi-agents` (tri-tier memory), `zer0-A1/N8N-Agent` (workflow integration positioning), and some `api-evangelist/*` profiles. If the list’s sole purpose is implementation research, move or remove them; if it is also a market-watch list, retain them in a separate list.

## Action checklist

### Completed in this review

- [x] Authenticated with `gh` and queried the list through GitHub GraphQL.
- [x] Confirmed the list slug and **51 total items**.
- [x] Collected repository URL, description, stars, forks, archive state, language, license, topics, size, and push date.
- [x] Reviewed README content for the highest-signal architecture, governance, memory, growth, and execution references.
- [x] Identified duplicates, self/provenance entries, profile-only repositories, placeholders, stale projects, and an archived item.
- [x] Mined concrete roadmap opportunities scoped to existing Lazynext architecture.
- [x] Produced a complete 51-item inventory and non-destructive prune recommendations.
- [x] Created this report under `docs/research/`; protected product files were not edited.

### Recommended next actions

- [ ] Founder reviews the 16 prune candidates; only then remove stars/list entries manually.
- [ ] Decide whether to split the current list into **Implementation References** and **Market Intelligence**; the seven API Evangelist profiles belong in the latter.
- [ ] Convert opportunities 1–4 into narrowly scoped design proposals only after checking existing shipped capabilities and deduplication rules.
- [ ] Start with evidence-backed CRM enrichment and outbound circuit breakers; both reuse existing data paths and have clear safety value.
- [ ] Add provenance links from any future roadmap/design document back to this report and the specific source repository.
- [ ] Recheck high-value repositories quarterly for license, activity, security, and maturity changes before borrowing code or patterns.

## Blockers and limitations

- GitHub list items provide repository metadata, not proof that every README claim is production-validated; this review intentionally distinguishes claims from observed signals.
- The inventory is complete at the list-item level, but not every repository received a full source-code audit. Deep review was focused on the highest-signal candidates.
- No destructive GitHub action was taken because explicit confirmation was not provided.
