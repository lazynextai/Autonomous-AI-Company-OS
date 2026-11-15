import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";
import { busChannelAllowed, hasMutateConfirm } from "@/lib/blast_radius";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasMutateConfirm(req.headers)) {
    return NextResponse.json(
      { error: "bus publish requires x-lz-confirm: mutate" },
      { status: 403 },
    );
  }
  let body: { channel?: unknown; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { channel, payload } = body;
  if (!channel || payload === undefined || payload === null) {
    return NextResponse.json(
      { error: "channel + payload required" },
      { status: 400 },
    );
  }
  if (!busChannelAllowed(channel)) {
    return NextResponse.json(
      { error: "bus channel not allowlisted" },
      { status: 400 },
    );
  }
  return workerFetch("/bus/publish", {
    channel: String(channel).trim(),
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}
