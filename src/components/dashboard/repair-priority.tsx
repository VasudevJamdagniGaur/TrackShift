"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepairPriorityItem } from "@/types";
import { cn } from "@/lib/utils";

export function RepairPriorityCard({ items }: { items: RepairPriorityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repair Priority</CardTitle>
        <p className="text-sm text-muted">
          Weighted scoring across severity, traffic exposure, recurrence and
          deterioration — replaceable with an ML model later.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.slice(0, 5).map((item) => (
          <div
            key={item.segmentId}
            className={cn(
              "rounded-2xl border border-[var(--border)] p-4",
              item.rank === 1 && "bg-gradient-to-br from-beige-soft/80 to-cream"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Priority #{item.rank}
                </div>
                <div className="mt-1 font-serif text-xl text-charcoal">
                  {item.roadName}
                </div>
                <div className="text-xs text-muted">
                  {item.area}, {item.city}
                </div>
              </div>
              <div className="text-right">
                <div className="font-serif text-3xl text-forest">{item.score}</div>
                <div className="text-[11px] text-muted">/ 100</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-beige-soft px-2.5 py-1 text-[11px] text-charcoal-soft"
                >
                  {reason}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted">
                Estimated impact:{" "}
                <strong className="capitalize text-charcoal">
                  {item.estimatedImpact}
                </strong>
              </span>
              <Link
                href={`/roads?q=${encodeURIComponent(item.area)}`}
                className="font-medium text-forest hover:underline"
              >
                View segment →
              </Link>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
