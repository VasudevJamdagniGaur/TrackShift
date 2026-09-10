import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";

const pipeline = [
  "Camera",
  "Frame Processing",
  "Object / Damage Detection",
  "Classification",
  "GPS Association",
  "Road Segment Mapping",
  "Temporal Tracking",
  "Road Health Score",
  "Repair Priority",
];

export default function AIPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-14 md:px-6 page-enter">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          AI Intelligence
        </div>
        <h1 className="mt-2 font-serif text-5xl">
          From Frames to Repair Priority
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Hayagriva is designed as continuous infrastructure intelligence —
          detection is only one step in a longer civic workflow.
        </p>

        <div className="mt-10 space-y-3">
          {pipeline.map((step, index) => (
            <div key={step} className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-cream font-serif text-lg text-forest">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="flex-1 rounded-2xl border border-[var(--border)] bg-cream/80 px-5 py-4 shadow-[var(--shadow-soft)]">
                <div className="font-serif text-xl">{step}</div>
              </div>
              {index < pipeline.length - 1 && (
                <div className="hidden text-gold md:block">↓</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-[1.5rem] border border-[var(--border)] bg-beige-soft/50 p-6">
          <h2 className="font-serif text-2xl">Model readiness</h2>
          <p className="mt-2 text-sm text-muted">
            This prototype includes a local YOLO road-damage checkpoint under{" "}
            <code className="rounded bg-cream px-1.5 py-0.5 text-xs">
              models/YOLO26s_RDD_FRDC_Distilled_v2.pt
            </code>{" "}
            for future inference integration. The UI currently runs on a
            structured mock data layer so APIs can be plugged in without
            rewriting components.
          </p>
          <Button asChild className="mt-5">
            <Link href="/dashboard">Open Dashboard</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
