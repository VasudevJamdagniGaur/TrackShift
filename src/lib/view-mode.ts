"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type AppViewMode = "citizen" | "admin";

const STORAGE_KEY = "hayagriva-view-mode";

export function resolveViewMode(pathname: string, stored?: AppViewMode | null): AppViewMode {
  if (pathname.startsWith("/citizen")) return "citizen";
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/buses") ||
    pathname.startsWith("/feedback") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/login")
  ) {
    return "admin";
  }
  return stored ?? "admin";
}

export function useViewMode() {
  const pathname = usePathname();
  const router = useRouter();
  const [stored, setStored] = useState<AppViewMode | null>(null);

  useEffect(() => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === "citizen" || value === "admin") setStored(value);
    } catch {
      /* ignore */
    }
  }, []);

  const mode = resolveViewMode(pathname, stored);

  const setMode = useCallback(
    (next: AppViewMode) => {
      setStored(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      router.push(next === "citizen" ? "/citizen" : "/dashboard");
    },
    [router]
  );

  return { mode, setMode };
}
