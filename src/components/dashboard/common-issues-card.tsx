"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommonIssueStat } from "@/types";
import { CircleDot, Construction, Grid2X2, AlertTriangle, MoreHorizontal } from "lucide-react";

const icons = {
  pothole: CircleDot,
  crack: Construction,
  surface_damage: Grid2X2,
  manhole: AlertTriangle,
  other: MoreHorizontal,
  road_marking: MoreHorizontal,
  debris: MoreHorizontal,
  broken_section: MoreHorizontal,
} as const;

const colors = ["#1B3A2F", "#B8975A", "#C07A2C", "#6B6760", "#8A6D2F"];

export function CommonIssuesCard({ items }: { items: CommonIssueStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Most Common Issues</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => {
          const Icon = icons[item.type] ?? MoreHorizontal;
          return (
            <div key={item.type} className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: `${colors[index]}18`, color: colors[index] }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted">{item.percentage}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-beige">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.percentage}%`,
                      background: colors[index],
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
