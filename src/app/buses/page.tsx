"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RoadMapDynamic } from "@/components/map/road-map-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buses, roadIssues } from "@/data/mock";
import { relativeTime } from "@/lib/utils";

export default function BusesPage() {
  return (
    <DashboardShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Mobile Road Intelligence
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Bus Monitoring
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every equipped bus is a mobile sensing node — scanning roads while
          serving passengers.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          {buses.map((bus) => (
            <Card key={bus.id}>
              <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_0.9fr]">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-2xl">{bus.number}</h2>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      <span className="live-pulse h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {bus.status === "scanning" ? "Scanning" : bus.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Route: {bus.routeFrom} → {bus.routeTo}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted">Distance</div>
                      <div className="font-semibold">{bus.distanceScannedKm} km</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Issues</div>
                      <div className="font-semibold">{bus.issuesDetected}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Last detection</div>
                      <div className="font-semibold">
                        {relativeTime(bus.lastDetection)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-40 overflow-hidden rounded-2xl border border-[var(--border)]">
                  <RoadMapDynamic
                    issues={roadIssues.filter((i) => i.city === bus.city).slice(0, 4)}
                    buses={[bus]}
                    focus={[bus.latitude, bus.longitude]}
                    className="h-full w-full rounded-none"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Network Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">
              Demo fleet activity across major Indian metros. Replace with live
              telematics and camera health feeds.
            </p>
            <div className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 p-4">
              Active scanning buses:{" "}
              <strong>
                {buses.filter((b) => b.status === "scanning").length}
              </strong>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 p-4">
              Combined distance today:{" "}
              <strong>
                {buses
                  .reduce((sum, bus) => sum + bus.distanceScannedKm, 0)
                  .toFixed(1)}{" "}
                km
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
