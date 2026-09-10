"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
  Map,
  PanelLeft,
  X,
} from "lucide-react";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/view-mode";

const mobileItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Map", icon: Map },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: FileText },
];

function ViewModeSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useViewMode();

  return (
    <div
      className={cn(
        "flex items-center rounded-full border border-[var(--border-strong)] bg-cream/80 p-1",
        className
      )}
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        onClick={() => setMode("citizen")}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition md:text-sm",
          mode === "citizen"
            ? "bg-beige-soft text-forest shadow-sm"
            : "text-muted hover:text-charcoal"
        )}
      >
        Citizen View
      </button>
      <button
        type="button"
        onClick={() => setMode("admin")}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium transition md:text-sm",
          mode === "admin"
            ? "bg-beige-soft text-forest shadow-sm"
            : "text-muted hover:text-charcoal"
        )}
      >
        Admin View
      </button>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-ivory">
      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-label="Close side navigation"
          />
          <div
            className="absolute inset-y-0 left-0 w-[280px] shadow-2xl page-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <DashboardSidebar
              className="h-full"
              onNavigate={() => setOpen(false)}
            />
            <button
              type="button"
              className="absolute right-3 top-4 rounded-lg bg-white/10 p-2 text-cream transition hover:bg-white/15"
              onClick={() => setOpen(false)}
              aria-label="Close side navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[rgba(247,244,239,0.92)] px-4 py-3 backdrop-blur md:px-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open side navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <Image
            src="/brand/hayagriva-mark.png"
            alt="Hayagriva"
            width={160}
            height={44}
            unoptimized
            className="h-9 w-auto object-contain"
          />
          <div className="ml-auto flex items-center gap-3">
            <ViewModeSwitch className="hidden sm:flex" />
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="live-pulse h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
        </div>

        <div className="border-b border-[var(--border)] px-4 py-2 sm:hidden">
          <ViewModeSwitch className="w-full [&>button]:flex-1" />
        </div>

        <main
          className="flex-1 px-4 py-5 pb-24 md:px-6 lg:px-8 lg:pb-8 page-enter"
          onClick={() => {
            if (open) setOpen(false);
          }}
        >
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[rgba(255,252,248,0.95)] backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 py-2">
            {mobileItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px]",
                    active ? "bg-beige-soft text-forest" : "text-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
