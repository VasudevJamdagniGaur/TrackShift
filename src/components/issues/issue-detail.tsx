"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IssueHistory, RoadIssue } from "@/types";
import {
  formatNumber,
  issueTypeLabel,
  relativeTime,
  severityColor,
} from "@/lib/utils";

export function IssueDetailView({
  issue,
  history,
}: {
  issue: RoadIssue;
  history?: IssueHistory;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
            Issue Detail
          </div>
          <h1 className="mt-1 font-serif text-3xl md:text-4xl">
            {issueTypeLabel(issue.type)}
          </h1>
          <p className="mt-1 text-muted">
            {issue.roadName} · {issue.area}, {issue.city}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SeverityBadge severity={issue.severity} />
          <StatusBadge status={issue.status} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={issue.evidenceImage}
                alt={`Evidence for ${issue.id}`}
                className="h-auto w-full object-cover"
              />
              <div className="absolute left-3 top-3 rounded-full bg-charcoal/75 px-3 py-1 text-xs text-cream">
                AI Confidence: {Math.round(issue.confidence * 100)}%
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => toast.success("Issue marked as verified")}
              >
                Verify Issue
              </Button>
              <Button
                variant="soft"
                onClick={() => toast.success("Issue marked as resolved")}
              >
                Mark Resolved
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast.message("Incorrect detection reported for review")
                }
              >
                Report Incorrect Detection
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Hayagriva is an AI assistant for infrastructure teams — final
              decisions remain with municipal authorities.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Attributes</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Issue ID", issue.id],
                ["Severity", issue.severity],
                ["AI Confidence", `${Math.round(issue.confidence * 100)}%`],
                ["GPS", `${issue.latitude.toFixed(4)}, ${issue.longitude.toFixed(4)}`],
                ["Road", issue.roadName],
                ["City", issue.city],
                ["Detected", relativeTime(issue.detectedAt)],
                ["Last detected", relativeTime(issue.lastDetectedAt)],
                ["Occurrences", formatNumber(issue.occurrenceCount)],
                ["Source", `${issue.sourceBus} · ${issue.sourceRoute}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-muted">{label}</div>
                  <div className="mt-1 font-medium capitalize text-charcoal">
                    {value}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {history && (
            <Card>
              <CardHeader>
                <CardTitle>Issue History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history.entries.map((entry) => (
                    <div key={entry.date} className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: severityColor(entry.severity) }}
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium capitalize">
                          {entry.severity}
                        </div>
                        <div className="text-xs text-muted">
                          {new Date(entry.date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                          })}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {history.degradationDetected && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="text-sm font-semibold text-amber-900">
                      Road degradation detected
                    </div>
                    <p className="mt-1 text-sm text-amber-900/80">
                      {history.summary}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
