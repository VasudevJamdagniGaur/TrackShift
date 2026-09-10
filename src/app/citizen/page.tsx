"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { RoadMapDynamic } from "@/components/map/road-map-dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/ui/badge";
import { areas, filterIssues, recentDetections, searchAreas } from "@/data/mock";
import { healthLabel, issueTypeLabel, relativeTime } from "@/lib/utils";

export default function CitizenPage() {
  const [query, setQuery] = useState("Sector 62, Noida");
  const [active, setActive] = useState("Sector 62");

  const area = useMemo(
    () => searchAreas(active)[0] ?? areas[0],
    [active]
  );
  const nearby = filterIssues({ query: area.name }).slice(0, 5);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 md:px-6 page-enter">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Citizen Portal
          </div>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">
            How are the roads around me?
          </h1>
          <p className="mt-3 text-muted">
            A simpler view of road health, nearby issues and recent detections.
            Demo data only.
          </p>
        </div>

        <form
          className="mt-8 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setActive(query);
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your area or road..."
          />
          <Button type="submit">Check Roads</Button>
        </form>

        <div className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{area.name}</CardTitle>
              <p className="text-sm text-muted">
                {area.city} · Last scanned {relativeTime(area.lastScanned)}
              </p>
            </CardHeader>
            <CardContent>
              <div className="font-serif text-6xl text-forest">
                {area.healthScore}
              </div>
              <div className="mt-1 text-muted">
                / 100 · {healthLabel(area.healthScore)}
              </div>
              <div className="mt-5 space-y-3">
                {nearby.map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/issues/${issue.id}`}
                    className="flex items-center justify-between rounded-2xl border border-[var(--border)] px-3 py-3 transition hover:bg-beige-soft/50"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {issueTypeLabel(issue.type)}
                      </div>
                      <div className="text-xs text-muted">{issue.roadName}</div>
                    </div>
                    <SeverityBadge severity={issue.severity} />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)]">
            <div className="h-[420px]">
              <RoadMapDynamic
                issues={nearby}
                focus={[area.latitude, area.longitude]}
                className="h-full w-full rounded-none"
              />
            </div>
          </div>
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Recent detections nearby</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {recentDetections.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border)] p-3 text-sm"
              >
                <div className="font-semibold">{issueTypeLabel(item.type)}</div>
                <div className="text-muted">{item.location}</div>
                <div className="mt-1 text-xs text-muted">
                  {relativeTime(item.detectedAt)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
