import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";

export const dynamic = "force-dynamic";

// Key management is the ONE /api/v1 surface that is not lzk-keyed: the worker's
// handleKeyAdmin accepts the internal API_TOKEN only ("Admin key management -
// authenticated with the internal API_TOKEN, not lzk keys"). Passing `internal`
// makes workerFetch send that token instead of the read/write key — without it
// every call returned 401 and the API Keys page could not load or create a key.
export async function GET() {
  return workerFetch("/api/v1/keys", undefined, "GET", true);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  return workerFetch("/api/v1/keys", b, "POST", true);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return workerFetch(`/api/v1/keys/${id}`, undefined, "DELETE", true);
}
