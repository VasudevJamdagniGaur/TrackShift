"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bus,
  Home,
  Info,
  LayoutDashboard,
  Map,
  MessageSquare,
  MonitorPlay,
  Settings,
  Users,
} from "lucide-react";
import { HorseMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { useViewMode, type AppViewMode } from "@/lib/view-mode";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  modes: AppViewMode[];
};

const items: NavItem[] = [
  { href: "/", label: "Home", icon: Home, exact: true, modes: ["citizen", "admin"] },
  { href: "/citizen", label: "Citizen Portal", icon: Users, modes: ["citizen"] },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, modes: ["admin"] },
  { href: "/map", label: "Map", icon: Map, modes: ["citizen", "admin"] },
  { href: "/issues", label: "Issues", icon: AlertTriangle, modes: ["citizen", "admin"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, modes: ["admin"] },
  { href: "/buses", label: "Bus Monitoring", icon: Bus, modes: ["admin"] },
  {
    href: "/live-demo",
    label: "Live Demo",
    icon: MonitorPlay,
    modes: ["citizen", "admin"],
  },
  { href: "/feedback", label: "Feedback", icon: MessageSquare, modes: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings, modes: ["admin"] },
  { href: "/about", label: "About", icon: Info, modes: ["citizen", "admin"] },
];

export function DashboardSidebar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { mode } = useViewMode();
  const visibleItems = items.filter((item) => item.modes.includes(mode));

  return (
    <aside
      className={cn(
        "flex h-full w-[260px] flex-col bg-forest text-cream",
        className
      )}
    >
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/" className="block" onClick={onNavigate}>
          <Image
            src="/brand/hayagriva-mark-light.png"
            alt="Hayagriva"
            width={200}
            height={56}
            unoptimized
            className="h-11 w-auto object-contain object-left"
          />
          <div className="mt-2 text-[11px] text-cream/60">
            {mode === "citizen" ? "Citizen View" : "Admin View"}
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {visibleItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-white/10 text-cream shadow-inner"
                  : "text-cream/70 hover:bg-white/5 hover:text-cream"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 px-5 py-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <HorseMark className="h-7 w-7" />
        </div>
        <p className="font-serif text-lg leading-tight text-cream">Safer Roads</p>
        <p className="font-serif text-lg leading-tight text-gold-muted">
          Stronger Communities
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-cream/75">
          <Activity className="h-3 w-3 text-emerald-300" />
          Demo Monitoring Data
        </div>
      </div>
    </aside>
  );
}
