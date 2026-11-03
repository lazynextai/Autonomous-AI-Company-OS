"use client";

import { Card, Empty, timeAgo } from "@/components/ui";
import { Pill, type Tone } from "./Pill";
import { useGov } from "./useGov";
import type { GateBlock, GateBlocksResponse } from "@/lib/governance";
import { Ban } from "lucide-react";

const AUTHORITY_TONE: Record<string, Tone> = {
  auto: "muted",
  approval: "warn",
  human_only: "bad",
  unavailable: "bad",
};

interface BlockPayload {
  event?: string;
  type?: string;
  connector?: string | null;
  target?: string;
  authority?: string;
  scope?: string;
  reason?: string;
  ts?: string;
}

function parse(payload: string): BlockPayload {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as BlockPayload) : {};
  } catch {
    return {};
  }
}

function BlockRow({ block }: { block: GateBlock }) {
  const p = parse(block.payload);
  return (
    <div className="grid grid-cols-[52px_1fr_110px_100px_1.6fr_90px] px-4 py-3 border-b border-border last:border-0 items-start text-xs">
      <span className="text-muted font-mono">#{block.id}</span>
      <span className="min-w-0">
        <span className="block text-fg font-semibold truncate">{p.target ?? "—"}</span>
        {p.type && <span className="block text-[10px] text-muted truncate">{p.type}</span>}
      </span>
      <span>
        <Pill tone={AUTHORITY_TONE[p.authority ?? ""] ?? "muted"}>
          {(p.authority ?? "unknown").replace(/_/g, " ")}
        </Pill>
      </span>
      <span className="text-fg/80 truncate">{p.scope ?? "—"}</span>
      <span className="text-[11px] text-fg/80 min-w-0 break-words">{p.reason ?? p.event ?? "—"}</span>
      <span className="text-[10px] text-muted">{timeAgo(p.ts ?? block.created_at)}</span>
    </div>
  );
}

export function GateBlocksPanel() {
  const { data, error, loading } = useGov<GateBlocksResponse>("/decision/blocks?limit=20", 60000);
  const blocks = data?.blocks ?? [];

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Ban className="w-4 h-4 text-accentSoft" /> Gate blocks
          </h2>
          <p className="text-xs text-muted mt-1">
            Dispatches the decision gate refused — blocked, not broken. Each row names the target, its
            authority class, the enforcing scope, and why it was refused.
          </p>
        </div>
        <span className="text-[10px] text-muted shrink-0">{blocks.length} shown</span>
      </div>

      {error && <p className="text-xs text-bad mt-3">Could not load gate blocks: {error}</p>}
      {loading && !data && <p className="text-xs text-muted mt-3">Loading gate blocks…</p>}

      {data && blocks.length === 0 && (
        <div className="mt-4">
          <Empty
            title="No gate blocks"
            hint="A refusal lands here the moment the gate stops a dispatch. An empty list means nothing was blocked."
          />
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-4 border border-border rounded-lg overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[52px_1fr_110px_100px_1.6fr_90px] px-4 py-2 bg-input border-b border-border text-[10px] font-bold text-muted uppercase tracking-wide">
              <span>ID</span>
              <span>Target</span>
              <span>Authority</span>
              <span>Scope</span>
              <span>Reason</span>
              <span>When</span>
            </div>
            {blocks.map((block) => (
              <BlockRow key={block.id} block={block} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted mt-3">
        Read-only, last 20 blocks. The gate itself is unchanged by this page — approvals stay on the
        operator API.
      </p>
    </Card>
  );
}
