"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/ui/badge";
import type { Detection } from "@/types";
import { issueTypeLabel, relativeTime } from "@/lib/utils";

export function RecentDetectionsCard({ items }: { items: Detection[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Detections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/issues/${item.issueId}`}
            className="flex items-center gap-3 rounded-2xl border border-transparent p-2 transition hover:border-[var(--border)] hover:bg-beige-soft/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail}
              alt=""
              className="h-12 w-16 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {issueTypeLabel(item.type)}
              </div>
              <div className="truncate text-xs text-muted">{item.location}</div>
              <div className="mt-0.5 text-[11px] text-muted">
                {relativeTime(item.detectedAt)}
              </div>
            </div>
            <SeverityBadge severity={item.severity} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
