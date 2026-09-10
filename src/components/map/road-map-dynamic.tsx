"use client";

import dynamic from "next/dynamic";
import type { Bus, RoadIssue, RoadSegment } from "@/types";

const RoadMapInner = dynamic(
  () => import("@/components/map/road-map").then((mod) => mod.RoadMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.25rem] border border-[var(--border)] bg-beige-soft/50">
        <div className="text-sm text-muted">Loading map intelligence…</div>
      </div>
    ),
  }
);

export function RoadMapDynamic(props: {
  issues: RoadIssue[];
  segments?: RoadSegment[];
  buses?: Bus[];
  focus?: [number, number] | null;
  className?: string;
  onSelectIssue?: (issue: RoadIssue) => void;
}) {
  return <RoadMapInner {...props} />;
}
