"use client";

import { Card, timeAgo } from "@/components/ui";
import { Pill } from "./Pill";
import { useGov } from "./useGov";
import type { BreakersResponse, BreakerTrip } from "@/lib/governance";
import { ShieldCheck } from "lucide-react";

function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)}d`;
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 60_000)}m`;
}

function tripText(payload: string): string {
  try {
    const p = JSON.parse(payload) as { connector?: string; reason?: string };
    return `${p.connector ?? "unknown"}: ${p.reason ?? payload}`;
  } catch {
    return payload;
  }
}

function TripRow({ trip }: { trip: BreakerTrip }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-border last:border-0">
      <span className="text-[11px] text-bad font-semibold shrink-0">#{trip.id}</span>
      <span className="text-xs text-fg/80 flex-1 min-w-0 break-words">{tripText(trip.payload)}</span>
      <span className="text-[10px] text-muted shrink-0">{timeAgo(trip.created_at)}</span>
    </div>
  );
}

export function BreakersPanel() {
  const { data, error, loading } = useGov<BreakersResponse>("/api/v1/ops/breakers");
  const policy = data?.policy;
  const stats = Object.entries(data?.stats ?? {});
  const trips = data?.trips ?? [];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accentSoft" /> Outbound breakers
          </h2>
          <p className="text-xs text-muted mt-1">
            Policy-level stop conditions around connector and social dispatch. A tripped breaker
            fails closed and records why.
          </p>
        </div>
        {policy && <Pill tone={policy.enabled ? "ok" : "muted"}>{policy.enabled ? "Enabled" : "Disabled"}</Pill>}
      </div>

      {error && <p className="text-xs text-bad mt-3">Could not load breakers: {error}</p>}
      {loading && !data && <p className="text-xs text-muted mt-3">Loading breaker policy…</p>}

      {policy && (
        <>
          {policy.tripped_reason && (
            <div className="mt-4 rounded-lg border border-bad/30 bg-badBg px-4 py-3">
              <div className="text-xs font-semibold text-bad">Tripped</div>
              <div className="text-xs text-fg/80 mt-1 break-words">{policy.tripped_reason}</div>
              <div className="text-[10px] text-muted mt-1">{timeAgo(policy.tripped_at ?? undefined)}</div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Volume", value: `${policy.volume_limit} / ${duration(policy.volume_window_ms)}` },
              { label: "Provider failures", value: `${policy.failure_limit} / ${duration(policy.failure_window_ms)}` },
              { label: "Error rate", value: `${Math.round(policy.error_rate_limit * 100)}% / ${duration(policy.error_rate_window_ms)}` },
              { label: "Deliverability", value: `${Math.round(policy.deliverability_limit * 100)}% / ${duration(policy.deliverability_window_ms)}` },
            ].map((row) => (
              <div key={row.label} className="bg-input border border-border rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-muted uppercase tracking-wide">{row.label}</div>
                <div className="text-sm font-semibold text-fg mt-1">{row.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">
              Dispatches in window
            </div>
            {stats.length === 0 ? (
              <p className="text-xs text-muted">No connector dispatch counts.</p>
            ) : (
              <div className="grid grid-cols-[1fr_100px_90px] text-xs border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wide bg-input border-b border-border">
                  Connector
                </div>
                <div className="px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wide bg-input border-b border-border text-right">
                  Total
                </div>
                <div className="px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wide bg-input border-b border-border text-right">
                  Failed
                </div>
                {stats.map(([connector, s]) => (
                  <div key={connector} className="contents">
                    <div className="px-3 py-2 text-fg/80 font-mono border-b border-border last:border-0">
                      {connector}
                    </div>
                    <div className="px-3 py-2 text-fg text-right border-b border-border last:border-0">
                      {s?.total ?? 0}
                    </div>
                    <div
                      className={`px-3 py-2 text-right border-b border-border last:border-0 ${
                        (s?.failed ?? 0) > 0 ? "text-bad font-semibold" : "text-muted"
                      }`}
                    >
                      {s?.failed ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">
              Recent trips
            </div>
            {trips.length === 0 ? (
              <p className="text-xs text-muted">No trips recorded.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                {trips.map((trip) => (
                  <TripRow key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted mt-3">
            Policy updated {timeAgo(policy.updated_at)} · counts cover the rolling windows above.
          </p>
        </>
      )}
    </Card>
  );
}
