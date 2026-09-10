import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-[var(--border-strong)] bg-cream/80 px-4 py-2 text-sm text-charcoal placeholder:text-muted/80 outline-none transition focus:border-gold/50 focus:ring-2 focus:ring-[var(--ring)]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";
