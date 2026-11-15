// Governance read models — the shapes returned by the platform's read-only
// governance surfaces. The dashboard never writes them: every fetch below goes
// through /api/svc's GET whitelist, which is the only place the token split
// (lzk_ read key vs internal bearer) is decided.

export interface BreakerPolicy {
  enabled: number;
  volume_limit: number;
  volume_window_ms: number;
  failure_limit: number;
  failure_window_ms: number;
  error_rate_limit: number;
  error_rate_window_ms: number;
  deliverability_limit: number;
  deliverability_window_ms: number;
  tripped_reason: string | null;
  tripped_at: string | null;
  updated_at?: string;
}

export interface BreakerStats {
  total: number;
  failed: number;
}

export interface BreakerTrip {
  id: number;
  payload: string;
  created_at: string;
}

export interface BreakersResponse {
  policy?: BreakerPolicy;
  stats?: Record<string, BreakerStats | null>;
  trips?: BreakerTrip[];
}

export type CapabilityState =
  | "probe-ok"
  | "probe-failed"
  | "stale"
  | "configured-unprobed"
  | "documented-only"
  | "absent";

export interface CapabilityRow {
  capability: string;
  documented: boolean;
  configured: boolean;
  probe_supported: boolean;
  last_probe_at: string | null;
  last_probe_ok: number | null;
  last_error: string | null;
  keystore: string | null;
  state: CapabilityState;
}

export interface ReadinessService {
  key: string;
  label: string;
  at: string | null;
  age_ms: number | null;
  stale: boolean;
  present: boolean;
}

export interface ReadinessResponse {
  generated_at?: string;
  summary?: Record<string, number>;
  connectors?: CapabilityRow[];
  services?: ReadinessService[];
}

export interface DecisionPackage {
  id: number;
  title: string;
  objective: string | null;
  proposed_action: string | null;
  authority: "auto" | "approval" | "human_only";
  evidence: string;
  cost_projection_cents: number;
  target: string | null;
  expiry_at: string | null;
  decided_by: string | null;
  outcome: string;
  rollback: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DecisionsResponse {
  packages?: DecisionPackage[];
}

export interface EvidenceCount {
  disposition: string;
  count: number;
}

export interface EvidenceSummaryResponse {
  summary?: EvidenceCount[];
}

export interface LeadEvidenceRow {
  id: number;
  lead_id: number;
  claim: string;
  source_url: string | null;
  fetched_at: string;
  evidence_excerpt: string | null;
  evidence_hash: string | null;
  verification_method: string;
  confidence: number;
  provider: string | null;
  disposition: string;
  created_at: string;
}

export interface LeadEvidenceResponse {
  lead_id?: number;
  summary?: { verified: number; inferred: number; unknown: number };
  evidence?: LeadEvidenceRow[];
}

interface ErrorBody {
  error?: string;
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as ErrorBody).error;
    if (typeof message === "string" && message) return message;
  }
  return `HTTP ${status}`;
}

/** Read one governance path through the dashboard's exact-match proxy. */
export async function govGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/svc?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || data == null) throw new Error(errorMessage(data, res.status));
  return data as T;
}

/** POST through the same proxy — only paths on the svc INTERNAL_WRITE / ALLOWED lists. */
export async function govPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch("/api/svc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, body, method: "POST" }),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || data == null) throw new Error(errorMessage(data, res.status));
  return data as T;
}

// —— C2 mission roll-up (GET /report/mission/:taskId) ————————————————————

export interface MissionTask {
  task_id: string;
  agent_id: string | null;
  description: string | null;
  status: string | null;
  attempts: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface MissionPackageRow {
  id: number;
  title: string | null;
  objective: string | null;
  proposed_action: string | null;
  authority: string | null;
  outcome: string | null;
  decided_by: string | null;
  target: string | null;
  expiry_at: string | null;
  cost_projection_cents: number | null;
  executed_task_id: string | null;
  link: "package_direct";
  link_confidence: "exact";
  created_at: string | null;
  updated_at: string | null;
}

export interface MissionLedgerRow {
  id: number;
  ref_type: string;
  ref_id: string;
  agent_id: string | null;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  retries: number | null;
  est_cost_cents: number | null;
  acceptance: string | null;
  downstream_note: string | null;
  dedupe_key: string | null;
  created_at: string | null;
  link: "task_direct" | "package_target";
  link_confidence: "exact" | "derived";
}

export interface MissionTotals {
  row_count: number;
  duration_ms: number | null;
  retries: number | null;
  est_cost_cents: number | null;
  cost_kind: "estimated";
  cost_derivation: string;
  acceptance: {
    passed: number;
    failed: number;
    na: number;
    pass_rate: number | null;
  } | null;
}

export interface MissionReport {
  task_id: string;
  generated_at: string;
  task: MissionTask;
  grouping: {
    method: "derived";
    lineage: { available: false; column: null; reason: string };
    rules: string[];
  };
  decision_packages: MissionPackageRow[] | null;
  ledger_rows: MissionLedgerRow[];
  totals: MissionTotals;
}

// —— C5 template packs (GET /templates, POST /manifests/validate|activate) ——

export interface TemplatePackSummary {
  name: string;
  description: string;
  version: number;
  body?: Record<string, unknown>;
}

export interface TemplatesResponse {
  packs?: TemplatePackSummary[];
}

export interface ActiveManifestRow {
  id: number;
  name: string;
  version: number;
  body?: string;
  valid: number;
  activated: number;
  created_at: string;
}

export interface LatestManifestResponse {
  active: ActiveManifestRow | null;
}

export interface ManifestValidateResponse {
  ok: boolean;
  name: string;
  version: number;
  valid: boolean;
  errors: string[];
  stored: boolean;
  activated: boolean;
  note?: string;
}

export interface ManifestActivateResponse {
  ok: boolean;
  name: string;
  version: number;
  intent_surface?: string;
  pointer?: Record<string, unknown>;
  error?: string;
}

/** One `episodic_events` row, scope `decision_gate` — payload is a JSON string. */
export interface GateBlock {
  id: number;
  payload: string;
  created_at: string;
}

export interface GateBlocksResponse {
  blocks?: GateBlock[];
}
