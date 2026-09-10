"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthBreakdown } from "@/types";

export function RoadHealthCard({
  score,
  breakdown,
}: {
  score: number;
  breakdown: HealthBreakdown;
}) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Road Health Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="relative h-36 w-36">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="#e8e0d4"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="#1B3A2F"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-serif text-4xl text-charcoal">{score}%</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">Roads in Good Condition</p>
        </div>
        <div className="mt-5 space-y-2.5">
          {[
            { label: "Good", value: breakdown.good, color: "bg-forest" },
            { label: "Moderate", value: breakdown.moderate, color: "bg-gold" },
            { label: "Poor", value: breakdown.poor, color: "bg-warning" },
            { label: "Critical", value: breakdown.critical, color: "bg-danger" },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
              <span className="flex-1 text-muted">{row.label}</span>
              <span className="font-medium">{row.value}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
