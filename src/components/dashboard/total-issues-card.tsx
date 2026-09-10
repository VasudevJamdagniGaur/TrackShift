"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

const spark = [
  { d: "1", v: 88 },
  { d: "2", v: 92 },
  { d: "3", v: 90 },
  { d: "4", v: 97 },
  { d: "5", v: 101 },
  { d: "6", v: 108 },
  { d: "7", v: 112 },
];

export function TotalIssuesCard({ total }: { total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Total Issues Detected</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-serif text-4xl tracking-tight text-charcoal">
          {formatNumber(total)}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            ↑ 12%
          </span>
          <span className="text-muted">compared to last month</span>
        </div>
        <div className="mt-4 h-16">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1B3A2F" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1B3A2F" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="d" hide />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgba(44,44,42,0.1)",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke="#1B3A2F"
                fill="url(#sparkFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
