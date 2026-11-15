import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { BreakersPanel } from "@/components/governance/BreakersPanel";
import { ReadinessPanel } from "@/components/governance/ReadinessPanel";
import { DecisionsPanel } from "@/components/governance/DecisionsPanel";
import { GateBlocksPanel } from "@/components/governance/GateBlocksPanel";
import { EvidencePanel } from "@/components/governance/EvidencePanel";
import { TemplatesPanel } from "@/components/governance/TemplatesPanel";

export default function GovernancePage() {
  return (
    <>
      <PageHeader
        title="Governance"
        subtitle="Outbound breakers, capability readiness, decision packages, gate blocks, CRM evidence, and company template packs."
      />

      <div className="space-y-5 max-w-6xl">
        <BreakersPanel />
        <ReadinessPanel />
        <DecisionsPanel />
        <GateBlocksPanel />
        <EvidencePanel />
        <TemplatesPanel />
      </div>

      <p className="text-[10px] text-muted mt-4 max-w-6xl">
        Breakers / readiness / decisions / blocks / evidence are read-only here. Template packs
        require an explicit Validate then a separate Activate confirm — see also{" "}
        <Link href="/templates" className="text-accentSoft underline">
          /templates
        </Link>{" "}
        and mission reports at{" "}
        <Link href="/mission" className="text-accentSoft underline">
          /mission
        </Link>
        .
      </p>
    </>
  );
}
