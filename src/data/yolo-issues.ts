import type { IssueStatus, IssueType, RoadIssue, Severity } from "@/types";
import raw from "./yolo-detections.json";

type YoloDetectionRecord = {
  id: string;
  type: IssueType;
  modelClass: string;
  severity: Severity;
  confidence: number;
  latitude: number;
  longitude: number;
  roadName: string;
  city: string;
  area: string;
  mapillaryImageId: string | null;
  evidenceImage: string | null;
  status: IssueStatus;
};

export const yoloDetectionsMeta = {
  generatedAt: raw.generatedAt,
  model: raw.model,
  totalDetections: raw.totalDetections,
  byCategory: raw.byCategory as Record<string, number>,
};

const generatedAt = raw.generatedAt;

export const yoloIssues: RoadIssue[] = (
  raw.detections as YoloDetectionRecord[]
).map((det) => ({
  id: det.id,
  type: det.type,
  severity: det.severity,
  confidence: det.confidence,
  latitude: det.latitude,
  longitude: det.longitude,
  roadName: det.roadName,
  city: det.city,
  area: det.area,
  detectedAt: generatedAt,
  lastDetectedAt: generatedAt,
  sourceBus: "YOLO26s RDD",
  sourceRoute: "Mapillary street camera",
  status: det.status ?? "new",
  evidenceImage: det.evidenceImage || "/brand/logo-mark.png",
  occurrenceCount: 1,
  description: `${det.modelClass} detected on Mapillary frame${
    det.mapillaryImageId ? ` ${det.mapillaryImageId}` : ""
  }.`,
  roadSegmentId: `yolo-${det.mapillaryImageId ?? det.id}`,
  mapillaryImageId: det.mapillaryImageId ?? undefined,
  modelClass: det.modelClass,
}));
