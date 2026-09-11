import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") || "json";
  const videoId = request.nextUrl.searchParams.get("videoId");
  const dir = path.join(process.cwd(), "data", "cctv", "violations");
  let items: Record<string, unknown>[] = [];
  try {
    const files = await readdir(dir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw);
      if (videoId && data.videoId !== videoId) continue;
      items.push(data);
    }
  } catch {
    items = [];
  }

  if (format === "csv") {
    const header = [
      "video_id",
      "timestamp",
      "frame_number",
      "track_id",
      "violation",
      "helmet_confidence",
      "no_helmet_confidence",
      "plate",
      "plate_confidence",
      "status",
    ];
    const lines = [header.join(",")];
    for (const v of items) {
      lines.push(
        [
          v.videoId,
          v.timestamp,
          v.frameNumber,
          v.trackId,
          v.violationType,
          v.helmetConfidence,
          v.noHelmetConfidence,
          v.plateText ?? "",
          v.plateConfidence,
          v.status,
        ].join(",")
      );
    }
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="cctv-violations.csv"',
      },
    });
  }

  return NextResponse.json({ violations: items });
}
