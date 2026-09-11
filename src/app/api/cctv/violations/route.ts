import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  const dir = path.join(process.cwd(), "data", "cctv", "violations");
  try {
    const files = await readdir(dir);
    const items = [];
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw);
      if (videoId && data.videoId !== videoId) continue;
      items.push(data);
    }
    items.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    return NextResponse.json({ violations: items });
  } catch {
    return NextResponse.json({ violations: [] });
  }
}
