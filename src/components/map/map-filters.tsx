"use client";

import { ISSUE_FILTERS, SEVERITY_OPTIONS } from "@/lib/constants";
import type { IssueType, Severity } from "@/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export function MapFiltersBar({
  query,
  type,
  severity,
  onQueryChange,
  onTypeChange,
  onSeverityChange,
  showMapillary,
  onShowMapillaryChange,
}: {
  query: string;
  type: IssueType | "all";
  severity: Severity | "all";
  onQueryChange: (value: string) => void;
  onTypeChange: (value: IssueType | "all") => void;
  onSeverityChange: (value: Severity | "all") => void;
  showMapillary?: boolean;
  onShowMapillaryChange?: (value: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search location, road or city..."
            className="pl-10"
          />
        </div>
        <select
          value={severity}
          onChange={(e) => onSeverityChange(e.target.value as Severity | "all")}
          className="h-11 rounded-xl border border-[var(--border-strong)] bg-cream/80 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="h-11 rounded-xl border border-[var(--border-strong)] bg-cream/80 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Date range start"
        />
        {onShowMapillaryChange != null && (
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-cream/80 px-3 text-xs font-medium text-charcoal">
            <input
              type="checkbox"
              checked={!!showMapillary}
              onChange={(e) => onShowMapillaryChange(e.target.checked)}
              className="h-4 w-4 accent-[var(--forest)]"
            />
            Mapillary photos
          </label>
        )}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <span className="live-pulse h-2 w-2 rounded-full bg-emerald-500" />
          Live Monitoring
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ISSUE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onTypeChange(filter.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              type === filter.id
                ? "border-forest bg-forest text-cream"
                : "border-[var(--border-strong)] bg-cream text-muted hover:bg-beige-soft hover:text-charcoal"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
