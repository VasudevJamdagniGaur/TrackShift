import * as React from "react";
import { cn, severityLabel } from "@/lib/utils";
import type { IssueStatus, Severity } from "@/types";

const severityStyles: Record<Severity, string> = {
  low: "bg-[#f5edd8] text-[#8a6d2f] border-[#e4d4a8]",
  medium: "bg-[#fff1e0] text-[#9a5b12] border-[#f0d0a4]",
  high: "bg-[#fde8e6] text-[#9f2d22] border-[#f2c2bc]",
  critical: "bg-[#f3d6d4] text-[#7f1d1d] border-[#e3a8a4]",
};

const statusStyles: Record<IssueStatus, string> = {
  new: "bg-beige-soft text-forest border-beige",
  verified: "bg-[#e7f1eb] text-success border-[#c8ddd2]",
  under_review: "bg-[#fff4e5] text-warning border-[#efd4a8]",
  resolved: "bg-[#eceff3] text-charcoal-soft border-[#d5dae1]",
};

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        className
      )}
      {...props}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge className={severityStyles[severity]}>{severityLabel(severity)}</Badge>
  );
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  const label = status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return <Badge className={statusStyles[status]}>{label}</Badge>;
}
