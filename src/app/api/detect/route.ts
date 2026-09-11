import { spawn } from "child_process";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

function runPython(payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "scripts", "classify_road_damage.py");
    const child = spawn("python", [script, "--stdin-json"], {
      cwd: process.cwd(),
      env: process.env,
    });

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
        reject(new Error(stderr || `Classifier exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid classifier output: ${stdout.slice(0, 400)}`));
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function resolveImageUrl(mapillaryImageId: string): Promise<string | null> {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) return null;
  const url = `https://graph.mapillary.com/${mapillaryImageId}?fields=id,thumb_2048_url,thumb_1024_url,computed_geometry`;
  const res = await fetch(url, {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    thumb_2048_url?: string;
    thumb_1024_url?: string;
  };
  return data.thumb_2048_url || data.thumb_1024_url || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let imageUrl = body.imageUrl as string | undefined;
    const mapillaryImageId = body.mapillaryImageId || body.imageId;

    if (!imageUrl && mapillaryImageId) {
      imageUrl = (await resolveImageUrl(String(mapillaryImageId))) || undefined;
    }
    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl or mapillaryImageId required" },
        { status: 400 }
      );
    }

    const result = await runPython({
      imageId: String(mapillaryImageId || body.id || "adhoc"),
      imageUrl,
      latitude: body.latitude,
      longitude: body.longitude,
      roadName: body.roadName,
      city: body.city,
      area: body.area,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Classification failed",
      },
      { status: 500 }
    );
  }
}
