import type { RepairPriorityItem, RoadIssue, RoadSegment } from "@/types";

/**
 * Weighted repair priority scoring.
 * Replace with ML model inference later.
 */
export function computeRepairPriority(
  segment: RoadSegment,
  issues: RoadIssue[],
  options?: {
    trafficWeight?: number;
    nearCriticalInfrastructure?: boolean;
  }
): number {
  const segmentIssues = issues.filter((i) => i.roadSegmentId === segment.id);
  if (segmentIssues.length === 0) return Math.max(0, 100 - segment.healthScore);

  const severityWeights = { low: 1, medium: 2.5, high: 5, critical: 8 };
  const severityScore =
    segmentIssues.reduce((sum, issue) => sum + severityWeights[issue.severity], 0) /
    segmentIssues.length;

  const repeatScore =
    segmentIssues.reduce((sum, issue) => sum + Math.min(issue.occurrenceCount, 10), 0) /
    segmentIssues.length;

  const deteriorationScore = segmentIssues.filter(
    (issue) => new Date(issue.lastDetectedAt) > new Date(issue.detectedAt)
  ).length;

  const healthPenalty = (100 - segment.healthScore) / 20;
  const traffic = options?.trafficWeight ?? 1.2;
  const infraBoost = options?.nearCriticalInfrastructure ? 8 : 0;

  const raw =
    severityScore * 8 +
    repeatScore * 4 +
    deteriorationScore * 3 +
    healthPenalty * 6 +
    traffic * 5 +
    infraBoost;

  return Math.min(100, Math.round(raw * 1.8));
}

export function buildPriorityReasons(
  segment: RoadSegment,
  issues: RoadIssue[],
  nearCriticalInfrastructure = false
): string[] {
  const segmentIssues = issues.filter((i) => i.roadSegmentId === segment.id);
  const reasons: string[] = [];

  if (segmentIssues.some((i) => i.severity === "critical" || i.severity === "high")) {
    reasons.push("High severity detections");
  }
  if (segmentIssues.some((i) => i.occurrenceCount >= 4)) {
    reasons.push("Repeated detections");
  }
  if (segment.healthScore < 60) {
    reasons.push("Rapid deterioration");
  }
  if ((segment.issueCount ?? segmentIssues.length) >= 5) {
    reasons.push("High traffic exposure");
  }
  if (nearCriticalInfrastructure) {
    reasons.push("Near school/hospital");
  }
  if (reasons.length === 0) reasons.push("Elevated issue density");
  return reasons.slice(0, 5);
}

export function rankRepairPriorities(
  segments: RoadSegment[],
  issues: RoadIssue[]
): RepairPriorityItem[] {
  const criticalAreas = new Set([
    "sector-62",
    "mg-road",
    "indiranagar",
    "andheri-east",
  ]);

  return segments
    .map((segment, index) => {
      const nearCritical = criticalAreas.has(segment.id) || index % 3 === 0;
      const score = computeRepairPriority(segment, issues, {
        trafficWeight: 1 + (segment.issueCount % 5) * 0.15,
        nearCriticalInfrastructure: nearCritical,
      });
      const segmentIssues = issues.filter((i) => i.roadSegmentId === segment.id);
      const impact =
        score >= 85 ? "high" : score >= 70 ? "medium" : "low";

      return {
        rank: 0,
        roadName: segment.name,
        city: segment.city,
        area: segment.area,
        score,
        reasons: buildPriorityReasons(segment, issues, nearCritical),
        estimatedImpact: impact as "low" | "medium" | "high",
        issueCount: segmentIssues.length || segment.issueCount,
        segmentId: segment.id,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
