import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";
import { hasMutateConfirm } from "@/lib/blast_radius";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasMutateConfirm(req.headers)) {
    return NextResponse.json(
      { error: "agent tick requires x-lz-confirm: mutate" },
      { status: 403 },
    );
  }
  return workerFetch("/agent/tick", {});
}
