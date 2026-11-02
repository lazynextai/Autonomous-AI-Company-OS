"use client";

import { useEffect, useState } from "react";
import { queryApi } from "@/lib/api";
import { Card, timeAgo } from "@/components/ui";
import { Pill, type Tone } from "./Pill";
import { useGov } from "./useGov";
import { govGet } from "@/lib/governance";
import type { EvidenceSummaryResponse, LeadEvidenceResponse, LeadEvidenceRow } from "@/lib/governance";
import { BadgeCheck } from "lucide-react";

const DISPOSITION_TONE: Record<string, Tone> = {
  verified: "ok",
  inferred: "warn",
  unknown: "muted",
};

interface LeadLite {
  id: number;
  name: string;
}

function evidenceRow(row: LeadEvidenceRow) {
  return (
    <div
      key={row.id}
      className="grid grid-cols-[1.6fr_90px_100px_1.5fr_70px_100px] px-4 py-2.5 border-b border-border last:border-0 items-start text-xs"
    >
      <span className="text-fg/80 min-w-0 break-words">{row.claim}</span>
      <span>
        <Pill tone={DISPOSITION_TONE[row.disposition] ?? "muted"}>{row.disposition}</Pill>
      </span>
      <span className="text-muted font-mono text-[11px]">{row.verification_method}</span>
      <span className="min-w-0 truncate">
        {row.source_url ? (
          <a
            href={row.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-accentSoft hover:underline"
          >
            {row.source_url}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </span>
      <span className="text-fg/80">{Math.round(row.confidence * 100)}%</span>
      <span className="text-muted">{timeAgo(row.fetched_at)}</span>
    </div>
  );
}

export function EvidencePanel() {
  const { data, error, loading } = useGov<EvidenceSummaryResponse>("/api/v1/crm/evidence/summary");
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [leadData, setLeadData] = useState<LeadEvidenceResponse | null>(null);
  const [leadError, setLeadError] = useState("");

  useEffect(() => {
    let alive = true;
    queryApi<LeadLite>("SELECT id, name FROM crm_leads ORDER BY id DESC LIMIT 50")
      .then((rows) => {
        if (!alive) return;
        setLeads(rows);
        setLeadId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (leadId == null) return;
    let alive = true;
    setLeadError("");
    govGet<LeadEvidenceResponse>(`/api/v1/crm/leads/${leadId}/evidence`)
      .then((next) => {
        if (alive) setLeadData(next);
      })
      .catch((e) => {
        if (!alive) return;
        setLeadData(null);
        setLeadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [leadId]);

  const counts: Record<string, number> = { verified: 0, inferred: 0, unknown: 0 };
  for (const row of data?.summary ?? []) {
    if (row.disposition in counts) counts[row.disposition] = row.count;
  }
  const rows = leadData?.evidence ?? [];
  const perLead = leadData?.summary;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-accentSoft" /> CRM evidence disposition
          </h2>
          <p className="text-xs text-muted mt-1">
            Claim-level provenance, never a claim rewrite: verified (exact / normalized), inferred
            (fuzzy), unknown (no anchor). Source URL and verification method are recorded per row.
          </p>
        </div>
        <span className="text-[10px] text-muted shrink-0">{leads.length} leads</span>
      </div>

      {error && <p className="text-xs text-bad mt-3">Could not load evidence summary: {error}</p>}
      {loading && !data && <p className="text-xs text-muted mt-3">Loading evidence summary…</p>}

      <div className="grid grid-cols-3 gap-3 mt-4">
        {(["verified", "inferred", "unknown"] as const).map((key) => (
          <div key={key} className="bg-input border border-border rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-muted uppercase tracking-wide">{key}</div>
            <div className="text-lg font-bold text-fg mt-0.5">{counts[key] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <label className="text-[11px] text-muted" htmlFor="evidence-lead">
          Lead evidence
        </label>
        <select
          id="evidence-lead"
          value={leadId ?? ""}
          onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : null)}
          className="bg-input border border-border rounded-lg px-3 py-2 text-xs text-fg outline-none focus:border-accent min-w-[220px]"
        >
          {leads.length === 0 && <option value="">No leads</option>}
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              #{lead.id} · {lead.name}
            </option>
          ))}
        </select>
        {perLead && (
          <span className="text-[10px] text-muted">
            {perLead.verified} verified · {perLead.inferred} inferred · {perLead.unknown} unknown
          </span>
        )}
      </div>

      {leadError && <p className="text-xs text-bad mt-3">Could not load lead evidence: {leadError}</p>}

      {leadId != null && !leadError && rows.length === 0 && (
        <p className="text-xs text-muted mt-3">
          No evidence recorded for this lead yet.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 border border-border rounded-lg overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[1.6fr_90px_100px_1.5fr_70px_100px] px-4 py-2 bg-input border-b border-border text-[10px] font-bold text-muted uppercase tracking-wide">
              <span>Claim</span>
              <span>Disposition</span>
              <span>Method</span>
              <span>Source</span>
              <span>Conf.</span>
              <span>Fetched</span>
            </div>
            {rows.map(evidenceRow)}
          </div>
        </div>
      )}
    </Card>
  );
}
