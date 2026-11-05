"use client";

import { Card, Empty } from "@/components/ui";
import { useGov } from "@/components/governance/useGov";
import type { GateBlock, GateBlocksResponse } from "@/lib/governance";

interface DecisionPackageLite {
  id: number;
  title: string;
  objective: string | null;
  proposed_action: string | null;
  authority: string;
  target: string;
  outcome: string;
  created_at: string;
}

interface DecisionPackagesResponse {
  packages?: DecisionPackageLite[];
}

interface ObserverReview {
  id: number;
  payload: string;
  created_at: string;
}

interface ObserverReviewsResponse {
  reviews?: ObserverReview[];
}

interface BlockPayload {
  reason?: string;
  authority?: string;
  scope?: string;
}

interface ReviewPayload {
  recommendation?: string;
  gaps?: string[];
  task_id?: string;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function parsePayload<T>(raw: string): Partial<T> {
  try {
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return {};
  }
}

export default function GovernanceInbox() {
  const pending = useGov<DecisionPackagesResponse>("/decision/packages");
  const blocks = useGov<GateBlocksResponse>("/decision/blocks?limit=20");
  const reviews = useGov<ObserverReviewsResponse>("/observer/reviews");

  const pendingPackages = (pending.data?.packages ?? []).filter((p) => p.outcome === "draft");
  const blockRows = blocks.data?.blocks ?? [];
  const reviewRows = reviews.data?.reviews ?? [];
  const flagged = reviewRows.filter((r) => /evidence_gap|policy_concern/.test(r.payload || ""));

  const errors = [pending.error, blocks.error, reviews.error].filter(Boolean);

  return (
    <div className="mt-10 space-y-6 max-w-3xl border-t border-border pt-8">
      <div>
        <h2 className="text-base font-semibold text-fg">Governance inbox</h2>
        <p className="text-sm text-muted mt-1">
          The decision gate, its blocks, and the observer&apos;s flags — what is waiting on a human
          look across the governance layer.
        </p>
        <p className="text-xs text-fg mt-2">
          {pending.loading && !pending.data ? "…" : `${pendingPackages.length} awaiting approval`}
          {" · "}
          {blocks.loading && !blocks.data ? "…" : `${blockRows.length} recent blocks`}
          {" · "}
          {reviews.loading && !reviews.data ? "…" : `${flagged.length} flagged by observer`}
        </p>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-fg mb-3">
          Awaiting approval ({pending.loading && !pending.data ? "…" : pendingPackages.length})
        </h3>
        {!pending.loading && pendingPackages.length === 0 ? (
          <Empty title="Nothing awaiting approval" hint="No draft decision packages are waiting for a decision." />
        ) : (
          <div className="space-y-3">
            {pendingPackages.map((p) => (
              <Card key={p.id} className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-fg">{p.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted border border-border rounded px-1.5 py-0.5">
                    {p.authority}
                  </span>
                  <span className="text-[10px] text-muted">target: {p.target}</span>
                  <span className="text-[10px] text-muted ml-auto">{timeAgo(p.created_at)}</span>
                </div>
                {p.objective && <p className="text-xs text-muted">{p.objective}</p>}
                {p.proposed_action && <p className="text-xs text-muted">{p.proposed_action}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-fg mb-3">
          Recent gate blocks ({blocks.loading && !blocks.data ? "…" : blockRows.length})
        </h3>
        {!blocks.loading && blockRows.length === 0 ? (
          <Empty title="No recent blocks" hint="No dispatch has been blocked by the decision gate recently." />
        ) : (
          <div className="space-y-2">
            {blockRows.map((b: GateBlock) => {
              const p = parsePayload<BlockPayload>(b.payload);
              return (
                <Card key={b.id} className="flex items-start gap-3 text-xs">
                  <span className="text-muted shrink-0">{timeAgo(b.created_at)}</span>
                  <span className="text-fg">{p.reason || b.payload.slice(0, 120)}</span>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-fg mb-3">
          Observer-flagged ({reviews.loading && !reviews.data ? "…" : flagged.length})
        </h3>
        {!reviews.loading && flagged.length === 0 ? (
          <Empty
            title="No flagged reviews"
            hint="The observer has not flagged any dispatch as evidence-gap or policy-concern recently."
          />
        ) : (
          <div className="space-y-2">
            {flagged.map((r) => {
              const p = parsePayload<ReviewPayload>(r.payload);
              return (
                <Card key={r.id} className="flex items-start gap-3 text-xs">
                  <span className="text-[10px] uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5 shrink-0">
                    {p.recommendation ?? "flagged"}
                  </span>
                  <span className="text-muted shrink-0">{timeAgo(r.created_at)}</span>
                  <span className="text-fg">{(p.gaps ?? []).join(", ") || p.task_id || "flagged dispatch"}</span>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <p className="text-xs text-bad">
          Could not load: {errors.join("; ")}. Showing what loaded — the platform health log has
          details if a section stays empty.
        </p>
      )}

      <p className="text-[10px] text-muted">
        Read-only panel. Approval actions are not enabled here — who may approve is a separate
        decision. Until then, approvals go through the operator API.
      </p>
    </div>
  );
}