import { readFile, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function violationPath(id: string) {
  return path.join(process.cwd(), "data", "cctv", "violations", `${id}.json`);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const raw = await readFile(violationPath(id), "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Violation not found" }, { status: 404 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await request.json();
    const status = String(body.status || "").toUpperCase();
    if (!["APPROVED", "REJECTED", "NEEDS_REVIEW", "CONFIRMED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const raw = await readFile(violationPath(id), "utf-8");
    const data = JSON.parse(raw);
    data.status = status === "APPROVED" ? "CONFIRMED" : status;
    data.reviewNote = body.note || null;
    data.reviewedAt = new Date().toISOString();
    data.updatedAt = data.reviewedAt;
    await writeFile(violationPath(id), JSON.stringify(data, null, 2), "utf-8");
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Violation not found" }, { status: 404 });
  }
}
