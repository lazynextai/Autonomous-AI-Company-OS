import { NextRequest, NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker";

export const dynamic = "force-dynamic";

// Proxy for the native services (CRM / tickets / bookings / store) plus the
// SignWell signing connector on the worker. Reads happen via queryApi straight
// to D1; POST is only for writes so they go through the worker's validation +
// auth. GET below is the governance read whitelist — exact paths only, no
// wildcard that could reach a mutating route.
const ALLOWED = /^\/api\/v1\/(crm\/leads|support\/tickets|booking|store\/products|store\/orders|marketing\/contacts|marketing\/campaigns|signwell\/documents|signwell\/send|signwell\/events)(\/\d+(\/send)?)?$|^\/api\/v1\/connectors(\/[a-z]+)?$|^\/api\/v1\/sign\/requests(\/[0-9a-f-]{36}(\/remind)?)?$/;

const READ_PATHS =
  /^\/api\/v1\/(?:ops\/breakers|crm\/evidence\/summary)$|^\/api\/v1\/crm\/leads\/\d+\/evidence$|^\/(?:capability\/matrix|decision\/packages|observer\/reviews)$|^\/decision\/blocks(?:\?limit=\d{1,3})?$/;

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!READ_PATHS.test(path)) {
    return NextResponse.json({ error: "invalid service path" }, { status: 400 });
  }
  // Same token split as every other dashboard route: /api/v1/* is the public
  // API gateway (lzk_ read key), while the governance routes without the
  // prefix are internal-bearer operator surfaces (worker API_TOKEN).
  return workerFetch(path, undefined, "GET", !path.startsWith("/api/v1/"));
}

export async function POST(req: NextRequest) {
  const { path, method = "POST", body } = await req.json();
  if (!path || !ALLOWED.test(path)) {
    return NextResponse.json({ error: "invalid service path" }, { status: 400 });
  }
  return workerFetch(path, body, method);
}
