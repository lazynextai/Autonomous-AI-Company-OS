"use client";

import Link from "next/link";
import { Card, Empty, timeAgo } from "@/components/ui";
import { Pill, type Tone } from "./Pill";
import { useGov } from "./useGov";
import type { MissionLedgerRow, MissionPackageRow, MissionReport } from "@/lib/governance";
import { Crosshair } from "lucide-react";

const STATUS_TONE: Record<string, Tone> = {
  completed: "ok",
  pending: "accent",
  in_progress: "warn",
  failed: "bad",
  escalated: "bad",
};

function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function ms(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function PackageRow({ pkg }: { pkg: MissionPackageRow }) {
  return (
    <div className="grid grid-cols-[48px_1.6fr_90px_90px_1fr_90px] px-4 py-3 border-b border-border last:border-0 items-start text-xs">
      <span className="text-muted font-mono">#{pkg.id}</span>
      <span className="min-w-0">
        <span className="block text-fg font-semibold truncate">{pkg.title ?? "Untitled"}</span>
        {pkg.proposed_action && (
          <span className="block text-[10px] text-muted/80 truncate">{pkg.proposed_action}</span>
        )}
      </span>
      <span>
        <Pill tone="muted">{(pkg.authority ?? "—").replace(/_/g, " ")}</Pill>
      </span>
      <span>
        <Pill tone={STATUS_TONE[pkg.outcome ?? ""] ?? "muted"}>{pkg.outcome ?? "—"}</Pill>
      </span>
      <span className="text-fg/80 truncate">{pkg.target ?? "—"}</span>
      <span className="text-muted">{money(pkg.cost_projection_cents)}</span>
    </div>
  );
}

function LedgerRow({ row }: { row: MissionLedgerRow }) {
  return (
    <div className="grid grid-cols-[48px_90px_1fr_90px_80px_80px_90px] px-4 py-3 border-b border-border last:border-0 items-start text-xs">
      <span className="text-muted font-mono">#{row.id}</span>
      <span className="text-fg/80">{row.ref_type}</span>
      <span className="min-w-0">
        <span className="block text-fg truncate">{row.ref_id}</span>
        <span className="block text-[10px] text-muted">
          {row.link} · {row.link_confidence}
          {row.provider ? ` · ${row.provider}` : ""}
        </span>
      </span>
      <span className="text-muted">{ms(row.duration_ms)}</span>
      <span className="text-muted">{row.retries ?? "—"}</span>
      <span className="text-fg/80">{money(row.est_cost_cents)}</span>
      <span className="text-muted">{row.acceptance ?? "—"}</span>
    </div>
  );
}

export function MissionReportPanel({
  taskId,
  compact = false,
}: {
  taskId: string;
  compact?: boolean;
}) {
  // Task-id charset mirrors the worker gate; the svc whitelist rejects anything else.
  const { data, error, loading } = useGov<MissionReport>(`/report/mission/${taskId}`);

  const packages = data?.decision_packages ?? [];
  const rows = data?.ledger_rows ?? [];
  const totals = data?.totals;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-accentSoft" /> Mission report
          </h2>
          <p className="text-xs text-muted mt-1">
            Plan → outcome → estimated cost for task{" "}
            <span className="font-mono text-fg/80">{taskId}</span>. Missing pieces stay null —
            never fabricated zeros. Cost is labelled estimated.
          </p>
        </div>
        {data?.generated_at && (
          <span className="text-[10px] text-muted shrink-0">built {timeAgo(data.generated_at)}</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-bad mt-3">
          Could not load mission report: {error}
          {!compact && (
            <>
              {" "}
              — try the{" "}
              <Link href="/mission" className="underline text-accentSoft">
                mission lookup
              </Link>
              .
            </>
          )}
        </p>
      )}
      {loading && !data && <p className="text-xs text-muted mt-3">Loading mission report…</p>}

      {data && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-input rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted font-bold">Status</div>
              <div className="mt-1">
                <Pill tone={STATUS_TONE[data.task.status ?? ""] ?? "muted"}>
                  {(data.task.status ?? "—").replace(/_/g, " ")}
                </Pill>
              </div>
            </div>
            <div className="bg-input rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted font-bold">Agent</div>
              <div className="mt-1 text-sm text-fg">
                {(data.task.agent_id ?? "—").replace(/_/g, " ")}
              </div>
            </div>
            <div className="bg-input rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted font-bold">
                Est. cost
              </div>
              <div className="mt-1 text-sm text-fg">{money(totals?.est_cost_cents)}</div>
              <div className="text-[10px] text-muted">{totals?.cost_kind ?? "estimated"}</div>
            </div>
            <div className="bg-input rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted font-bold">
                Ledger rows
              </div>
              <div className="mt-1 text-sm text-fg">{totals?.row_count ?? 0}</div>
              <div className="text-[10px] text-muted">
                duration {ms(totals?.duration_ms)} · retries {totals?.retries ?? "—"}
              </div>
            </div>
          </div>

          {!compact && data.task.description && (
            <p className="text-sm text-fg/80">{data.task.description}</p>
          )}

          {totals?.acceptance && (
            <p className="text-xs text-muted">
              Acceptance: {totals.acceptance.passed} passed · {totals.acceptance.failed} failed ·{" "}
              {totals.acceptance.na} n/a
              {totals.acceptance.pass_rate != null &&
                ` · pass rate ${(totals.acceptance.pass_rate * 100).toFixed(1)}%`}
            </p>
          )}

          <section>
            <h3 className="text-xs font-semibold text-fg mb-2">
              Decision packages ({packages.length === 0 ? "none linked" : packages.length})
            </h3>
            {packages.length === 0 ? (
              <Empty
                title="No linked decision packages"
                hint="Packages appear here only when executed_task_id matches this task."
              />
            ) : (
              <div className="border border-border rounded-lg overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[48px_1.6fr_90px_90px_1fr_90px] px-4 py-2 bg-input border-b border-border text-[10px] font-bold text-muted uppercase tracking-wide">
                    <span>ID</span>
                    <span>Package</span>
                    <span>Authority</span>
                    <span>Outcome</span>
                    <span>Target</span>
                    <span>Cost</span>
                  </div>
                  {packages.map((pkg) => (
                    <PackageRow key={pkg.id} pkg={pkg} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-fg mb-2">
              Outcome ledger ({rows.length})
            </h3>
            {rows.length === 0 ? (
              <Empty
                title="No ledger rows"
                hint="No outcome_ledger rows join this task directly or via a package target."
              />
            ) : (
              <div className="border border-border rounded-lg overflow-x-auto">
                <div className="min-w-[780px]">
                  <div className="grid grid-cols-[48px_90px_1fr_90px_80px_80px_90px] px-4 py-2 bg-input border-b border-border text-[10px] font-bold text-muted uppercase tracking-wide">
                    <span>ID</span>
                    <span>Type</span>
                    <span>Ref</span>
                    <span>Duration</span>
                    <span>Retries</span>
                    <span>Est. cost</span>
                    <span>Accept</span>
                  </div>
                  {rows.map((row) => (
                    <LedgerRow key={row.id} row={row} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {!compact && (
            <details className="text-[10px] text-muted">
              <summary className="cursor-pointer text-fg/70">Grouping rules &amp; cost derivation</summary>
              <ul className="mt-2 list-disc pl-4 space-y-1">
                {(data.grouping.rules ?? []).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <p className="mt-2">{totals?.cost_derivation}</p>
              <p className="mt-1">{data.grouping.lineage.reason}</p>
            </details>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted mt-3">
        Read-only view of GET /report/mission/:taskId. Lineage is derived — task_log has no parent
        column.
      </p>
    </Card>
  );
}
