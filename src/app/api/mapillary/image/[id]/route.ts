import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Mapillary token not configured" },
      { status: 500 }
    );
  }

  const { id } = await context.params;
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
  }

  const fields = [
    "id",
    "captured_at",
    "compass_angle",
    "thumb_1024_url",
    "thumb_2048_url",
    "thumb_original_url",
    "computed_geometry",
    "sequence",
  ].join(",");

  const url = `https://graph.mapillary.com/${id}?fields=${fields}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `OAuth ${token}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Failed to load Mapillary image", detail: text },
        { status: res.status }
      );
    }

    const data = (await res.json()) as {
      id: string;
      captured_at?: number;
      compass_angle?: number;
      thumb_1024_url?: string;
      thumb_2048_url?: string;
      thumb_original_url?: string;
      computed_geometry?: { type: string; coordinates: [number, number] };
      sequence?: string;
    };

    const imageUrl =
      data.thumb_2048_url || data.thumb_original_url || data.thumb_1024_url;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No photo URL returned for this image" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: data.id,
      imageUrl,
      thumbUrl: data.thumb_1024_url || imageUrl,
      capturedAt: data.captured_at
        ? new Date(data.captured_at).toISOString()
        : null,
      compassAngle: data.compass_angle ?? null,
      sequenceId: data.sequence ?? null,
      longitude: data.computed_geometry?.coordinates?.[0] ?? null,
      latitude: data.computed_geometry?.coordinates?.[1] ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Mapillary request failed" },
      { status: 502 }
    );
  }
}
