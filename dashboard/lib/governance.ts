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
