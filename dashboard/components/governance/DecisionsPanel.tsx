"use client";

import { Card, Empty, timeAgo } from "@/components/ui";
import { Pill, type Tone } from "./Pill";
import { useGov } from "./useGov";
import type { DecisionPackage, DecisionsResponse } from "@/lib/governance";
import { GitBranch } from "lucide-react";

const AUTHORITY_TONE: Record<string, Tone> = {
  auto: "muted",
  approval: "warn",
  human_only: "bad",
};

const OUTCOME_TONE: Record<string, Tone> = {
  executed: "ok",
  approved: "ok",
  draft: "accent",
  rejected: "bad",
  failed: "bad",
  expired: "warn",
  voided: "muted",
};

function evidenceCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function expiry(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function DecisionRow({ pkg }: { pkg: DecisionPackage }) {
  const count = evidenceCount(pkg.evidence);
  return (
    <div className="grid grid-cols-[48px_1.7fr_100px_100px_1fr_90px_90px_100px] px-4 py-3 border-b border-border last:border-0 items-start text-xs">
      <span className="text-muted font-mono">#{pkg.id}</span>
      <span className="min-w-0">
        <span className="block text-fg font-semibold truncate">{pkg.title}</span>
        {pkg.objective && <span className="block text-[11px] text-muted truncate">{pkg.objective}</span>}
        {pkg.proposed_action && (
          <span className="block text-[10px] text-muted/80 truncate">{pkg.proposed_action}</span>
        )}
      </span>
      <span>
        <Pill tone={AUTHORITY_TONE[pkg.authority] ?? "muted"}>{pkg.authority.replace(/_/g, " ")}</Pill>
      </span>
      <span>
        <Pill tone={OUTCOME_TONE[pkg.outcome] ?? "muted"}>{pkg.outcome}</Pill>
      </span>
      <span className="text-fg/80 truncate">{pkg.target ?? "—"}</span>
      <span className="text-muted">{expiry(pkg.expiry_at)}</span>
      <span className="text-fg/80">${(pkg.cost_projection_cents / 100).toFixed(2)}</span>
      <span className="text-muted">
        {timeAgo(pkg.created_at ?? undefined)}
        {count > 0 && <span className="block text-[10px] text-accentSoft">{count} evidence</span>}
      </span>
    </div>
  );
}

export function DecisionsPanel() {
  const { data, error, loading } = useGov<DecisionsResponse>("/decision/packages");
  const packages = data?.packages ?? [];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-accentSoft" /> Decision packages
          </h2>
          <p className="text-xs text-muted mt-1">
            One auditable record per high-impact action — authority class, outcome, target, expiry,
            and the cost projection the operator saw before deciding.
          </p>
        </div>
        <span className="text-[10px] text-muted shrink-0">{packages.length} shown</span>
      </div>

      {error && <p className="text-xs text-bad mt-3">Could not load decision packages: {error}</p>}
      {loading && !data && <p className="text-xs text-muted mt-3">Loading decision packages…</p>}

      {data && packages.length === 0 && (
        <div className="mt-4">
          <Empty title="No decision packages yet" hint="Dispatch-gated actions and operator approvals land here." />
        </div>
      )}

      {packages.length > 0 && (
        <div className="mt-4 border border-border rounded-lg overflow-x-auto">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[48px_1.7fr_100px_100px_1fr_90px_90px_100px] px-4 py-2 bg-input border-b border-border text-[10px] font-bold text-muted uppercase tracking-wide">
              <span>ID</span>
              <span>Package</span>
              <span>Authority</span>
              <span>Outcome</span>
              <span>Target</span>
              <span>Expiry</span>
              <span>Cost</span>
              <span>Created</span>
            </div>
            {packages.map((pkg) => (
              <DecisionRow key={pkg.id} pkg={pkg} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted mt-3">
        Read-only: approve / reject / execute transitions stay on the operator API.
      </p>
    </Card>
  );
}
