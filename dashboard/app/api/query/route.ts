import { NextRequest, NextResponse } from "next/server";
import { queryWorker } from "@/lib/worker";
import { classifySql, hasMutateConfirm } from "@/lib/blast_radius";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { sql?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sql = body.sql;
  const kind = classifySql(sql);
  if (kind === "forbidden") {
    return NextResponse.json(
      {
        error:
          "sql rejected — SELECT only by default; mutations need WHERE + x-lz-confirm: mutate; DDL blocked",
      },
      { status: 400 },
    );
  }
  if (kind === "mutate" && !hasMutateConfirm(req.headers)) {
    return NextResponse.json(
      { error: "mutating sql requires x-lz-confirm: mutate" },
      { status: 403 },
    );
  }
  const params = Array.isArray(body.params) ? body.params : [];
  return queryWorker(String(sql), params);
}
