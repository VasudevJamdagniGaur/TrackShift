export type IssueType =
  | "pothole"
  | "crack"
  | "surface_damage"
  | "manhole"
  | "road_marking"
  | "debris"
  | "broken_section"
  | "other";

export type Severity = "low" | "medium" | "high" | "critical";

export type IssueStatus = "new" | "verified" | "under_review" | "resolved";

export type BusStatus = "scanning" | "idle" | "offline" | "maintenance";

export interface RoadIssue {
  id: string;
  type: IssueType;
  severity: Severity;
  confidence: number;
  latitude: number;
  longitude: number;
  roadName: string;
  city: string;
  area: string;
  pincode?: string;
  detectedAt: string;
  lastDetectedAt: string;
  sourceBus: string;
  sourceRoute: string;
  status: IssueStatus;
  evidenceImage: string;
  occurrenceCount: number;
  description?: string;
  roadSegmentId: string;
}

export interface SeverityHistoryEntry {
  date: string;
  severity: Severity;
  note?: string;
}

export interface IssueHistory {
  issueId: string;
  entries: SeverityHistoryEntry[];
  degradationDetected: boolean;
  summary: string;
}

export interface RoadSegment {
  id: string;
  name: string;
  city: string;
  area: string;
  healthScore: number;
  lengthKm: number;
  issueCount: number;
  lastScanned: string;
  coordinates: [number, number][];
}

export interface Bus {
  id: string;
  number: string;
  route: string;
  routeFrom: string;
  routeTo: string;
  city: string;
  status: BusStatus;
  distanceScannedKm: number;
  issuesDetected: number;
  lastDetection: string;
  latitude: number;
  longitude: number;
  routeCoordinates: [number, number][];
}

export interface City {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  healthScore: number;
  issuesDetected: number;
  kilometersScanned: number;
  busesActive: number;
}

export interface Area {
  id: string;
  name: string;
  city: string;
  pincode: string;
  healthScore: number;
  totalRoads: number;
  potholes: number;
  cracks: number;
  criticalSections: number;
  lastScanned: string;
  latitude: number;
  longitude: number;
}

export interface Detection {
  id: string;
  issueId: string;
  type: IssueType;
  location: string;
  city: string;
  detectedAt: string;
  severity: Severity;
  thumbnail: string;
  confidence: number;
}

export interface RepairPriorityItem {
  rank: number;
  roadName: string;
  city: string;
  area: string;
  score: number;
  reasons: string[];
  estimatedImpact: "low" | "medium" | "high";
  issueCount: number;
  segmentId: string;
}

export interface PlatformStats {
  citiesMonitored: number;
  kilometersScanned: number;
  issuesDetected: number;
  continuousMonitoring: string;
}

export interface AnalyticsPoint {
  date: string;
  total: number;
  potholes: number;
  cracks: number;
  surfaceDamage: number;
}

export interface CommonIssueStat {
  type: IssueType;
  label: string;
  percentage: number;
  count: number;
}

export interface HealthBreakdown {
  good: number;
  moderate: number;
  poor: number;
  critical: number;
}

export interface ReportDraft {
  city: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  kilometersScanned: number;
  issuesDetected: number;
  criticalIssues: number;
  newIssues: number;
  resolvedIssues: number;
  worstSegments: string[];
  recommendedRepairs: string[];
}

export interface MapFilters {
  query: string;
  types: IssueType[] | "all";
  severity: Severity | "all";
  dateFrom?: string;
  dateTo?: string;
}
