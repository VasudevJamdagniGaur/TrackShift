"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "#fffcf8",
          border: "1px solid rgba(44,44,42,0.12)",
          color: "#2c2c2a",
          borderRadius: "14px",
        },
      }}
    />
  );
}
