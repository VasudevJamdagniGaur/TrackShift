"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SequenceRoadMapDynamic } from "@/components/map/sequence-road-map-dynamic";
import type { SequenceMapPoint } from "@/components/map/sequence-road-map";

type MapillaryImagePayload = {
  id: string;
  imageUrl: string;
  thumbUrl?: string;
  capturedAt?: string | null;
  compassAngle?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  sequenceId?: string | null;
};

export function MapillaryPhotoModal({
  open,
  imageId,
  roadName,
  onOpenChange,
}: {
  open: boolean;
  imageId: string | null;
  roadName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentId, setCurrentId] = useState<string | null>(imageId);
  const [data, setData] = useState<MapillaryImagePayload | null>(null);
  const [sequenceIds, setSequenceIds] = useState<string[]>([]);
  const [points, setPoints] = useState<SequenceMapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [sequenceLoading, setSequenceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classifyState, setClassifyState] = useState<{
    loading: boolean;
    error: string | null;
    categories: string[];
    detectionCount: number;
    evidenceImage: string | null;
  } | null>(null);

  useEffect(() => {
    if (open && imageId) {
      setCurrentId(imageId);
      setSequenceIds([]);
      setPoints([]);
    }
    if (!open) {
      setCurrentId(null);
      setData(null);
      setSequenceIds([]);
      setPoints([]);
      setError(null);
      setClassifyState(null);
    }
  }, [open, imageId]);

  useEffect(() => {
    if (!open || !currentId) return;

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/mapillary/image/${currentId}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Could not load street photo");
        }
        if (cancelled) return;

        const payload = json as MapillaryImagePayload;
        setData(payload);

        // Keep road map heading in sync with the active frame
        if (
          payload.latitude != null &&
          payload.longitude != null
        ) {
          setPoints((prev) => {
            if (prev.length === 0) return prev;
            return prev.map((p) =>
              p.id === payload.id
                ? {
                    ...p,
                    latitude: payload.latitude!,
                    longitude: payload.longitude!,
                    compassAngle: payload.compassAngle ?? p.compassAngle,
                  }
                : p
            );
          });
        }

        if (payload.sequenceId && points.length === 0) {
          setSequenceLoading(true);
          const seqRes = await fetch(
            `/api/mapillary/sequence/${encodeURIComponent(payload.sequenceId)}`,
            { signal: controller.signal }
          );
          const seqJson = await seqRes.json();
          if (seqRes.ok && !cancelled) {
            const nextPoints = (seqJson.points as SequenceMapPoint[]) ?? [];
            setPoints(nextPoints);
            setSequenceIds(
              nextPoints.map((p) => p.id).length
                ? nextPoints.map((p) => p.id)
                : ((seqJson.imageIds as string[]) ?? [])
            );
          }
          if (!cancelled) setSequenceLoading(false);
        }
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // points intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentId]);

  const index = useMemo(() => {
    if (!currentId || sequenceIds.length === 0) return -1;
    return sequenceIds.indexOf(currentId);
  }, [currentId, sequenceIds]);

  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < sequenceIds.length - 1;

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    setCurrentId(sequenceIds[index - 1]);
  }, [hasPrev, index, sequenceIds]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    setCurrentId(sequenceIds[index + 1]);
  }, [hasNext, index, sequenceIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  useEffect(() => {
    if (index < 0) return;
    const neighbors = [sequenceIds[index - 1], sequenceIds[index + 1]].filter(
      Boolean
    ) as string[];
    for (const id of neighbors) {
      void fetch(`/api/mapillary/image/${id}`);
    }
  }, [index, sequenceIds]);

  useEffect(() => {
    setClassifyState(null);
  }, [currentId]);

  const runClassify = useCallback(async () => {
    if (!data?.imageUrl || !data.id) return;
    setClassifyState({
      loading: true,
      error: null,
      categories: [],
      detectionCount: 0,
      evidenceImage: null,
    });
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapillaryImageId: data.id,
          imageUrl: data.imageUrl,
          latitude: data.latitude,
          longitude: data.longitude,
          roadName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Classification failed");
      }
      const firstEvidence =
        (json.detections as { evidenceImage?: string }[] | undefined)?.[0]
          ?.evidenceImage ?? null;
      setClassifyState({
        loading: false,
        error: null,
        categories: (json.categories as string[]) ?? [],
        detectionCount: Number(json.detectionCount ?? 0),
        evidenceImage: firstEvidence,
      });
    } catch (err) {
      setClassifyState({
        loading: false,
        error: err instanceof Error ? err.message : "Classification failed",
        categories: [],
        detectionCount: 0,
        evidenceImage: null,
      });
    }
  }, [data, roadName]);

  const displayImage =
    classifyState?.evidenceImage && classifyState.detectionCount > 0
      ? classifyState.evidenceImage
      : data?.imageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1100px,96vw)] overflow-hidden p-0">
        <DialogHeader className="px-6 py-5">
          <DialogTitle>Street photography</DialogTitle>
          <p className="text-sm text-muted">
            {roadName ? `${roadName} · ` : ""}
            Full road sequence
            {sequenceIds.length > 0 && index >= 0
              ? ` · frame ${index + 1} / ${sequenceIds.length}`
              : ""}
          </p>
        </DialogHeader>

        <div className="bg-[#1a1a18] px-4 pb-4 pt-2 md:px-6 md:pb-6">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              {loading && !data && (
                <div className="flex h-[min(52vh,480px)] items-center justify-center text-sm text-cream/70">
                  Loading street photo…
                </div>
              )}
              {error && !data && !loading && (
                <div className="flex h-[min(40vh,360px)] flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm text-cream/80">{error}</p>
                  <Button variant="soft" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                </div>
              )}
              {data && displayImage && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayImage}
                    alt={`Mapillary street photo ${data.id}`}
                    className="max-h-[min(58vh,560px)] w-full object-contain"
                  />
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-xs text-cream/80">
                      Moving to next location…
                    </div>
                  )}
                </>
              )}

              {sequenceIds.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous location"
                    disabled={!hasPrev || loading}
                    onClick={goPrev}
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-charcoal/70 text-cream shadow-lg transition hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next location"
                    disabled={!hasNext || loading}
                    onClick={goNext}
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-charcoal/70 text-cream shadow-lg transition hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            <div className="flex min-h-[260px] flex-col gap-3">
              <div className="text-xs text-cream/70">
                {sequenceLoading
                  ? "Loading whole-road Mapillary coverage…"
                  : `${points.length} capture points along this road`}
              </div>
              <div className="min-h-[240px] flex-1">
                <SequenceRoadMapDynamic
                  points={points}
                  currentId={currentId}
                  onSelect={setCurrentId}
                />
              </div>
              <p className="text-[11px] text-cream/50">
                Green dots = every photo on this sequence. Amber marker = current
                camera position and heading. Next moves to the immediate next
                capture along the road.
              </p>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-cream/90">
                    YOLO26s road damage
                  </div>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    disabled={!data || classifyState?.loading}
                    onClick={runClassify}
                  >
                    {classifyState?.loading ? "Classifying…" : "Classify frame"}
                  </Button>
                </div>
                {classifyState?.error && (
                  <p className="mt-2 text-xs text-red-300">{classifyState.error}</p>
                )}
                {classifyState && !classifyState.loading && !classifyState.error && (
                  <p className="mt-2 text-xs text-cream/75">
                    {classifyState.detectionCount === 0
                      ? "No damage detected in this frame (Potholes / Cracks / Surface Damage)."
                      : `${classifyState.detectionCount} detection(s) → ${classifyState.categories
                          .map((c) =>
                            c === "surface_damage"
                              ? "Surface Damage"
                              : c === "pothole"
                                ? "Potholes"
                                : c === "crack"
                                  ? "Cracks"
                                  : c
                          )
                          .join(", ")}`}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-cream/45">
                  Manhole & Road Markings are UI filters only — this model detects
                  D00/D10/D20/D40 damage classes.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cream/70">
              {data && (
                <>
                  <span>Image ID {data.id}</span>
                  {data.capturedAt && (
                    <span>
                      Captured{" "}
                      {new Date(data.capturedAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                  {data.compassAngle != null && (
                    <span>Heading {Math.round(data.compassAngle)}°</span>
                  )}
                  {data.latitude != null && data.longitude != null && (
                    <span>
                      {data.latitude.toFixed(5)}, {data.longitude.toFixed(5)}
                    </span>
                  )}
                </>
              )}
            </div>

            {sequenceIds.length > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  disabled={!hasPrev || loading}
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous location
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  disabled={!hasNext || loading}
                  onClick={goNext}
                >
                  Next location
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
