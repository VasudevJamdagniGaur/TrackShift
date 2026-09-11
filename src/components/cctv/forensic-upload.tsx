"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ForensicResultView,
  type ForensicJob,
  type ForensicViolation,
} from "@/components/cctv/forensic-result-view";

type Job = ForensicJob & {
  totalFrames?: number;
  processedFrames?: number;
  progressPercentage?: number;
  detections?: number;
  activeTracks?: number;
  candidateViolations?: number;
  confirmedViolations?: number;
  platesRead?: number;
  platesDetected?: number;
  motorcycles?: number;
  processingFps?: number;
  etaSeconds?: number | null;
  error?: string | null;
  gpu?: {
    name?: string;
    memoryAllocatedMb?: number;
    memoryReservedMb?: number;
  };
  profiling?: {
    totalSeconds?: number;
    stages?: Record<string, { seconds?: number; calls?: number; avgMs?: number }>;
  };
  summary?: ForensicJob["summary"] & {
    imgsz?: number;
    detectionInterval?: number;
  };
};

type Stats = {
  totalVideos: number;
  totalMotorcycles: number;
  totalPotentialViolations: number;
  totalConfirmedViolations: number;
  platesIdentified: number;
  platesUnreadable: number;
  processingJobs: number;
};

const ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-msvideo,.mp4,.webm,.mov,.avi,.mkv,.m4v";
const LAST_JOB_KEY = "cctv:lastJobId";

