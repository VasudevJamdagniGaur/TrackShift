"use client";

import Link from "next/link";
import { Map as MapIcon, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { ForensicUpload } from "@/components/cctv/forensic-upload";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/ui/badge";
import { yoloDetectionsMeta, yoloIssues } from "@/data/yolo-issues";
import { ISSUE_FILTERS } from "@/lib/constants";
import { issueTypeLabel } from "@/lib/utils";
import type { IssueType } from "@/types";

const DEMO_CATEGORIES: IssueType[] = ["pothole", "crack", "surface_damage"];

export default function LiveDemoPage() {
  const byType = DEMO_CATEGORIES.map((type) => ({
    type,
    label: ISSUE_FILTERS.find((f) => f.id === type)?.label ?? issueTypeLabel(type),
    items: yoloIssues.filter((issue) => issue.type === type),
  }));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 page-enter">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
              <span className="live-pulse h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Demo
            </div>
            <h1 className="mt-1 font-serif text-3xl md:text-4xl">
              CCTV Forensic + Road Damage Demo
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Full every-frame helmet/plate forensic analysis (≤5 min), plus the
              existing Mapillary YOLO road-damage batch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="soft">
              <Link href="/map">
                <MapIcon className="h-4 w-4" />
                Open Map
              </Link>
            </Button>
            <Button asChild>
              <Link href="/issues">
                <Sparkles className="h-4 w-4" />
                Browse Issues
              </Link>
            </Button>
          </div>
        </div>

        <ForensicUpload />

        <div className="mb-3 mt-8">
          <h2 className="font-serif text-2xl">Sample Mapillary road-damage batch</h2>
          <p className="mt-1 text-sm text-muted">
            Pre-classified with{" "}
            <code className="rounded bg-beige-soft px-1.5 py-0.5 text-[11px]">
              {yoloDetectionsMeta.model}
            </code>
          </p>
        </div>

        <div className="space-y-8">
          {byType.map((group) => (
            <section key={group.type}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-xl">{group.label}</h3>
                <span className="text-xs text-muted">
                  {group.items.length} classified
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/issues/${issue.id}`}
                    className="group overflow-hidden rounded-[1.25rem] border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)] transition hover:border-gold/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={issue.evidenceImage}
                      alt=""
                      className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-serif text-lg">
                          {issueTypeLabel(issue.type)}
                        </span>
                        <SeverityBadge severity={issue.severity} />
                      </div>
                      <p className="text-sm text-muted">
                        {issue.roadName} · {issue.city}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
