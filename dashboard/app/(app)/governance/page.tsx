import { PageHeader } from "@/components/ui";
import { BreakersPanel } from "@/components/governance/BreakersPanel";
import { ReadinessPanel } from "@/components/governance/ReadinessPanel";
import { DecisionsPanel } from "@/components/governance/DecisionsPanel";
import { GateBlocksPanel } from "@/components/governance/GateBlocksPanel";
import { EvidencePanel } from "@/components/governance/EvidencePanel";

export default function GovernancePage() {
  return (
    <>
      <PageHeader
        title="Governance"
        subtitle="Read-only view of outbound breakers, capability readiness, decision packages, gate blocks, and CRM evidence provenance."
      />

      <div className="space-y-5 max-w-6xl">
        <BreakersPanel />
        <ReadinessPanel />
        <DecisionsPanel />
        <GateBlocksPanel />
        <EvidencePanel />
      </div>

      <p className="text-[10px] text-muted mt-4 max-w-6xl">
        Read-only surfaces. Policy changes, approvals, and decision transitions stay on the
        operator API — this page never mutates governance state.
      </p>
    </>
  );
}
