"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  Pause,
  Play,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Seconds around a ticket timestamp considered "active" during playback. */
export const ACTIVE_TICKET_WINDOW = 1.0;

export type ForensicJob = {
  jobId: string;
  videoId: string;
  status: string;
  fileName?: string;
  updatedAt?: string;
  annotatedVideoUrl?: string | null;
  annotatedVideoPath?: string | null;
  summary?: {
    framesAnalyzed?: number;
    motorcycles?: number;
    noHelmetCandidates?: number;
    confirmedViolations?: number;
    needsReviewViolations?: number;
    licensePlatesRecognized?: number;
    platesDetected?: number;
    annotatedVideoUrl?: string | null;
    annotatedVideoPath?: string | null;
    processingSeconds?: number;
    processingFps?: number;
    roadDamage?: {
      roadEvents?: number;
      potholes?: number;
      cracks?: number;
      surfaceDamage?: number;
      byCategory?: Record<string, number>;
      byClass?: Record<string, number>;
    };
    analysisBranches?: string[];
  };
  roadEvents?: number;
  roadPotholes?: number;
  roadCracks?: number;
  metadata?: {
    fps?: number;
    durationSeconds?: number;
    frameCount?: number;
  };
};

export type ForensicViolation = {
  violationId: string;
  ticketId?: string;
  ticketNumber?: number;
  timestamp: number;
  frameNumber?: number;
  trackId: number;
  violationType: string;
  noHelmetConfidence: number;
  helmetConfidence?: number;
  plateText?: string | null;
  plateConfidence?: number;
  status: string;
  headCropPath?: string | null;
  plateCropPath?: string | null;
  annotatedEvidencePath?: string | null;
  primaryEvidencePath?: string | null;
  supportingFrames?: Array<{
    frameNumber: number;
    timestamp: number;
    path: string;
  }>;
};

export type RoadDamageEvent = {
  roadEventId: string;
  eventNumber?: number;
  timestamp: number;
  frameNumber?: number;
  classId: number;
  className: string;
  category: string;
  confidence: number;
  severity?: string;
  hitCount?: number;
  status?: string;
  cropPath?: string | null;
  evidencePath?: string | null;
  bbox?: number[];
};

type FilterKey = "ALL" | "CONFIRMED" | "NEEDS_REVIEW" | "REJECTED";
type SortKey = "time_asc" | "time_desc" | "conf_desc" | "conf_asc";

