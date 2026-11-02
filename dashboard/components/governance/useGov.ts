"use client";

import { useEffect, useState } from "react";
import { govGet } from "@/lib/governance";

// Poll one governance read path. The governance surfaces are operator views,
// so a slow cadence is enough — nothing here is on a user's critical path.
export function useGov<T>(path: string, intervalMs = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await govGet<T>(path);
        if (alive) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, intervalMs]);

  return { data, error, loading };
}
