"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DetectionTrendCard } from "@/components/dashboard/detection-trend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cities, commonIssues, platformStats } from "@/data/mock";
import { formatNumber } from "@/lib/utils";

const severityData = [
  { name: "Low", value: 28 },
  { name: "Medium", value: 34 },
  { name: "High", value: 26 },
  { name: "Critical", value: 12 },
];

const colors = ["#C4A574", "#C07A2C", "#B42318", "#7F1D1D"];

export default function AnalyticsPage() {
  return (
    <DashboardShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Analytics
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Infrastructure Intelligence Insights
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Road Health (avg)", value: "72%" },
          {
            label: "Issues Detected",
            value: formatNumber(platformStats.issuesDetected),
          },
          {
            label: "Kilometers Scanned",
            value: formatNumber(platformStats.kilometersScanned),
          },
          { label: "Repair Resolution Rate", value: "61%" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="text-xs text-muted">{item.label}</div>
              <div className="mt-2 font-serif text-3xl">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <DetectionTrendCard />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Issue Severity Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={severityData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {severityData.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>City Comparison</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cities}>
                <CartesianGrid stroke="#e8e0d4" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="healthScore" name="Health Score" fill="#1B3A2F" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Issue Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {commonIssues.map((item) => (
              <div key={item.type} className="flex items-center gap-3 text-sm">
                <span className="w-32 text-muted">{item.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-beige">
                  <div
                    className="h-full rounded-full bg-forest"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <span className="w-12 text-right font-medium">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coverage Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-muted">Bus route coverage</div>
              <div className="mt-1 font-serif text-3xl">86%</div>
            </div>
            <div>
              <div className="text-muted">Detection confidence (avg)</div>
              <div className="mt-1 font-serif text-3xl">88%</div>
            </div>
            <div>
              <div className="text-muted">Road deterioration alerts</div>
              <div className="mt-1 font-serif text-3xl">142</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
