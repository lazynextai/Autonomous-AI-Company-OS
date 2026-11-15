import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";
import { hasMutateConfirm, kvKeyAllowed } from "@/lib/blast_radius";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { action?: unknown; key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { action, key, value } = body;
  if (typeof action !== "string" || !key) {
    return NextResponse.json({ error: "key + action required" }, { status: 400 });
  }
  if (!kvKeyAllowed(key, action)) {
    return NextResponse.json(
      {
        error:
          "kv key/action not allowlisted (2fa + sessions stay off this proxy)",
      },
      { status: 400 },
    );
  }
  if (action === "get") return workerFetch("/kv/get", { key });
  if (action === "put" || action === "delete") {
    if (!hasMutateConfirm(req.headers)) {
      return NextResponse.json(
        { error: "kv mutate requires x-lz-confirm: mutate" },
        { status: 403 },
      );
    }
    if (action === "put") {
      return workerFetch("/kv/put", { key, value, ttl: 31536000 });
    }
    return workerFetch("/kv/delete", { key });
  }
  return NextResponse.json({ error: "bad action" }, { status: 400 });
}
