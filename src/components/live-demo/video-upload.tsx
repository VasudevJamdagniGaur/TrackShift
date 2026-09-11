"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Radio,
  ShieldAlert,
  Ticket,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LiveDetection = {
  id: string;
  label: "helmet" | "no_helmet" | string;
  confidence: number;
  cx: number;
  cy: number;
  radius: number;
  box: number[];
  color: string;
};

type HelmetTicket = {
  id: string;
  violation: string;
  status: string;
  numberPlate: string;
  plateConfidence: number;
  helmetConfidence: number;
  timestampSec: number;
  evidenceImage: string;
  riderImage: string;
  plateImage?: string | null;
};

const ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-msvideo,.mp4,.webm,.mov,.avi,.mkv,.m4v";

export function LiveDemoVideoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);
  const busyRef = useRef(false);
  const liveRef = useRef(false);
  const detectionsRef = useRef<LiveDetection[]>([]);
  const frameSizeRef = useRef({ width: 1, height: 1 });
  const rafRef = useRef<number | null>(null);
  const ticketKeysRef = useRef<Set<string>>(new Set());

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [live, setLive] = useState(false);
  const [warming, setWarming] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<LiveDetection[]>([]);
  const [tickets, setTickets] = useState<HelmetTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Upload a video to begin live CCTV view");

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    detectionsRef.current = detections;
  }, [detections]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clearOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const srcW = frameSizeRef.current.width || video.videoWidth || 1;
    const srcH = frameSizeRef.current.height || video.videoHeight || 1;
    const scale = Math.min(cssW / srcW, cssH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const ox = (cssW - drawW) / 2;
    const oy = (cssH - drawH) / 2;

    for (const det of detectionsRef.current) {
      const x = ox + (det.cx / srcW) * drawW;
      const y = oy + (det.cy / srcH) * drawH;
      const r = Math.max(14, (det.radius / srcW) * drawW);
      const color = det.label === "helmet" ? "#22c55e" : "#ef4444";

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      const tag = det.label === "helmet" ? "HELMET" : "NO HELMET";
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      const tw = ctx.measureText(tag).width;
      const tx = x - tw / 2 - 6;
      const ty = y - r - 18;
      ctx.fillStyle = "rgba(20,20,18,0.78)";
      ctx.fillRect(tx, ty, tw + 12, 18);
      ctx.fillStyle = color;
      ctx.fillText(tag, tx + 6, ty + 13);
    }
  }, []);

  useEffect(() => {
    const loop = () => {
      drawOverlay();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawOverlay]);

  const stopLive = useCallback(() => {
    setLive(false);
    liveRef.current = false;
    busyRef.current = false;
    setDetecting(false);
    setWarming(false);
    setDetections([]);
    clearOverlay();
    setStatusText("Live detection stopped");
    const video = videoRef.current;
    if (video) video.pause();
  }, [clearOverlay]);

  const clearFile = useCallback(() => {
    stopLive();
    setFile(null);
    setTickets([]);
    setSelectedId(null);
    setError(null);
    ticketKeysRef.current.clear();
    setStatusText("Upload a video to begin live CCTV view");
    if (inputRef.current) inputRef.current.value = "";
  }, [stopLive]);

  const onPick = useCallback(
    (next: File | null) => {
      if (!next) return;
      if (
        !next.type.startsWith("video/") &&
        !/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(next.name)
      ) {
        setError("Please choose a video file (mp4, webm, mov, …).");
        return;
      }
      if (next.size > 1024 * 1024 * 1024) {
        setError("Video must be under 1024 MB for this demo.");
        return;
      }
      stopLive();
      setError(null);
      setTickets([]);
      setSelectedId(null);
      ticketKeysRef.current.clear();
      setFile(next);
      setStatusText("Ready — press Start live CCTV");
    },
    [stopLive]
  );

  const captureAndDetect = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    if (busyRef.current || !liveRef.current) return;

    busyRef.current = true;
    setDetecting(true);

    try {
      if (!captureRef.current) {
        captureRef.current = document.createElement("canvas");
      }
      const capture = captureRef.current;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      // Downscale for faster inference while keeping aspect
      const maxSide = 960;
      const scale = Math.min(1, maxSide / Math.max(vw, vh));
      const cw = Math.max(1, Math.round(vw * scale));
      const ch = Math.max(1, Math.round(vh * scale));
      capture.width = cw;
      capture.height = ch;
      const ctx = capture.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, cw, ch);

      const blob = await new Promise<Blob | null>((resolve) =>
        capture.toBlob((b) => resolve(b), "image/jpeg", 0.72)
      );
      if (!blob || !liveRef.current) return;

      const body = new FormData();
      body.append("frame", blob, "frame.jpg");
      body.append("timestampSec", String(video.currentTime || 0));
      body.append("saveTicket", "1");

      const res = await fetch("/api/detect/helmet-frame", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Live detection failed");
      }

      frameSizeRef.current = {
        width: Number(json.width || cw),
        height: Number(json.height || ch),
      };

      const nextDets = (json.detections as LiveDetection[]) || [];
      setDetections(nextDets);
      detectionsRef.current = nextDets;

      const helmetCount = nextDets.filter((d) => d.label === "helmet").length;
      const noHelmetCount = nextDets.filter((d) => d.label === "no_helmet").length;
      setStatusText(
        `Live · ${nextDets.length} people · ${helmetCount} green · ${noHelmetCount} red`
      );

      const newTickets = (json.tickets as HelmetTicket[]) || [];
      if (newTickets.length) {
        setTickets((prev) => {
          const merged = [...prev];
          for (const ticket of newTickets) {
            const key = `${Math.round(ticket.timestampSec)}-${Math.round(
              ticket.helmetConfidence * 100
            )}`;
            if (ticketKeysRef.current.has(key)) continue;
            ticketKeysRef.current.add(key);
            merged.unshift(ticket);
          }
          return merged.slice(0, 40);
        });
        setSelectedId((curr) => curr ?? newTickets[0]?.id ?? null);
      }
    } catch (err) {
      if (liveRef.current) {
        setError(err instanceof Error ? err.message : "Live detection failed");
      }
    } finally {
      busyRef.current = false;
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !liveRef.current) return;
      await captureAndDetect();
      if (!cancelled && liveRef.current) {
        window.setTimeout(tick, 120);
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [live, captureAndDetect]);

  const startLive = useCallback(async () => {
    if (!file || !previewUrl) return;
    setError(null);
    setWarming(true);
    setStatusText("Warming up helmet-v5 models…");

    try {
      // Warm worker with a blank frame so first real detect is faster
      const warm = document.createElement("canvas");
      warm.width = 320;
      warm.height = 180;
      const wctx = warm.getContext("2d");
      if (wctx) {
        wctx.fillStyle = "#222";
        wctx.fillRect(0, 0, 320, 180);
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        warm.toBlob((b) => resolve(b), "image/jpeg", 0.5)
      );
      if (blob) {
        const body = new FormData();
        body.append("frame", blob, "warm.jpg");
        body.append("timestampSec", "0");
        body.append("saveTicket", "0");
        await fetch("/api/detect/helmet-frame", { method: "POST", body });
      }

      setLive(true);
      setWarming(false);
      setStatusText("Live CCTV active — green = helmet, red = no helmet");
      const video = videoRef.current;
      if (video) {
        try {
          await video.play();
        } catch {
          // autoplay may require user gesture; video controls still work
        }
      }
    } catch (err) {
      setWarming(false);
      setError(err instanceof Error ? err.message : "Could not start live CCTV");
      setStatusText("Failed to start live detection");
    }
  }, [file, previewUrl]);

  const selected =
    tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  return (
    <section className="mb-8 overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-cream shadow-[var(--shadow-soft)]">
      <div className="border-b border-[var(--border)] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-forest" />
          <h2 className="font-serif text-2xl">Live CCTV helmet view</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            <span className="live-pulse h-1.5 w-1.5 rounded-full bg-emerald-500" />
            vivekvar/helmet-v5
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Play the video like a CCTV feed. People with helmets get a{" "}
          <span className="font-semibold text-emerald-700">green circle</span>,
          people without get a{" "}
          <span className="font-semibold text-red-600">red circle</span> — drawn
          live on the frame.
        </p>
      </div>

      <div className="grid gap-0 lg:grid-cols-[0.9fr_1.2fr]">
        <div className="border-b border-[var(--border)] bg-beige-soft/30 p-5 lg:border-b-0 lg:border-r lg:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-forest" />
              <h3 className="font-serif text-xl">No-helmet tickets</h3>
            </div>
            <span className="text-xs text-muted">{tickets.length} captured</span>
          </div>

          {tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-cream/70 px-4 py-10 text-center text-sm text-muted">
              When a red-circle rider is detected live, a ticket snapshot appears
              here.
            </div>
          ) : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
              {tickets.map((ticket) => {
                const active = ticket.id === selected?.id;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedId(ticket.id)}
                    className={cn(
                      "flex w-full gap-3 rounded-2xl border p-3 text-left transition",
                      active
                        ? "border-forest/40 bg-cream shadow-[var(--shadow-soft)]"
                        : "border-[var(--border)] bg-cream/70 hover:border-forest/25"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ticket.riderImage || ticket.evidenceImage}
                      alt="Rider"
                      className="h-24 w-20 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
                          No helmet
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {ticket.timestampSec}s · conf{" "}
                        {Math.round(ticket.helmetConfidence * 100)}%
                      </p>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted">
                        {ticket.id}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.evidenceImage}
                alt="Evidence"
                className="max-h-48 w-full object-cover"
              />
            </div>
          )}
        </div>

        <div className="space-y-4 p-5 md:p-6">
          {!file && (
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
                  : "border-[var(--border-strong)] bg-beige-soft/40 hover:border-forest/40 hover:bg-beige-soft/70"
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-cream">
                <Upload className="h-5 w-5 text-forest" />
              </div>
              <div>
                <div className="text-sm font-medium text-charcoal">
                  Drag & drop a video, or click to browse
                </div>
                <div className="mt-1 text-xs text-muted">
                  MP4, WebM, MOV · max 1024 MB · live CCTV overlay
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
          )}

          {file && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white/50 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                  disabled={warming}
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
                {live ? (
                  <Button type="button" size="sm" variant="danger" onClick={stopLive}>
                    Stop live
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={startLive}
                    disabled={warming}
                  >
                    {warming ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      <>
                        <Radio className="h-4 w-4" />
                        Start live CCTV
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[#1a1a18]">
            {previewUrl ? (
              <>
                <video
                  ref={videoRef}
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  playsInline
                  className="aspect-video w-full object-contain"
                  onPlay={() => {
                    if (!live && file) {
                      // encourage live mode when user hits play
                    }
                  }}
                />
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                {live && (
                  <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] text-cream backdrop-blur">
                    <span className="live-pulse h-2 w-2 rounded-full bg-red-500" />
                    LIVE
                    {detecting ? " · scanning…" : ""}
                  </div>
                )}
                <div className="pointer-events-none absolute bottom-3 left-3 flex gap-2 text-[10px] font-semibold uppercase tracking-wide">
                  <span className="rounded-full bg-black/55 px-2 py-1 text-emerald-300">
                    ● Helmet
                  </span>
                  <span className="rounded-full bg-black/55 px-2 py-1 text-red-300">
                    ● No helmet
                  </span>
                </div>
              </>
            ) : (
              <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-cream/55">
                CCTV preview appears here after you choose a video
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-beige-soft/40 px-4 py-3 text-xs text-muted">
            <div className="font-medium text-charcoal">{statusText}</div>
            <div className="mt-1">
              Circles update as frames are classified. First start may take a
              minute while models load once.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
