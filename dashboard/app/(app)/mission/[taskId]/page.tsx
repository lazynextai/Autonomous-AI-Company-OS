"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { MissionReportPanel } from "@/components/governance/MissionReportPanel";
import { ArrowLeft } from "lucide-react";

const TASK_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

export default function MissionReportPage() {
  const params = useParams();
  const raw = String(params.taskId ?? "");
  const taskId = decodeURIComponent(raw);

  if (!TASK_ID_RE.test(taskId)) {
    return (
      <>
        <Link href="/mission" className="text-sm text-accentSoft flex items-center gap-1.5 mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Mission lookup
        </Link>
        <PageHeader
          title="Invalid task id"
          subtitle="Task ids must match [A-Za-z0-9_.:-]{1,120}."
        />
      </>
    );
  }

  return (
    <>
      <Link href="/mission" className="text-sm text-accentSoft flex items-center gap-1.5 mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Mission lookup
      </Link>
      <PageHeader
        title="Mission report"
        subtitle={`Plan → outcome → estimated cost for ${taskId}.`}
      />
      <div className="max-w-6xl space-y-4">
        <MissionReportPanel taskId={taskId} />
        <p className="text-xs text-muted">
          Task record:{" "}
          <Link href={`/tasks/${encodeURIComponent(taskId)}`} className="text-accentSoft underline">
            /tasks/{taskId}
          </Link>
        </p>
      </div>
    </>
  );
}
