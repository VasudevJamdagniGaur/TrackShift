"use client";

import { useEffect, useState } from "react";
import type { RoadIssue } from "@/types";

export type MapillaryCoverage = {
  available: boolean;
  imageId?: string;
  mapillaryUrl?: string;
};

export function useMapillaryCoverage(issues: RoadIssue[], enabled = true) {
  const [coverage, setCoverage] = useState<Record<string, MapillaryCoverage>>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || issues.length === 0) {
      setCoverage({});
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/mapillary/coverage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: issues.map((issue) => ({
              id: issue.id,
              latitude: issue.latitude,
              longitude: issue.longitude,
            })),
          }),
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          results?: Array<{
            id: string;
            available: boolean;
            imageId?: string;
            mapillaryUrl?: string;
          }>;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "Failed to load Mapillary coverage");
        }
        if (cancelled) return;
        const next: Record<string, MapillaryCoverage> = {};
        for (const result of data.results ?? []) {
          next[result.id] = {
            available: result.available,
            imageId: result.imageId,
            mapillaryUrl: result.mapillaryUrl,
          };
        }
        setCoverage(next);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [issues, enabled]);

  return { coverage, loading, error };
}