function formatTs(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function statusLabel(status: string) {
  if (status === "CONFIRMED" || status === "APPROVED") return "CONFIRMED";
  if (status === "REJECTED") return "REJECTED";
  return "NEEDS REVIEW";
}

function videoSrcForJob(job: ForensicJob) {
  const base =
    job.annotatedVideoUrl ||
    job.summary?.annotatedVideoUrl ||
    `/api/cctv/jobs/${job.jobId}/video`;
  // Bust browser cache after codec conversion / re-render
  const bust = job.updatedAt || job.summary?.annotatedVideoPath || "1";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(String(bust).slice(-24))}`;
}

export function ForensicResultView({
  job,
  violations: initialViolations,
  roadEvents: initialRoadEvents = [],
  onViolationsChange,
}: {
  job: ForensicJob;
  violations: ForensicViolation[];
  roadEvents?: RoadDamageEvent[];
  onViolationsChange?: (next: ForensicViolation[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ticketRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastScrolledId = useRef<string | null>(null);

  const [violations, setViolations] = useState(initialViolations);
  const [roadEvents, setRoadEvents] = useState(initialRoadEvents);
  const [panelTab, setPanelTab] = useState<"traffic" | "road">("traffic");
  const [roadFilter, setRoadFilter] = useState<
    "ALL" | "pothole" | "crack" | "surface_damage"
  >("ALL");
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(
    null
  );
  const [activeViolationId, setActiveViolationId] = useState<string | null>(
    null
  );
  const [activeRoadEventId, setActiveRoadEventId] = useState<string | null>(
    null
  );
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [sort, setSort] = useState<SortKey>("time_asc");
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [overlayTrack, setOverlayTrack] = useState<ForensicViolation | null>(
    null
  );

  useEffect(() => {
    setViolations(initialViolations);
  }, [initialViolations]);

  useEffect(() => {
    setRoadEvents(initialRoadEvents);
  }, [initialRoadEvents]);

  const counts = useMemo(() => {
    const confirmed = violations.filter(
      (v) => v.status === "CONFIRMED" || v.status === "APPROVED"
    ).length;
    const rejected = violations.filter((v) => v.status === "REJECTED").length;
    const needs = violations.length - confirmed - rejected;
    const platesOk = violations.filter((v) => !!v.plateText).length;
    return {
      total: violations.length,
      confirmed,
      needsReview: Math.max(0, needs),
      rejected,
      platesIdentified: platesOk,
      platesNotRead: Math.max(0, violations.length - platesOk),
    };
  }, [violations]);

  const filtered = useMemo(() => {
    let list = [...violations];
    if (filter === "CONFIRMED") {
      list = list.filter(
        (v) => v.status === "CONFIRMED" || v.status === "APPROVED"
      );
    } else if (filter === "NEEDS_REVIEW") {
      list = list.filter(
        (v) =>
          v.status === "NEEDS_REVIEW" ||
          v.status === "POTENTIAL" ||
          !["CONFIRMED", "APPROVED", "REJECTED"].includes(v.status)
      );
    } else if (filter === "REJECTED") {
      list = list.filter((v) => v.status === "REJECTED");
    }
    list.sort((a, b) => {
      if (sort === "time_asc") return a.timestamp - b.timestamp;
      if (sort === "time_desc") return b.timestamp - a.timestamp;
      if (sort === "conf_desc")
        return (b.noHelmetConfidence || 0) - (a.noHelmetConfidence || 0);
      return (a.noHelmetConfidence || 0) - (b.noHelmetConfidence || 0);
    });
    return list;
  }, [violations, filter, sort]);

  const findNearestTicket = useCallback(
    (t: number) => {
      let best: ForensicViolation | null = null;
      let bestDist = Infinity;
      for (const v of violations) {
        const d = Math.abs(v.timestamp - t);
        if (d <= ACTIVE_TICKET_WINDOW && d < bestDist) {
          best = v;
          bestDist = d;
        }
      }
      return best;
    },
    [violations]
  );

  const findNearestRoad = useCallback(
    (t: number) => {
      let best: RoadDamageEvent | null = null;
      let bestDist = Infinity;
      for (const e of roadEvents) {
        const d = Math.abs(e.timestamp - t);
        if (d <= ACTIVE_TICKET_WINDOW && d < bestDist) {
          best = e;
          bestDist = d;
        }
      }
      return best;
    },
    [roadEvents]
  );

  const syncFromTime = useCallback(
    (t: number) => {
      setCurrentVideoTime(t);
      const nearest = findNearestTicket(t);
      const nextId = nearest?.violationId ?? null;
      setActiveViolationId(nextId);
      setOverlayTrack(nearest);
      const roadNear = findNearestRoad(t);
      setActiveRoadEventId(roadNear?.roadEventId ?? null);
      if (nextId && nextId !== lastScrolledId.current && panelTab === "traffic") {
        lastScrolledId.current = nextId;
        const el = ticketRefs.current[nextId];
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      if (!nextId) {
        lastScrolledId.current = null;
      }
    },
    [findNearestTicket, findNearestRoad, panelTab]
  );

  const seekToTicket = useCallback((v: ForensicViolation, play = true) => {
    const video = videoRef.current;
    if (!video) return;
    setPanelTab("traffic");
    setSelectedViolationId(v.violationId);
    setActiveViolationId(v.violationId);
    video.currentTime = Math.max(0, v.timestamp);
    if (play) {
      void video.play().catch(() => undefined);
    }
  }, []);

  const seekToRoad = useCallback((e: RoadDamageEvent, play = true) => {
    const video = videoRef.current;
    if (!video) return;
    setPanelTab("road");
    setActiveRoadEventId(e.roadEventId);
    video.currentTime = Math.max(0, e.timestamp);
    if (play) {
      void video.play().catch(() => undefined);
    }
  }, []);

  const filteredRoad = useMemo(() => {
    let list = [...roadEvents];
    if (roadFilter !== "ALL") {
      list = list.filter((e) => e.category === roadFilter);
    }
    list.sort((a, b) => a.timestamp - b.timestamp);
    return list;
  }, [roadEvents, roadFilter]);

  const roadCounts = useMemo(() => {
    const rd = job.summary?.roadDamage;
    return {
      total: roadEvents.length || rd?.roadEvents || 0,
      potholes:
        roadEvents.filter((e) => e.category === "pothole").length ||
        rd?.potholes ||
        0,
      cracks:
        roadEvents.filter((e) => e.category === "crack").length || rd?.cracks || 0,
      surface:
        roadEvents.filter((e) => e.category === "surface_damage").length ||
        rd?.surfaceDamage ||
        0,
    };
  }, [roadEvents, job.summary?.roadDamage]);

  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const patchStatus = useCallback(
    async (v: ForensicViolation, status: "CONFIRMED" | "REJECTED" | "NEEDS_REVIEW") => {
      if (!v.violationId) {
        setReviewError("Missing violation id — cannot update ticket.");
        return;
      }
      setReviewError(null);
      setReviewingId(v.violationId);
      // Optimistic UI so review feels instant while watching
      const previous = v.status;
      setViolations((prev) => {
        const next = prev.map((x) =>
          x.violationId === v.violationId ? { ...x, status } : x
        );
        onViolationsChange?.(next);
        return next;
      });
      try {
        const res = await fetch(`/api/cctv/violations/${encodeURIComponent(v.violationId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const updated = (await res.json()) as ForensicViolation & { error?: string };
        if (!res.ok) {
          throw new Error(updated.error || `Update failed (${res.status})`);
        }
        setViolations((prev) => {
          const next = prev.map((x) =>
            x.violationId === updated.violationId ? { ...x, ...updated } : x
          );
          onViolationsChange?.(next);
          return next;
        });
      } catch (err) {
        // Roll back optimistic change
        setViolations((prev) => {
          const next = prev.map((x) =>
            x.violationId === v.violationId ? { ...x, status: previous } : x
          );
          onViolationsChange?.(next);
          return next;
        });
        setReviewError(
          err instanceof Error ? err.message : "Could not update ticket status"
        );
      } finally {
        setReviewingId(null);
      }
    },
    [onViolationsChange]
  );

  const activeTicket =
    violations.find((v) => v.violationId === activeViolationId) ||
    violations.find((v) => v.violationId === selectedViolationId) ||
    null;

  const evidence = evidenceId
    ? violations.find((v) => v.violationId === evidenceId)
    : null;

  const src = videoSrcForJob(job);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-forest">
            <ShieldAlert className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">
              Forensic video analysis
            </span>
          </div>
          <h3 className="mt-1 font-serif text-2xl md:text-3xl">
            {job.fileName || "Annotated review"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Red = confirmed no helmet · Orange = potential · Green = helmet ·
            Cyan/purple = road damage · Tickets sync with playback
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-[var(--border)] bg-cream px-3 py-1">
            {counts.total} Violations
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-900">
            {counts.confirmed} Confirmed
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
            {counts.needsReview} Needs review
          </span>
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-stone-800">
            {counts.rejected} Rejected
          </span>
          <span className="rounded-full border border-[var(--border)] bg-cream px-3 py-1">
            {counts.platesIdentified} Plates · {counts.platesNotRead} unread
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-900">
            {roadCounts.total} Road events
          </span>
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-900">
            {roadCounts.potholes} Potholes
          </span>
          <Button asChild size="sm" variant="soft">
            <a href={`/api/cctv/export?format=csv&videoId=${job.videoId}`}>
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={`/api/cctv/export?format=json&videoId=${job.videoId}`}>
              Export JSON
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={src} target="_blank" rel="noreferrer">
              Open video
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        {/* Video column */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-charcoal shadow-[var(--shadow-soft)]">
          <div className="relative aspect-video bg-black">
            <video
              ref={videoRef}
              className="h-full w-full"
              controls
              playsInline
              preload="metadata"
              src={src}
              onTimeUpdate={(e) => syncFromTime(e.currentTarget.currentTime)}
              onPlay={() => {
                setPlaying(true);
                setVideoError(null);
              }}
              onPause={() => setPlaying(false)}
              onSeeking={(e) => syncFromTime(e.currentTarget.currentTime)}
              onSeeked={(e) => syncFromTime(e.currentTarget.currentTime)}
              onEnded={() => {
                setPlaying(false);
                setActiveViolationId(null);
              }}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration || 0);
                setVideoError(null);
              }}
              onError={() => {
                setPlaying(false);
                setVideoError(
                  "This annotated video cannot be played in the browser (unsupported codec). Re-run analysis or wait for H.264 conversion."
                );
              }}
            />
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-red-200">
                {videoError}
              </div>
            )}
            {/* Top overlay — current violation context */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-3 py-2 text-[11px] text-white sm:text-xs">
              <div className="font-mono">
                Time {formatTs(currentVideoTime)}
                {duration > 0 ? ` / ${formatTs(duration)}` : ""}
              </div>
              {overlayTrack ? (
                <div className="text-right">
                  <div>
                    Track #{overlayTrack.trackId} ·{" "}
                    <span className="text-red-300">NO HELMET</span>{" "}
                    {Math.round((overlayTrack.noHelmetConfidence || 0) * 100)}%
                  </div>
                  {overlayTrack.plateText ? (
                    <div className="font-mono">{overlayTrack.plateText}</div>
                  ) : null}
                </div>
              ) : activeRoadEventId ? (
                <div className="text-right text-sky-200">
                  {roadEvents.find((e) => e.roadEventId === activeRoadEventId)
                    ?.className || "Road damage"}
                </div>
              ) : (
                <div className="text-white/70">No active event</div>
              )}
            </div>

            {activeViolationId && (
              <div className="pointer-events-none absolute bottom-14 left-3 rounded-md border border-red-400/60 bg-red-950/70 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-red-100">
                NO HELMET DETECTED
              </div>
            )}
            {!activeViolationId && activeRoadEventId && (
              <div className="pointer-events-none absolute bottom-14 left-3 rounded-md border border-sky-400/60 bg-sky-950/70 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sky-100">
                ROAD DAMAGE
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#1a1f1c] px-3 py-2 text-xs text-white/80">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 hover:bg-white/10"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) void v.play();
                  else v.pause();
                }}
              >
                {playing ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {playing ? "Pause" : "Play"}
              </button>
              <label className="inline-flex items-center gap-1">
                Speed
                <select
                  className="rounded border border-white/15 bg-transparent px-1 py-0.5"
                  defaultValue="1"
                  onChange={(e) => {
                    if (videoRef.current) {
                      videoRef.current.playbackRate = Number(e.target.value);
                    }
                  }}
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <option key={r} value={r} className="text-black">
                      {r}×
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="text-white/60">
              Native HTML5 controls · seek / volume / fullscreen supported
            </div>
          </div>

          {activeTicket && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-cream px-3 py-2.5">
              <div className="min-w-0 text-sm">
                <div className="font-medium">
                  Ticket #{String(activeTicket.ticketNumber ?? 0).padStart(3, "0")}{" "}
                  <span className="text-muted">
                    · {formatTs(activeTicket.timestamp)} ·{" "}
                    {statusLabel(activeTicket.status)}
                  </span>
                </div>
                <div className="truncate text-xs text-muted">
                  {activeTicket.plateText || "PLATE NOT READ"} · NO HELMET{" "}
                  {Math.round((activeTicket.noHelmetConfidence || 0) * 100)}%
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  disabled={reviewingId === activeTicket.violationId}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void patchStatus(activeTicket, "CONFIRMED");
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={reviewingId === activeTicket.violationId}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void patchStatus(activeTicket, "REJECTED");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
            </div>
          )}
          {reviewError && (
            <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {reviewError}
            </div>
          )}
        </div>

        {/* Ticket panel */}
        <div className="relative z-10 flex max-h-[min(78vh,820px)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPanelTab("traffic")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  panelTab === "traffic"
                    ? "border-forest bg-forest text-cream"
                    : "border-[var(--border)] bg-beige-soft/50 text-muted"
                )}
              >
                Traffic ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("road")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  panelTab === "road"
                    ? "border-forest bg-forest text-cream"
                    : "border-[var(--border)] bg-beige-soft/50 text-muted"
                )}
              >
                Road damage ({roadCounts.total})
              </button>
            </div>
            {panelTab === "traffic" ? (
              <>
            <div className="mt-2 font-serif text-xl">Violations</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["ALL", "All"],
                  ["CONFIRMED", "Confirmed"],
                  ["NEEDS_REVIEW", "Needs review"],
                  ["REJECTED", "Rejected"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    filter === key
                      ? "border-forest bg-forest text-cream"
                      : "border-[var(--border)] bg-beige-soft/50 text-muted hover:border-forest/40"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <ChevronDown className="h-3.5 w-3.5" />
              <select
                className="rounded-md border border-[var(--border)] bg-cream px-2 py-1"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="time_asc">Time ascending</option>
                <option value="time_desc">Time descending</option>
                <option value="conf_desc">Confidence highest</option>
                <option value="conf_asc">Confidence lowest</option>
              </select>
            </label>
              </>
            ) : (
              <>
                <div className="mt-2 font-serif text-xl">Road damage</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["ALL", "All"],
                      ["pothole", "Potholes"],
                      ["crack", "Cracks"],
                      ["surface_damage", "Alligator"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRoadFilter(key)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        roadFilter === key
                          ? "border-forest bg-forest text-cream"
                          : "border-[var(--border)] bg-beige-soft/50 text-muted hover:border-forest/40"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Detected with YOLO26s RDD on the same video decode as traffic.
                </p>
              </>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {panelTab === "road" ? (
              <>
                {filteredRoad.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-muted">
                    No road-damage events for this filter.
                  </div>
                )}
                {filteredRoad.map((e) => {
                  const active = e.roadEventId === activeRoadEventId;
                  return (
                    <div
                      key={e.roadEventId}
                      role="button"
                      tabIndex={0}
                      onClick={() => seekToRoad(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          seekToRoad(e);
                        }
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl border bg-white/70 p-3 text-left transition",
                        active
                          ? "border-sky-400 shadow-[0_0_0_1px_rgba(56,160,200,0.35)] ring-1 ring-sky-300/50"
                          : "border-[var(--border)] hover:border-forest/35"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                            Road damage
                          </div>
                          <div className="font-serif text-lg">
                            #{String(e.eventNumber ?? 0).padStart(3, "0")}
                          </div>
                        </div>
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-900">
                          {e.category.replace("_", " ")}
                        </span>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div>
                          <dt className="text-muted">Time</dt>
                          <dd className="font-mono">{formatTs(e.timestamp)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Confidence</dt>
                          <dd>{Math.round((e.confidence || 0) * 100)}%</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted">Class</dt>
                          <dd className="font-medium">{e.className}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Severity</dt>
                          <dd>{(e.severity || "—").toUpperCase()}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Hits</dt>
                          <dd>{e.hitCount ?? 1}</dd>
                        </div>
                      </dl>
                      {(e.cropPath || e.evidencePath) && (
                        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-beige-soft/60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={e.cropPath || e.evidencePath || ""}
                            alt=""
                            className="max-h-36 w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-muted">
                No tickets for this filter.
              </div>
            )}
            {filtered.map((v) => {
              const active =
                v.violationId === activeViolationId ||
                v.violationId === selectedViolationId;
              const busy = reviewingId === v.violationId;
              return (
                <div
                  key={v.violationId}
                  ref={(el) => {
                    ticketRefs.current[v.violationId] = el;
                  }}
                  className={cn(
                    "rounded-xl border bg-white/70 p-3 text-left transition",
                    active
                      ? "border-red-400 shadow-[0_0_0_1px_rgba(220,80,60,0.35)] ring-1 ring-red-300/50"
                      : "border-[var(--border)] hover:border-forest/35"
                  )}
                >
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    onClick={() => seekToTicket(v)}
                  >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        Traffic violation
                      </div>
                      <div className="font-serif text-lg">
                        Ticket #
                        {String(v.ticketNumber ?? 0).padStart(3, "0")}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        statusLabel(v.status) === "CONFIRMED" &&
                          "bg-emerald-50 text-emerald-800",
                        statusLabel(v.status) === "REJECTED" &&
                          "bg-stone-100 text-stone-700",
                        statusLabel(v.status) === "NEEDS REVIEW" &&
                          "bg-amber-50 text-amber-900"
                      )}
                    >
                      {statusLabel(v.status)}
                    </span>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-muted">Time</dt>
                      <dd className="font-mono">{formatTs(v.timestamp)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Confidence</dt>
                      <dd>{Math.round((v.noHelmetConfidence || 0) * 100)}%</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Violation</dt>
                      <dd className="font-medium text-red-700">NO HELMET</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Vehicle</dt>
                      <dd className="font-mono">
                        {v.plateText || "PLATE NOT READ"}
                      </dd>
                    </div>
                  </dl>
                  </button>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                        Rider
                      </div>
                      <div className="aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-beige-soft/60">
                        {v.headCropPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.headCropPath}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : v.primaryEvidencePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.primaryEvidencePath}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted">
                            No crop
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                        Number plate
                      </div>
                      <div className="aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-beige-soft/60">
                        {v.plateCropPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.plateCropPath}
                            alt=""
                            className="h-full w-full object-contain bg-white"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-muted">
                            PLATE NOT READ
                          </div>
                        )}
                      </div>
                      {v.plateText ? (
                        <div className="mt-1 text-[10px] text-muted">
                          OCR Confidence:{" "}
                          {Math.round((v.plateConfidence || 0) * 100)}%
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="soft"
                      disabled={busy || statusLabel(v.status) === "CONFIRMED"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void patchStatus(v, "CONFIRMED");
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {statusLabel(v.status) === "CONFIRMED" ? "Approved" : "Approve"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={statusLabel(v.status) === "REJECTED" ? "ghost" : "danger"}
                      disabled={busy || statusLabel(v.status) === "REJECTED"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void patchStatus(v, "REJECTED");
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      {statusLabel(v.status) === "REJECTED" ? "Rejected" : "Reject"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEvidenceId(v.violationId);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View evidence
                    </Button>
                  </div>
                </div>
              );
            })}
              </>
            )}
          </div>
        </div>
      </div>

      {evidence && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setEvidenceId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-cream p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-serif text-2xl">Evidence pack</div>
                <div className="text-sm text-muted">
                  {evidence.violationId} · Track #{evidence.trackId} ·{" "}
                  {formatTs(evidence.timestamp)}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEvidenceId(null)}
              >
                Close
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {evidence.annotatedEvidencePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={evidence.annotatedEvidencePath}
                  alt="Annotated evidence"
                  className="w-full rounded-xl border border-[var(--border)]"
                />
              )}
              {evidence.primaryEvidencePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={evidence.primaryEvidencePath}
                  alt="Primary frame"
                  className="w-full rounded-xl border border-[var(--border)]"
                />
              )}
            </div>
            <div className="mt-3 text-sm">
              <Link
                href={`/violations/${evidence.violationId}`}
                className="font-medium text-forest underline-offset-2 hover:underline"
              >
                Open full case page
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
