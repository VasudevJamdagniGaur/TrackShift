import { createReadStream, existsSync, statSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveAnnotatedPath(job: {
  jobId: string;
  annotatedVideoPath?: string | null;
  summary?: { annotatedVideoPath?: string | null };
  videoId?: string;
}): string | null {
  const candidates = [
    job.annotatedVideoPath,
    job.summary?.annotatedVideoPath,
    path.join(process.cwd(), "data", "cctv", "jobs", job.jobId, "annotated.h264.mp4"),
    path.join(process.cwd(), "data", "cctv", "jobs", job.jobId, "annotated.mp4"),
    job.videoId
      ? path.join(process.cwd(), "public", "cctv", job.videoId, "annotated.h264.mp4")
      : null,
    job.videoId
      ? path.join(process.cwd(), "public", "cctv", job.videoId, "annotated.mp4")
      : null,
  ].filter(Boolean) as string[];

  // Prefer browser-ready H.264 when both exist
  const ranked = [...candidates].sort((a, b) => {
    const ah = a.toLowerCase().includes("h264") ? 0 : 1;
    const bh = b.toLowerCase().includes("h264") ? 0 : 1;
    return ah - bh;
  });

  for (const candidate of ranked) {
    const abs = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);
    if (existsSync(abs) && abs.toLowerCase().endsWith(".mp4")) {
      // Prevent path traversal outside project data/public
      const root = path.normalize(process.cwd()).toLowerCase();
      const normalized = path.normalize(abs).toLowerCase();
      if (normalized.startsWith(root)) {
        return path.normalize(abs);
      }
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const jobPath = path.join(process.cwd(), "data", "cctv", "jobs", `${id}.json`);

  let job: {
    jobId: string;
    annotatedVideoPath?: string | null;
    summary?: { annotatedVideoPath?: string | null };
    videoId?: string;
  };
  try {
    job = JSON.parse(await readFile(jobPath, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const filePath = resolveAnnotatedPath({ ...job, jobId: id });
  if (!filePath) {
    return NextResponse.json(
      { error: "Annotated video not available for this job" },
      { status: 404 }
    );
  }

  const stat = statSync(filePath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  const commonHeaders: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache, max-age=0",
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
    if (Number.isNaN(start) || Number.isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }
    const chunkSize = end - start + 1;
    const nodeStream = createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new NextResponse(webStream, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(chunkSize),
      },
    });
  }

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      ...commonHeaders,
      "Content-Length": String(fileSize),
    },
  });
}
