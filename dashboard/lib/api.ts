"use client";

/** Step-up header required by mutating dashboard proxies (audit M-2/M-3). */
export const MUTATE_HEADERS: HeadersInit = {
  "content-type": "application/json",
  "x-lz-confirm": "mutate",
};

/** Read-only SQL helper — server rejects non-SELECT without MUTATE_HEADERS. */
export async function queryApi<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  if (!res.ok) throw new Error(`query failed: ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as T[];
}

/** Mutating SQL (INSERT/UPDATE/DELETE with WHERE) — sends confirm header. */
export async function mutateQuery(
  sql: string,
  params: unknown[] = []
): Promise<Response> {
  return fetch("/api/query", {
    method: "POST",
    headers: MUTATE_HEADERS,
    body: JSON.stringify({ sql, params }),
  });
}

/** POST to a high-power dashboard route with the mutate confirm header. */
export function mutateFetch(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: MUTATE_HEADERS,
    body: JSON.stringify(body),
  });
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
