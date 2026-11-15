"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { Crosshair } from "lucide-react";

const TASK_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

export default function MissionLookupPage() {
  const router = useRouter();
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = taskId.trim();
    if (!TASK_ID_RE.test(id)) {
      setError("Task id must match [A-Za-z0-9_.:-]{1,120} (same gate as the worker).");
      return;
    }
    setError("");
    router.push(`/mission/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <PageHeader
        title="Mission report"
        subtitle="Look up the plan → outcome → estimated-cost roll-up for one task (C2)."
      />

      <Card className="max-w-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[10px] bg-accentBg flex items-center justify-center shrink-0">
            <Crosshair className="w-5 h-5 text-accentSoft" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-fg">Open a mission report</h2>
            <p className="text-xs text-muted mt-1">
              Enter a task_log task id. The report is read-only over outcome_ledger and linked
              decision packages — missing figures stay null.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="e.g. 760fa738"
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-fg outline-none focus:border-accent font-mono"
            aria-label="Task id"
          />
          <button
            type="submit"
            className="bg-accent hover:bg-accentSoft text-white text-xs font-semibold px-4 rounded-lg transition"
          >
            Open
          </button>
        </form>
        {error && <p className="text-xs text-bad mt-2">{error}</p>}
      </Card>

      <p className="text-[10px] text-muted mt-4 max-w-xl">
        Also linked from each task detail page. Source: GET /report/mission/:taskId on the platform
        worker.
      </p>
    </>
  );
}
