import { NextRequest, NextResponse } from "next/server";

type CoveragePoint = {
  id: string;
  latitude: number;
  longitude: number;
};

type CoverageResult = {
  id: string;
  available: boolean;
  imageId?: string;
  mapillaryUrl?: string;
};

const DELTA = 0.0012; // ~130m — well under Mapillary's 0.01°² bbox limit

async function checkPoint(
  token: string,
  point: CoveragePoint
): Promise<CoverageResult> {
  const west = point.longitude - DELTA;
  const south = point.latitude - DELTA;
  const east = point.longitude + DELTA;
  const north = point.latitude + DELTA;
  const bbox = `${west},${south},${east},${north}`;

  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("fields", "id");
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `OAuth ${token}`,
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return { id: point.id, available: false };
    }

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const imageId = data.data?.[0]?.id;
    if (!imageId) {
      return { id: point.id, available: false };
    }

    return {
      id: point.id,
      available: true,
      imageId,
      mapillaryUrl: `https://www.mapillary.com/app/?pKey=${imageId}&focus=photo`,
    };
  } catch {
    return { id: point.id, available: false };
  }
}

export async function POST(request: NextRequest) {
  const token = process.env.MAPILLARY_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Mapillary token not configured", results: [] },
      { status: 500 }
    );
  }

  let body: { points?: CoveragePoint[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", results: [] }, { status: 400 });
  }

  const points = (body.points ?? []).slice(0, 40);
  if (points.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Sequential batches of 5 to stay gentle on rate limits
  const results: CoverageResult[] = [];
  for (let i = 0; i < points.length; i += 5) {
    const batch = points.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map((point) => checkPoint(token, point))
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ results });
}
