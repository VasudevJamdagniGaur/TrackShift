"use client";

import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { MapFiltersBar } from "@/components/map/map-filters";
import { RoadMapDynamic } from "@/components/map/road-map-dynamic";
import { RoadHealthCard } from "@/components/dashboard/road-health-card";
import { TotalIssuesCard } from "@/components/dashboard/total-issues-card";
import { CommonIssuesCard } from "@/components/dashboard/common-issues-card";
import {
  commonIssues,
  filterIssues,
  healthBreakdown,
  platformStats,
  roadSegments,
} from "@/data/mock";
import type { IssueType, Severity } from "@/types";

export default function MapPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<IssueType | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const issues = useMemo(
    () => filterIssues({ query, type, severity }),
    [query, type, severity]
  );

  const focus = useMemo(() => {
    if (!query || issues.length === 0) return null;
    return [issues[0].latitude, issues[0].longitude] as [number, number];
  }, [query, issues]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 page-enter">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Road Intelligence Map
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-4xl">
            Continuously Updated Road Health Map
          </h1>
        </div>

        <div className="mb-4 rounded-[1.25rem] border border-[var(--border)] bg-cream p-4 shadow-[var(--shadow-soft)]">
          <MapFiltersBar
            query={query}
            type={type}
            severity={severity}
            onQueryChange={setQuery}
            onTypeChange={setType}
            onSeverityChange={setSeverity}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.55fr_0.75fr]">
          <div className="overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 text-sm">
              <span className="text-muted">
                Showing {issues.length} issues · Demo markers
              </span>
              <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
                <span>🔴 Severe</span>
                <span>🟠 Moderate</span>
                <span>🟡 Minor</span>
                <span>🔵 Other</span>
              </div>
            </div>
            <div className="h-[560px]">
              <RoadMapDynamic
                issues={issues}
                segments={roadSegments}
                focus={focus}
                className="h-full w-full rounded-none"
              />
            </div>
          </div>
          <div className="space-y-5">
            <RoadHealthCard score={72} breakdown={healthBreakdown} />
            <TotalIssuesCard total={platformStats.issuesDetected} />
            <CommonIssuesCard items={commonIssues} />
          </div>
        </div>
      </main>
    </div>
  );
}
