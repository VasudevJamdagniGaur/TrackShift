"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cities, sampleReport } from "@/data/mock";
import { formatNumber } from "@/lib/utils";

export default function ReportsPage() {
  const [city, setCity] = useState(sampleReport.city);
  const [generated, setGenerated] = useState(false);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 page-enter">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Reports
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Weekly Road Condition Report
        </h1>
      </div>

      <Card className="mb-5">
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1.5 block text-muted">City</span>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-cream px-3"
            >
              {cities.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-muted">Period</span>
            <input
              defaultValue={sampleReport.periodLabel}
              className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-cream px-3"
            />
          </label>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => {
                setGenerated(true);
                toast.success("Report generated (demo simulation)");
              }}
            >
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {generated && (
        <Card className="page-enter">
          <CardHeader>
            <CardTitle>
              {city} · {sampleReport.periodLabel}
            </CardTitle>
            <p className="text-sm text-muted">Frontend simulation · Demo data</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Kilometers scanned", sampleReport.kilometersScanned],
                ["Issues detected", sampleReport.issuesDetected],
                ["Critical issues", sampleReport.criticalIssues],
                ["New issues", sampleReport.newIssues],
                ["Resolved issues", sampleReport.resolvedIssues],
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
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="font-serif text-xl">Worst road segments</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {sampleReport.worstSegments.map((segment) => (
                    <li
                      key={segment}
                      className="rounded-xl border border-[var(--border)] px-3 py-2"
                    >
                      {segment}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-serif text-xl">Recommended repairs</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {sampleReport.recommendedRepairs.map((item) => (
                    <li
                      key={item}
                      className="rounded-xl border border-[var(--border)] px-3 py-2"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      </main>
    </div>
  );
}
