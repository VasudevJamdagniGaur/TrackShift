import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { IssueType, Severity } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function issueTypeLabel(type: IssueType): string {
  const labels: Record<IssueType, string> = {
    pothole: "Pothole",
    crack: "Road Crack",
    surface_damage: "Surface Damage",
    manhole: "Manhole Issue",
    road_marking: "Faded Markings",
    debris: "Road Debris",
    broken_section: "Broken Section",
    other: "Other Hazard",
  };
  return labels[type];
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function severityColor(severity: Severity): string {
  const colors: Record<Severity, string> = {
    low: "#C4A35A",
    medium: "#D97706",
    high: "#DC2626",
    critical: "#7F1D1D",
  };
  return colors[severity];
}

export function healthLabel(score: number): string {
  if (score >= 80) return "Good";
  if (score >= 65) return "Fair";
  if (score >= 45) return "Poor";
  return "Critical";
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
