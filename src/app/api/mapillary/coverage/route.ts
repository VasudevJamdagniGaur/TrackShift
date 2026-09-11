import { NextRequest, NextResponse } from "next/server";

type CoveragePoint = {
  id: string;
  latitude: number;
  longitude: number;
};

type StreetPhotoPoint = {
  id: string;
  latitude: number;
  longitude: number;
  compassAngle: number | null;
};

type CoverageResult = {
  id: string;
  available: boolean;
  imageId?: string;
  mapillaryUrl?: string;
};

const DELTA = 0.0015; // ~160m — under Mapillary's 0.01°² bbox limit

async function fetchImagesInBbox(
  token: string,
  latitude: number,
  longitude: number
): Promise<StreetPhotoPoint[]> {
  const west = longitude - DELTA;
  const south = latitude - DELTA;
  const east = longitude + DELTA;
  const north = latitude + DELTA;
  const bbox = `${west},${south},${east},${north}`;

  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set(
    "fields",
    "id,computed_geometry,compass_angle"
  );
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `OAuth ${token}` },
    next: { revalidate: 1800 },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      computed_geometry?: { coordinates?: [number, number] };
      compass_angle?: number;
    }>;
  };

  return (data.data ?? [])
    .map((item) => {
      const coords = item.computed_geometry?.coordinates;
      if (!coords) return null;
      return {
        id: item.id,
        longitude: coords[0],
        latitude: coords[1],
        compassAngle: item.compass_angle ?? null,
      } satisfies StreetPhotoPoint;
    })
    .filter((p): p is StreetPhotoPoint => Boolean(p));
}

async function fetchSequencePoints(
  token: string,
  seedImageId: string
): Promise<StreetPhotoPoint[]> {
  const metaRes = await fetch(
    `https://graph.mapillary.com/${seedImageId}?fields=id,sequence`,
    {
      headers: { Authorization: `OAuth ${token}` },
      next: { revalidate: 3600 },
    }
  );
  if (!metaRes.ok) return [];
  const meta = (await metaRes.json()) as { sequence?: string };
  if (!meta.sequence) return [];

  const idsRes = await fetch(
    `https://graph.mapillary.com/image_ids?sequence_id=${encodeURIComponent(meta.sequence)}`,
    {
      headers: { Authorization: `OAuth ${token}` },
      next: { revalidate: 3600 },
    }
  );
  if (!idsRes.ok) return [];
  const idsData = (await idsRes.json()) as { data?: Array<{ id: string }> };
  const imageIds = (idsData.data ?? []).map((d) => d.id).slice(0, 120);
  if (imageIds.length === 0) return [];

  const points: StreetPhotoPoint[] = [];
  for (let i = 0; i < imageIds.length; i += 40) {
    const chunk = imageIds.slice(i, i + 40);
    const batchRes = await fetch(
      `https://graph.mapillary.com/?ids=${chunk.join(",")}&fields=id,computed_geometry,compass_angle`,
      {
        headers: { Authorization: `OAuth ${token}` },
        next: { revalidate: 3600 },
      }
    );
    if (!batchRes.ok) continue;
    const batch = (await batchRes.json()) as Record<
      string,
      {
        computed_geometry?: { coordinates?: [number, number] };
        compass_angle?: number;
      }
    >;
    for (const id of chunk) {
      const coords = batch[id]?.computed_geometry?.coordinates;
      if (!coords) continue;
      points.push({
        id,
        longitude: coords[0],
        latitude: coords[1],
        compassAngle: batch[id]?.compass_angle ?? null,
      });
    }
  }
  return points;
}

export async function POST(request: NextRequest) {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Mapillary token not configured", results: [], streetPoints: [] },
      { status: 500 }
    );
  }

  let body: { points?: CoveragePoint[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", results: [], streetPoints: [] },
      { status: 400 }
    );
  }

  const points = (body.points ?? []).slice(0, 40);
  if (points.length === 0) {
    return NextResponse.json({ results: [], streetPoints: [] });
  }

  const results: CoverageResult[] = [];
  const streetMap = new Map<string, StreetPhotoPoint>();
  const sequenceSeeds: string[] = [];

  for (let i = 0; i < points.length; i += 4) {
    const batch = points.slice(i, i + 4);
    const batchStreet = await Promise.all(
      batch.map(async (point) => {
        try {
          const nearby = await fetchImagesInBbox(
            token,
            point.latitude,
            point.longitude
          );
          const first = nearby[0];
          results.push(
            first
              ? {
                  id: point.id,
                  available: true,
                  imageId: first.id,
                  mapillaryUrl: `https://www.mapillary.com/app/?pKey=${first.id}&focus=photo`,
                }
              : { id: point.id, available: false }
          );
          return { nearby, seed: first?.id };
        } catch {
          results.push({ id: point.id, available: false });
          return { nearby: [] as StreetPhotoPoint[], seed: undefined };
        }
      })
    );

    for (const item of batchStreet) {
      for (const photo of item.nearby) {
        streetMap.set(photo.id, photo);
      }
      if (item.seed) sequenceSeeds.push(item.seed);
    }
  }

  // Expand a few roads into full capture sequences (green dots along the street)
  const uniqueSeeds = [...new Set(sequenceSeeds)].slice(0, 6);
  for (const seed of uniqueSeeds) {
    try {
      const sequencePoints = await fetchSequencePoints(token, seed);
      for (const photo of sequencePoints) {
        streetMap.set(photo.id, photo);
      }
    } catch {
      /* ignore sequence expansion failures */
    }
  }

  return NextResponse.json({
    results,
    streetPoints: [...streetMap.values()],
  });
}
