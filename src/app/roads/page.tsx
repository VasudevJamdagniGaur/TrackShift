"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RoadMapDynamic } from "@/components/map/road-map-dynamic";
import { RepairPriorityCard } from "@/components/dashboard/repair-priority";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  areas,
  filterIssues,
  repairPriorities,
  roadSegments,
  searchAreas,
} from "@/data/mock";
import { formatNumber, healthLabel, relativeTime } from "@/lib/utils";

function RoadsContent() {
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") || "Sector 62";
  const [query, setQuery] = useState(initial);
  const [activeQuery, setActiveQuery] = useState(initial);

  const matches = useMemo(() => searchAreas(activeQuery), [activeQuery]);
  const area = matches[0] ?? areas[0];
  const issues = filterIssues({ query: area.name });

  return (
    <>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Road Health
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Search City, Area, Road or Pincode
        </h1>
      </div>

      <form
        className="mb-5 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setActiveQuery(query);
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Sector 62, Noida"
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{area.name} Road Health</CardTitle>
            <p className="text-sm text-muted">
              {area.city} · PIN {area.pincode}
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="font-serif text-6xl text-forest">
                {area.healthScore}
              </div>
              <div className="pb-2 text-muted">
                / 100 · {healthLabel(area.healthScore)}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ["Roads monitored", area.totalRoads],
                ["Potholes", area.potholes],
                ["Cracks", area.cracks],
                ["Critical sections", area.criticalSections],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 p-4"
                >
                  <div className="text-xs text-muted">{label}</div>
                  <div className="mt-1 font-serif text-2xl">
                    {formatNumber(Number(value))}
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 p-4 md:col-span-2">
                <div className="text-xs text-muted">Last scanned</div>
                <div className="mt-1 font-serif text-2xl">
                  {relativeTime(area.lastScanned)}
                </div>
              </div>
            </div>
            <div className="mt-5 h-[360px] overflow-hidden rounded-2xl border border-[var(--border)]">
              <RoadMapDynamic
                issues={issues}
                segments={roadSegments.filter((s) => s.area === area.name || s.city === area.city)}
                focus={[area.latitude, area.longitude]}
                className="h-full w-full rounded-none"
              />
            </div>
          </CardContent>
        </Card>
        <RepairPriorityCard items={repairPriorities} />
      </div>
    </>
  );
}

export default function RoadsPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<div className="skeleton h-40 w-full" />}>
        <RoadsContent />
      </Suspense>
    </DashboardShell>
  );
}
