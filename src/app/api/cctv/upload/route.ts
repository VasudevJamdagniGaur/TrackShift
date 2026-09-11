import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 1024 * 1024 * 1024;
const ALLOWED = new Set([".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"]);

function dataRoot() {
  return path.join(process.cwd(), "data", "cctv");
}

async function probeVideo(videoPath: string) {
  return new Promise<{ ok: boolean; metadata?: Record<string, unknown>; error?: string }>(
    (resolve) => {
      const script = path.join(process.cwd(), "scripts", "cctv", "run_job.py");
      const child = spawn("python", [script, "--job-id", "_", "--probe-video", videoPath], {
        cwd: process.cwd(),
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => (stdout += c.toString()));
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("close", () => {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ ok: false, error: stderr || "Could not probe video" });
        }
      });
    }
  );
}

function startJob(jobId: string) {
  const script = path.join(process.cwd(), "scripts", "cctv", "run_job.py");
  const logDir = path.join(dataRoot(), "logs");
  const child = spawn("python", ["-u", script, "--job-id", jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  child.unref();
  void mkdir(logDir, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("video");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a video under field 'video'" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Video must be between 1 byte and 1024 MB" },
        { status: 400 }
      );
    }
    const originalName = file.name || "upload.mp4";
    const ext = path.extname(originalName).toLowerCase() || ".mp4";
    if (!ALLOWED.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported format ${ext}. Use MP4, AVI, MOV, MKV, or WEBM.` },
        { status: 400 }
      );
    }

    const videoId = randomUUID().replace(/-/g, "").slice(0, 12);
    const jobId = randomUUID().replace(/-/g, "").slice(0, 12);
    const videosDir = path.join(dataRoot(), "videos");
    const jobsDir = path.join(dataRoot(), "jobs");
    const mediaDir = path.join(process.cwd(), "public", "cctv", videoId, "source");
    await mkdir(videosDir, { recursive: true });
    await mkdir(jobsDir, { recursive: true });
    await mkdir(mediaDir, { recursive: true });

    const storedPath = path.join(mediaDir, `original${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storedPath, buffer);

    const probe = await probeVideo(storedPath);
    if (!probe.ok) {
      return NextResponse.json(
        {
          error: probe.error || "Maximum supported video duration is 5 minutes.",
          metadata: probe.metadata,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const video = {
      videoId,
      fileName: originalName,
      storedPath,
      publicSourcePath: `/cctv/${videoId}/source/original${ext}`,
      metadata: probe.metadata,
      createdAt: now,
      updatedAt: now,
    };
    await writeFile(
      path.join(videosDir, `${videoId}.json`),
      JSON.stringify(video, null, 2),
      "utf-8"
    );

    const job = {
      jobId,
      videoId,
      status: "QUEUED",
      fileName: originalName,
      totalFrames: (probe.metadata as { frameCount?: number })?.frameCount ?? 0,
      processedFrames: 0,
      progressPercentage: 0,
      detections: 0,
      activeTracks: 0,
      candidateViolations: 0,
      confirmedViolations: 0,
      platesRead: 0,
      motorcycles: 0,
      createdAt: now,
      updatedAt: now,
      metadata: probe.metadata,
    };
    await writeFile(path.join(jobsDir, `${jobId}.json`), JSON.stringify(job, null, 2), "utf-8");

    startJob(jobId);

    return NextResponse.json({
      ok: true,
      videoId,
      jobId,
      metadata: probe.metadata,
      message: "Video accepted. Forensic every-frame analysis started in background.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const jobsDir = path.join(dataRoot(), "jobs");
  try {
    await mkdir(jobsDir, { recursive: true });
    const files = await readdir(jobsDir);
    const jobs = [];
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await readFile(path.join(jobsDir, file), "utf-8");
      jobs.push(JSON.parse(raw));
    }
    jobs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return NextResponse.json({ jobs });
  } catch {
    return NextResponse.json({ jobs: [] });
  }
}
