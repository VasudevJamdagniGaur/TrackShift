"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TREND_RANGES } from "@/lib/constants";
import { analyticsTrends } from "@/data/mock";
import { cn, formatNumber } from "@/lib/utils";

export function DetectionTrendCard() {
  const [range, setRange] = useState<(typeof TREND_RANGES)[number]["id"]>("30d");
  const data = analyticsTrends[range];

  const summary = useMemo(() => {
    const total = data.reduce((s, d) => s + d.total, 0);
    const potholes = data.reduce((s, d) => s + d.potholes, 0);
    const cracks = data.reduce((s, d) => s + d.cracks, 0);
    const surfaceDamage = data.reduce((s, d) => s + d.surfaceDamage, 0);
    return { total, potholes, cracks, surfaceDamage };
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Detection Trend</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {TREND_RANGES.map((item) => (
            <button
              key={item.id}
              onClick={() => setRange(item.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition",
                range === item.id
                  ? "bg-forest text-cream"
                  : "bg-beige-soft text-muted hover:text-charcoal"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="#e8e0d4" strokeDasharray="4 4" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#6b6760" }}
                tickFormatter={(v) =>
                  String(v).startsWith("W") ? v : String(v).slice(5)
                }
              />
              <YAxis tick={{ fontSize: 11, fill: "#6b6760" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgba(44,44,42,0.1)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#1B3A2F"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="potholes"
                name="Potholes"
                stroke="#B8975A"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cracks"
                name="Cracks"
                stroke="#C07A2C"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total Issues", value: summary.total },
            { label: "Potholes", value: summary.potholes },
            { label: "Cracks", value: summary.cracks },
            { label: "Surface Damage", value: summary.surfaceDamage },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 px-4 py-3"
            >
              <div className="text-xs text-muted">{item.label}</div>
              <div className="mt-1 font-serif text-2xl">{formatNumber(item.value)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
