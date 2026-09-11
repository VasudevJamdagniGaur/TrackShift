"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";

type Violation = {
  violationId: string;
  videoId: string;
  trackId: number;
  timestamp: number;
  frameNumber: number;
  violationType: string;
  helmetConfidence: number;
  noHelmetConfidence: number;
  temporalConfidence: number;
  plateText?: string | null;
  plateConfidence?: number;
  plateStatus?: string;
  status: string;
  primaryEvidencePath?: string;
  annotatedEvidencePath?: string;
  headCropPath?: string;
  plateCropPath?: string | null;
  caseType?: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  temporalStats?: Record<string, unknown>;
};

function formatTs(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

export default function ViolationDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Violation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/cctv/violations/${params.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Not found");
        return;
      }
      setData(json);
    }
    void load();
  }, [params.id]);

  async function review(status: "APPROVED" | "REJECTED" | "NEEDS_REVIEW") {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cctv/violations/${data.violationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8 page-enter">
        <Link href="/live-demo" className="text-sm text-forest hover:underline">
          ← Back to Live Demo
        </Link>
        <h1 className="mt-3 font-serif text-3xl md:text-4xl">
          AI Detected Violation Case
        </h1>
        <p className="mt-2 text-sm text-muted">
          Review evidence before any real ticket / challan workflow.
        </p>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        {!data && !error && (
          <p className="mt-6 text-sm text-muted">Loading violation…</p>
        )}

        {data && (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              {data.annotatedEvidencePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.annotatedEvidencePath}
                  alt="Annotated evidence"
                  className="w-full rounded-[1.25rem] border border-[var(--border)] object-cover"
                />
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {data.primaryEvidencePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.primaryEvidencePath}
                    alt="Primary"
                    className="h-32 w-full rounded-2xl object-cover"
                  />
                )}
                {data.headCropPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.headCropPath}
                    alt="Head crop"
                    className="h-32 w-full rounded-2xl object-cover"
                  />
                )}
                {data.plateCropPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.plateCropPath}
                    alt="Plate crop"
                    className="h-32 w-full rounded-2xl object-contain bg-cream"
                  />
                )}
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-[var(--border)] bg-cream p-5 shadow-[var(--shadow-soft)]">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
                {data.caseType || "AI_DETECTED_VIOLATION_CASE"}
              </div>
              <h2 className="mt-2 font-serif text-2xl">{data.violationType}</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Time</dt>
                  <dd className="font-mono">{formatTs(data.timestamp)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Frame</dt>
                  <dd>{data.frameNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Track</dt>
                  <dd>#{data.trackId}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Vehicle / plate</dt>
                  <dd className="font-mono">{data.plateText || "UNREADABLE"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">No-helmet conf</dt>
                  <dd>{Math.round(data.noHelmetConfidence * 100)}%</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Helmet conf</dt>
                  <dd>{Math.round(data.helmetConfidence * 100)}%</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Plate conf</dt>
                  <dd>
                    {data.plateText
                      ? `${Math.round((data.plateConfidence || 0) * 100)}%`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Status</dt>
                  <dd className="font-semibold">{data.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">GPS</dt>
                  <dd>
                    {data.gpsLatitude != null && data.gpsLongitude != null
                      ? `${data.gpsLatitude}, ${data.gpsLongitude}`
                      : "Not available"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => review("APPROVED")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  disabled={saving}
                  onClick={() => review("NEEDS_REVIEW")}
                >
                  Needs review
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={saving}
                  onClick={() => review("REJECTED")}
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
