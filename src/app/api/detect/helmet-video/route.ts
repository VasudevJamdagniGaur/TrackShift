import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 1024 * 1024 * 1024; // 1024 MB local demo
const ALLOWED_EXT = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
]);

function runHelmetClassifier(args: {
  videoPath: string;
  jobId: string;
  maxFrames: number;
  stride: number;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "scripts", "classify_helmet_video.py");
    const child = spawn(
      "python",
      [
        script,
        "--video-path",
        args.videoPath,
        "--job-id",
        args.jobId,
        "--max-frames",
        String(args.maxFrames),
        "--stride",
        String(args.stride),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr || `Helmet classifier exited with code ${code}`)
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid classifier output: ${stdout.slice(0, 400)}`));
      }
    });
  });
}

export async function POST(request: NextRequest) {
  const jobId = randomUUID().slice(0, 8);
  const tmpDir = path.join(process.cwd(), "tmp", "uploads");
  let savedPath: string | null = null;

  try {
    const form = await request.formData();
    const file = form.get("video");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a video file under the 'video' field" },
        { status: 400 }
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "Empty video file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Video too large (max 1024 MB)" },
        { status: 400 }
      );
    }

    const originalName = file.name || "upload.mp4";
    const ext = path.extname(originalName).toLowerCase() || ".mp4";
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        {
          error: `Unsupported format ${ext}. Use mp4, webm, mov, avi, mkv, or m4v.`,
        },
        { status: 400 }
      );
    }

    const maxFrames = Math.min(
      30,
      Math.max(1, Number(form.get("maxFrames") || 16))
    );
    const stride = Math.min(
      60,
      Math.max(1, Number(form.get("stride") || 10))
    );

    await mkdir(tmpDir, { recursive: true });
    savedPath = path.join(tmpDir, `helmet_${jobId}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(savedPath, buffer);

    const result = (await runHelmetClassifier({
      videoPath: savedPath,
      jobId,
      maxFrames,
      stride,
    })) as { ok?: boolean; error?: string };

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error || "Helmet enforcement failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...result,
      fileName: originalName,
      fileSize: file.size,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Helmet enforcement failed",
      },
      { status: 500 }
    );
  } finally {
    if (savedPath) {
      try {
        await unlink(savedPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
