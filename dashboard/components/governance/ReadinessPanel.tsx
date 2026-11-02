"use client";

import { Card, timeAgo } from "@/components/ui";
import { Pill, type Tone } from "./Pill";
import { useGov } from "./useGov";
import type { CapabilityState, ReadinessResponse } from "@/lib/governance";
import { Activity } from "lucide-react";

const STATES: { state: CapabilityState; label: string; tone: Tone }[] = [
  { state: "probe-ok", label: "Probe ok", tone: "ok" },
  { state: "probe-failed", label: "Probe failed", tone: "bad" },
  { state: "stale", label: "Stale", tone: "warn" },
  { state: "configured-unprobed", label: "Configured, unprobed", tone: "accent" },
  { state: "documented-only", label: "Documented only", tone: "muted" },
  { state: "absent", label: "Absent", tone: "muted" },
];

const STATE_TONE: Record<CapabilityState, Tone> = {
  "probe-ok": "ok",
  "probe-failed": "bad",
  stale: "warn",
  "configured-unprobed": "accent",
  "documented-only": "muted",
  absent: "muted",
};

function age(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function ReadinessPanel() {
  const { data, error, loading } = useGov<ReadinessResponse>("/capability/matrix");
  const rows = data?.connectors ?? [];
  const services = data?.services ?? [];
  const summary = data?.summary ?? {};

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Activity className="w-4 h-4 text-accentSoft" /> Capability readiness
          </h2>
          <p className="text-xs text-muted mt-1">
            Configured vs live-probed vs stale vs merely documented. Probes are GET-only and
            throttled at 6h — <span className="text-fg/70">probe ok</span> means a live GET succeeded.
          </p>
        </div>
        {data?.generated_at && (
          <span className="text-[10px] text-muted shrink-0">built {timeAgo(data.generated_at)}</span>
        )}
      </div>

      {error && <p className="text-xs text-bad mt-3">Could not load capability matrix: {error}</p>}
      {loading && !data && <p className="text-xs text-muted mt-3">Loading capability matrix…</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="text-[11px] text-muted">
              <b className="text-fg">{summary.total ?? rows.length}</b> capabilities
            </span>
            {STATES.map((s) => (
              <Pill key={s.state} tone={s.tone}>
                {s.label}: {summary[s.state] ?? 0}
              </Pill>
            ))}
          </div>

          <div className="mt-4 border border-border rounded-lg overflow-hidden">
            <div className="max-h-[420px] overflow-y-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1fr_130px_80px_80px_1fr_80px] px-4 py-2 bg-input border-b border-border text-[10px] font-bold text-muted uppercase tracking-wide sticky top-0">
                  <span>Capability</span>
                  <span>State</span>
                  <span>Configured</span>
                  <span>Probe</span>
                  <span>Last probe / error</span>
                  <span>Keystore</span>
                </div>
                {rows.map((row) => (
                  <div
                    key={row.capability}
                    className="grid grid-cols-[1fr_130px_80px_80px_1fr_80px] px-4 py-2.5 border-b border-border last:border-0 items-center text-xs"
                  >
                    <span className="text-fg font-mono truncate">{row.capability}</span>
                    <span>
                      <Pill tone={STATE_TONE[row.state] ?? "muted"}>{row.state.replace(/_/g, " ")}</Pill>
                    </span>
                    <span className={row.configured ? "text-ok" : "text-muted"}>
                      {row.configured ? "yes" : "no"}
                    </span>
                    <span className={row.probe_supported ? "text-fg/80" : "text-muted"}>
                      {row.probe_supported ? "supported" : "none"}
                    </span>
                    <span className="min-w-0">
                      {row.last_probe_at ? (
                        <span className="text-fg/80">{timeAgo(row.last_probe_at)}</span>
                      ) : (
                        <span className="text-muted">never</span>
                      )}
                      {row.last_error && (
                        <span className="block text-[10px] text-bad truncate">{row.last_error}</span>
                      )}
                    </span>
                    <span className="text-muted text-[11px]">{row.keystore ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">
              Service breadcrumbs
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {services.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs py-1 border-b border-border/60">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.stale ? "bg-bad" : "bg-ok"}`} />
                  <span className="text-fg/80 flex-1 truncate">{s.label}</span>
                  <span className="text-muted text-[10px]">{s.at ? `${age(s.age_ms)} ago` : "missing"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
