import { NextResponse } from "next/server";

async function workerEnv(): Promise<Record<string, string | undefined>> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    return ctx.env as Record<string, string | undefined>;
  } catch {
    return process.env as Record<string, string | undefined>;
  }
}

export async function workerFetch(path: string, body: unknown, method = "POST", internal = false) {
  const env = await workerEnv();
  const url = env.CLOUDFLARE_API_URL || process.env.CLOUDFLARE_API_URL;
  // /api/v1/* is the public API gateway — it requires an lzk_ key, not the
  // internal shared secret. Internal routes (/query, /kv/*) use API_TOKEN —
  // and admin-only /api/v1/* routes (billing subscriptions etc.) can force it.
  const isPublicApi = path.startsWith("/api/v1/") && !internal;
  const token = isPublicApi
    ? env.LAZYNEXT_API_KEY || process.env.LAZYNEXT_API_KEY
    : env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!url || !token) {
    return NextResponse.json({ error: "worker not configured" }, { status: 503 });
  }
  const init = {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "User-Agent": "Lazynext-Dashboard/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  let res: Response;
  const svc = env.COMPANY_API as { fetch: typeof fetch } | undefined;
  if (svc?.fetch) {
    try {
      res = await svc.fetch(`${url.replace(/\/$/, "")}${path}`, init);
    } catch {
      res = await fetch(`${url.replace(/\/$/, "")}${path}`, { ...init, cache: "no-store" });
    }
  } else {
    res = await fetch(`${url.replace(/\/$/, "")}${path}`, { ...init, cache: "no-store" });
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: text.slice(0, 800) || "worker returned non-JSON" }, { status: res.status || 502 });
  }
  return NextResponse.json(data as object, { status: res.status });
}

export async function queryWorker(sql: string, params: unknown[] = []) {
  const env = await workerEnv();
  const url = env.CLOUDFLARE_API_URL || process.env.CLOUDFLARE_API_URL;
  const token = env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

  if (!url || !token) {
    return NextResponse.json(
      { error: "CLOUDFLARE_API_URL / CLOUDFLARE_API_TOKEN not set" },
      { status: 503 }
    );
  }
  const reqInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "User-Agent": "Lazynext-Dashboard/1.0",
    },
    body: JSON.stringify({ sql, params }),
  };
  // In production use the service binding (same-account worker fetch is blocked).
  // In `next dev` the binding isn't available — fall back to direct fetch with UA.
  let res: Response;
  const svc = env.COMPANY_API as { fetch: typeof fetch } | undefined;
  if (svc?.fetch) {
    try {
      res = await svc.fetch(`${url.replace(/\/$/, "")}/query`, reqInit);
    } catch {
      res = await fetch(`${url.replace(/\/$/, "")}/query`, { ...reqInit, cache: "no-store" });
    }
  } else {
    res = await fetch(`${url.replace(/\/$/, "")}/query`, { ...reqInit, cache: "no-store" });
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: text.slice(0, 800) || "worker returned non-JSON" }, { status: res.status || 502 });
  }
  return NextResponse.json(data as object, { status: res.status });
}
