import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const jobPath = path.join(process.cwd(), "data", "cctv", "jobs", `${id}.json`);
  try {
    const raw = await readFile(jobPath, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
}
