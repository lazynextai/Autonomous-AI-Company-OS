import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";
import {
  EXEC_CODE_MAX,
  clampExecTimeout,
  hasMutateConfirm,
} from "@/lib/blast_radius";

export const dynamic = "force-dynamic";

// Runs Python code in the Cloudflare exec container (POST /exec on the worker).
// Requires x-lz-confirm: mutate — stolen-session XSS must not free-fire /exec.
export async function POST(req: NextRequest) {
  if (!hasMutateConfirm(req.headers)) {
    return NextResponse.json(
      { error: "exec requires x-lz-confirm: mutate" },
      { status: 403 },
    );
  }
  let body: { code?: unknown; timeout?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { code, timeout } = body;
  if (typeof code !== "string" || !code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }
  if (code.length > EXEC_CODE_MAX) {
    return NextResponse.json(
      { error: `code exceeds ${EXEC_CODE_MAX} chars` },
      { status: 400 },
    );
  }
  return workerFetch("/exec", {
    code,
    timeout: clampExecTimeout(timeout),
  });
}
