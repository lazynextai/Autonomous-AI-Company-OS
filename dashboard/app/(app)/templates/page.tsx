import { PageHeader } from "@/components/ui";
import { TemplatesPanel } from "@/components/governance/TemplatesPanel";

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Company templates"
        subtitle="Starter company packs (C5). Validate stores a version; activate is a separate explicit confirm."
      />
      <div className="max-w-6xl space-y-5">
        <TemplatesPanel />
      </div>
    </>
  );
}
