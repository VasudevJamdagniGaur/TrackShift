"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { MapFiltersBar } from "@/components/map/map-filters";
import { SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { filterIssues } from "@/data/mock";
import type { IssueType, Severity } from "@/types";
import { issueTypeLabel, relativeTime } from "@/lib/utils";

export default function IssuesPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<IssueType | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const issues = useMemo(
    () => filterIssues({ query, type, severity }),
    [query, type, severity]
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 page-enter">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Road Issues
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Detected Infrastructure Issues
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Includes YOLO26s-classified Mapillary frames (Potholes, Cracks, Surface
          Damage) with annotated evidence images.
        </p>
      </div>

      <div className="mb-5 rounded-[1.25rem] border border-[var(--border)] bg-cream p-4">
        <MapFiltersBar
          query={query}
          type={type}
          severity={severity}
          onQueryChange={setQuery}
          onTypeChange={setType}
          onSeverityChange={setSeverity}
        />
      </div>

      <div className="grid gap-4">
        {issues.map((issue) => (
          <Link key={issue.id} href={`/issues/${issue.id}`}>
            <Card className="hover:border-gold/30">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={issue.evidenceImage}
                  alt=""
                  className="h-24 w-full rounded-2xl object-cover sm:h-20 sm:w-32"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-serif text-xl">
                      {issueTypeLabel(issue.type)}
                    </h2>
                    <SeverityBadge severity={issue.severity} />
                    <StatusBadge status={issue.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {issue.roadName} · {issue.area}, {issue.city}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {issue.id} · Confidence {Math.round(issue.confidence * 100)}%
                    · {relativeTime(issue.lastDetectedAt)} · {issue.sourceBus}
                  </p>
                </div>
                <span className="text-sm font-medium text-forest">
                  View details →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {issues.length === 0 && (
          <div className="rounded-[1.25rem] border border-dashed border-[var(--border-strong)] bg-cream px-6 py-16 text-center">
            <h3 className="font-serif text-2xl">No issues match these filters</h3>
            <p className="mt-2 text-sm text-muted">
              Try another city, severity or damage type.
            </p>
          </div>
        )}
      </div>
      </main>
    </div>
  );
}
