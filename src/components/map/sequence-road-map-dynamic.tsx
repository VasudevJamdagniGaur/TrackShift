"use client";

import dynamic from "next/dynamic";
import type { SequenceMapPoint } from "@/components/map/sequence-road-map";

const SequenceRoadMapInner = dynamic(
  () =>
    import("@/components/map/sequence-road-map").then(
      (mod) => mod.SequenceRoadMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-xs text-cream/60">
        Loading road map…
      </div>
    ),
  }
);

export function SequenceRoadMapDynamic(props: {
  points: SequenceMapPoint[];
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  return <SequenceRoadMapInner {...props} />;
}
