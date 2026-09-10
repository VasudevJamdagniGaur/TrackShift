"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, PanelLeft, Search, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useViewMode } from "@/lib/view-mode";
import { useEffect, useState } from "react";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { mode, setMode } = useViewMode();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(247,244,239,0.86)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Open side navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>

          <Logo showTagline={false} compact />

          <div
            className="ml-1 hidden items-center rounded-full border border-[var(--border-strong)] bg-cream/80 p-1 sm:flex"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setMode("citizen")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition md:px-4 md:text-sm",
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
                "rounded-full px-3 py-1.5 text-xs font-medium transition md:px-4 md:text-sm",
                mode === "admin"
                  ? "bg-beige-soft text-forest shadow-sm"
                  : "text-muted hover:text-charcoal"
              )}
            >
              Admin View
            </button>
          </div>

          <form
            className="ml-auto hidden min-w-[180px] max-w-sm flex-1 items-center md:flex"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/roads?q=${encodeURIComponent(query || "Sector 62")}`);
            }}
          >
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search area, road or city..."
                className="pl-10"
              />
            </div>
          </form>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 sm:hidden"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Button asChild variant="default" size="sm" className="shrink-0">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>

        <div className="border-t border-[var(--border)] px-4 py-2 sm:hidden">
          <div
            className="flex items-center rounded-full border border-[var(--border-strong)] bg-cream/80 p-1"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setMode("citizen")}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
                mode === "citizen"
                  ? "bg-beige-soft text-forest shadow-sm"
                  : "text-muted"
              )}
            >
              Citizen View
            </button>
            <button
              type="button"
              onClick={() => setMode("admin")}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
                mode === "admin"
                  ? "bg-beige-soft text-forest shadow-sm"
                  : "text-muted"
              )}
            >
              Admin View
            </button>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-[1px]"
            aria-label="Close side navigation"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] shadow-2xl page-enter">
            <DashboardSidebar
              className="h-full"
              onNavigate={() => setSidebarOpen(false)}
            />
            <button
              type="button"
              className="absolute right-3 top-4 rounded-lg bg-white/10 p-2 text-cream transition hover:bg-white/15"
              aria-label="Close side navigation"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
