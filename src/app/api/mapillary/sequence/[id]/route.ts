import { NextRequest, NextResponse } from "next/server";

type SequencePoint = {
  id: string;
  latitude: number;
  longitude: number;
  compassAngle: number | null;
  capturedAt: string | null;
};

async function fetchGeometries(
  token: string,
  imageIds: string[]
): Promise<SequencePoint[]> {
  const points: SequencePoint[] = [];
  const chunkSize = 40;

  for (let i = 0; i < imageIds.length; i += chunkSize) {
    const chunk = imageIds.slice(i, i + chunkSize);
    const url = `https://graph.mapillary.com/?ids=${chunk.join(",")}&fields=id,computed_geometry,compass_angle,captured_at`;
    const res = await fetch(url, {
      headers: { Authorization: `OAuth ${token}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) continue;

    const data = (await res.json()) as Record<
      string,
      {
        id?: string;
        computed_geometry?: { coordinates?: [number, number] };
        compass_angle?: number;
        captured_at?: number;
      }
    >;

    for (const id of chunk) {
      const item = data[id];
      const coords = item?.computed_geometry?.coordinates;
      if (!coords) continue;
      points.push({
        id,
        longitude: coords[0],
        latitude: coords[1],
        compassAngle: item.compass_angle ?? null,
        capturedAt: item.captured_at
          ? new Date(item.captured_at).toISOString()
          : null,
      });
    }
  }

  return points;
}

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
  if (!id || id.length < 4) {
    return NextResponse.json({ error: "Invalid sequence id" }, { status: 400 });
  }

  const url = `https://graph.mapillary.com/image_ids?sequence_id=${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `OAuth ${token}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Failed to load sequence", detail: text },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const imageIds = (data.data ?? []).map((item) => item.id);
    // Cap for UI performance — keep ordered capture sequence
    const limitedIds = imageIds.slice(0, 200);
    const points = await fetchGeometries(token, limitedIds);

    // Keep capture order from image_ids
    const byId = new Map(points.map((p) => [p.id, p]));
    const ordered = limitedIds
      .map((imageId) => byId.get(imageId))
      .filter((p): p is SequencePoint => Boolean(p));

    return NextResponse.json({
      sequenceId: id,
      imageIds: ordered.map((p) => p.id),
      points: ordered,
      count: ordered.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Mapillary sequence request failed" },
      { status: 502 }
    );
  }
}
