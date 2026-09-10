import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/brand/hayagriva-mark.png";
const ICON_SRC = "/brand/hayagriva-icon.png";

export function HorseMark({ className }: { className?: string }) {
  return (
    <Image
      src={ICON_SRC}
      alt=""
      width={40}
      height={40}
      unoptimized
      className={cn("h-8 w-8 object-contain", className)}
      aria-hidden
    />
  );
}

export function Logo({
  href = "/",
  showTagline = false,
  compact = false,
  inverted = false,
  className,
}: {
  href?: string;
  showTagline?: boolean;
  compact?: boolean;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex shrink-0 items-center",
        inverted && "brightness-0 invert",
        className
      )}
      aria-label="Hayagriva — Smarter Roads. A Wiser Tomorrow."
    >
      <Image
        src={LOGO_SRC}
        alt="Hayagriva"
        width={compact ? 280 : showTagline ? 340 : 300}
        height={compact ? 72 : showTagline ? 96 : 80}
        priority
        unoptimized
        className={cn(
          "h-auto w-auto object-contain object-left transition group-hover:opacity-90",
          compact ? "max-h-12 md:max-h-14" : showTagline ? "max-h-16 md:max-h-[4.75rem]" : "max-h-14"
        )}
      />
    </Link>
  );
}
