"use client";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RoadMapDynamic } from "@/components/map/road-map-dynamic";
import { RoadHealthCard } from "@/components/dashboard/road-health-card";
import { TotalIssuesCard } from "@/components/dashboard/total-issues-card";
import { CommonIssuesCard } from "@/components/dashboard/common-issues-card";
import { RecentDetectionsCard } from "@/components/dashboard/recent-detections";
import { DetectionTrendCard } from "@/components/dashboard/detection-trend";
import { RepairPriorityCard } from "@/components/dashboard/repair-priority";
import {
  commonIssues,
  healthBreakdown,
  platformStats,
  recentDetections,
  repairPriorities,
  roadIssues,
  roadSegments,
} from "@/data/mock";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Operations Dashboard
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-4xl">
            Road Intelligence Overview
          </h1>
          <p className="mt-1 text-sm text-muted">
            Demo monitoring data across Noida, Delhi, Bengaluru, Mumbai,
            Hyderabad and Pune.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
          <span className="live-pulse h-2 w-2 rounded-full bg-emerald-500" />
          Live Monitoring
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-muted">
            Live Map · Issue markers · Road segments
          </div>
          <div className="h-[460px]">
            <RoadMapDynamic
              issues={roadIssues}
              segments={roadSegments}
              className="h-full w-full rounded-none"
            />
          </div>
        </div>
        <div className="space-y-5">
          <RoadHealthCard score={72} breakdown={healthBreakdown} />
          <TotalIssuesCard total={platformStats.issuesDetected} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <CommonIssuesCard items={commonIssues} />
        <div className="xl:col-span-2">
          <RecentDetectionsCard items={recentDetections} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <DetectionTrendCard />
        <RepairPriorityCard items={repairPriorities} />
      </div>
    </DashboardShell>
  );
}
