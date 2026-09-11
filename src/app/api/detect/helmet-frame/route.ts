import { randomUUID } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { detectHelmetFrame } from "@/lib/helmet-worker";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const jobId = randomUUID().slice(0, 8);
  const tmpDir = path.join(process.cwd(), "tmp", "frames");
  let savedPath: string | null = null;

  try {
    const form = await request.formData();
    const file = form.get("frame");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a frame image under the 'frame' field" },
        { status: 400 }
      );
    }

    const timestampSec = Number(form.get("timestampSec") || 0);
    const saveTicket = String(form.get("saveTicket") || "1") !== "0";

    await mkdir(tmpDir, { recursive: true });
    savedPath = path.join(tmpDir, `${jobId}.jpg`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(savedPath, buffer);

    const result = await detectHelmetFrame({
      imagePath: savedPath,
      conf: 0.25,
      withPlate: false,
      saveTicket,
      timestampSec,
      jobId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Live helmet detect failed",
      },
      { status: 500 }
    );
  } finally {
    if (savedPath) {
      try {
        await unlink(savedPath);
      } catch {
        // ignore
      }
    }
  }
}
