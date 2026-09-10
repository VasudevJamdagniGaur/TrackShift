import type { IssueType, Severity } from "@/types";

export const BRAND = {
  name: "Hayagriva",
  tagline: "Smarter Roads. A Wiser Tomorrow.",
  supporting: "The Intelligence Behind Every Journey.",
  philosophy:
    "Every bus journey becomes a source of infrastructure intelligence.",
} as const;

export const ISSUE_FILTERS: { id: IssueType | "all"; label: string }[] = [
  { id: "all", label: "All Issues" },
  { id: "pothole", label: "Potholes" },
  { id: "crack", label: "Cracks" },
  { id: "surface_damage", label: "Surface Damage" },
  { id: "manhole", label: "Manhole" },
  { id: "road_marking", label: "Road Markings" },
  { id: "other", label: "Other" },
];

export const SEVERITY_OPTIONS: { id: Severity | "all"; label: string }[] = [
  { id: "all", label: "All Severity" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "critical", label: "Critical" },
];

export const TREND_RANGES = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "3m", label: "Last 3 Months" },
  { id: "1y", label: "Last Year" },
] as const;

export const MAP_CENTER: [number, number] = [28.5355, 77.391];
export const DEFAULT_ZOOM = 12;