export function ForensicUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [violations, setViolations] = useState<ForensicViolation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/cctv/stats");
      const json = await res.json();
      setStats(json);
    } catch {
      // ignore
    }
  }, []);

  const loadViolations = useCallback(async (videoId: string) => {
    const res = await fetch(`/api/cctv/violations?videoId=${videoId}`);
    const json = await res.json();
    setViolations(json.violations || []);
  }, []);

  const loadJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/cctv/jobs/${jobId}`);
      if (!res.ok) return null;
      const next = (await res.json()) as Job;
      setJob(next);
      if (next.status === "COMPLETED" && next.videoId) {
        await loadViolations(next.videoId);
      }
      return next;
    },
    [loadViolations]
  );

  useEffect(() => {
    void refreshStats();
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(LAST_JOB_KEY)
        : null;
    if (saved) {
      void loadJob(saved);
    }
  }, [refreshStats, loadJob]);

  useEffect(() => {
    if (!job?.jobId) return;
    window.localStorage.setItem(LAST_JOB_KEY, job.jobId);
    if (job.status === "COMPLETED" || job.status === "FAILED") return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/cctv/jobs/${job.jobId}`);
        if (!res.ok) return;
        const next = (await res.json()) as Job;
        setJob(next);
        if (next.status === "COMPLETED") {
          await loadViolations(next.videoId);
          await refreshStats();
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status, loadViolations, refreshStats]);

  const onPick = useCallback((next: File | null) => {
    if (!next) return;
    if (
      !next.type.startsWith("video/") &&
      !/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(next.name)
    ) {
      setError("Please choose a video file (MP4, AVI, MOV, MKV, WEBM).");
      return;
    }
    if (next.size > 1024 * 1024 * 1024) {
      setError("Video must be under 1024 MB.");
      return;
    }
    setError(null);
    setFile(next);
    setJob(null);
    setViolations([]);
  }, []);

  const startAnalysis = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setViolations([]);
    try {
      const body = new FormData();
      body.append("video", file);
      const res = await fetch("/api/cctv/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error || "Maximum supported video duration is 5 minutes."
        );
      }
      window.localStorage.setItem(LAST_JOB_KEY, json.jobId);
      const jobRes = await fetch(`/api/cctv/jobs/${json.jobId}`);
      const jobJson = (await jobRes.json()) as Job;
      setJob(jobJson);
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [file, refreshStats]);

  const clear = () => {
    setFile(null);
    setJob(null);
    setViolations([]);
    setError(null);
    window.localStorage.removeItem(LAST_JOB_KEY);
    if (inputRef.current) inputRef.current.value = "";
  };

  const processing =
    job && (job.status === "QUEUED" || job.status === "PROCESSING");

  return (
    <section className="mb-8 overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)]">
      <div className="border-b border-[var(--border)] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-forest" />
          <h2 className="font-serif text-2xl">CCTV forensic analysis</h2>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            Every source frame · up to 5 minutes
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Upload traffic CCTV video. The system processes every native frame with
          ByteTrack, temporal helmet voting, best-frame plate OCR, and creates AI
          violation cases for review — not automatic challans.
        </p>
      </div>

      {stats && (
        <div className="grid gap-3 border-b border-[var(--border)] p-5 sm:grid-cols-3 lg:grid-cols-6 md:px-6">
          {[
            ["Videos", stats.totalVideos],
            ["Motorcycles", stats.totalMotorcycles],
            ["Potential", stats.totalPotentialViolations],
            ["Confirmed", stats.totalConfirmedViolations],
            ["Plates ID", stats.platesIdentified],
            ["Processing", stats.processingJobs],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 px-3 py-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted">
                {label}
              </div>
              <div className="mt-1 font-serif text-2xl">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4 p-5 md:p-6">
        {job?.status !== "COMPLETED" && (
          <>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onPick(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center transition",
                dragOver
                  ? "border-forest bg-beige-soft/80"
                  : "border-[var(--border-strong)] bg-beige-soft/40 hover:border-forest/40"
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-cream">
                <Upload className="h-5 w-5 text-forest" />
              </div>
              <div>
                <div className="text-sm font-medium">Drag & drop CCTV video</div>
                <div className="mt-1 text-xs text-muted">
                  MP4 / AVI / MOV / MKV / WEBM · max 5 minutes · max 1024 MB
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white/50 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={clear}>
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={startAnalysis}
                    disabled={uploading || !!processing}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      "Start forensic analysis"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {job && job.status !== "COMPLETED" && (
          <div className="rounded-2xl border border-[var(--border)] bg-beige-soft/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-serif text-xl">
                {job.status === "FAILED"
                  ? "Processing failed"
                  : "Processing video…"}
              </div>
              <span className="rounded-full border border-[var(--border)] bg-cream px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                {job.status}
              </span>
            </div>

            {job.metadata && (
              <p className="mt-2 text-sm text-muted">
                Duration: {job.metadata.durationSeconds?.toFixed?.(1) ?? "?"}s ·
                FPS: {job.metadata.fps ?? "?"} · Frames:{" "}
                {job.metadata.frameCount ?? job.totalFrames} · Pipeline: FULL
                FRAME ANALYSIS
              </p>
            )}

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-cream">
              <div
                className="h-full rounded-full bg-forest transition-all"
                style={{ width: `${job.progressPercentage ?? 0}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                Frames: {job.processedFrames ?? 0} / {job.totalFrames ?? 0}
              </div>
              <div>Progress: {job.progressPercentage ?? 0}%</div>
              <div>
                Processing FPS:{" "}
                {job.processingFps != null ? job.processingFps.toFixed(2) : "—"}
              </div>
              <div>
                ETA:{" "}
                {job.etaSeconds != null
                  ? `${Math.round(job.etaSeconds)}s`
                  : "—"}
              </div>
              <div>GPU: {job.gpu?.name || "—"}</div>
              <div>
                GPU mem:{" "}
                {job.gpu?.memoryAllocatedMb != null
                  ? `${job.gpu.memoryAllocatedMb} MB`
                  : "—"}
              </div>
              <div>Motorcycles: {job.motorcycles ?? 0}</div>
              <div>Active tracks: {job.activeTracks ?? 0}</div>
              <div>Potential no-helmet: {job.candidateViolations ?? 0}</div>
              <div>Confirmed: {job.confirmedViolations ?? 0}</div>
              <div>Plates read: {job.platesRead ?? 0}</div>
            </div>

            {job.profiling?.stages && (
              <div className="mt-3 grid gap-1 text-[11px] text-muted sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(job.profiling.stages).map(([name, stage]) => (
                  <div key={name}>
                    {name}: {stage.seconds?.toFixed?.(2) ?? 0}s
                    {stage.avgMs != null ? ` · avg ${stage.avgMs}ms` : ""}
                  </div>
                ))}
                {job.profiling.totalSeconds != null && (
                  <div className="font-medium text-charcoal">
                    total: {job.profiling.totalSeconds.toFixed(2)}s
                  </div>
                )}
              </div>
            )}

            {job.error && (
              <p className="mt-3 text-sm text-red-700">{job.error}</p>
            )}
          </div>
        )}

        {job?.status === "COMPLETED" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted">
                Job <span className="font-mono">{job.jobId}</span> completed
                {job.summary?.processingSeconds != null
                  ? ` · ${job.summary.processingSeconds.toFixed(1)}s analysis`
                  : ""}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void loadJob(job.jobId)}
                >
                  Refresh result
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={clear}>
                  Analyze another video
                </Button>
              </div>
            </div>
            <ForensicResultView
              key={`${job.jobId}-${job.updatedAt || job.annotatedVideoPath || "v"}`}
              job={job}
              violations={violations}
              onViolationsChange={setViolations}
            />
          </div>
        )}
      </div>
    </section>
  );
}
