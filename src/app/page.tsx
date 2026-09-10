import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import {
  HeroSection,
  HowItWorks,
  LandingCTA,
} from "@/components/landing/hero";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <HeroSection />
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="rounded-[1.6rem] border border-[var(--border)] bg-cream/80 p-6 md:p-8 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-serif text-3xl md:text-4xl">
                Continuous infrastructure intelligence — not magical detection.
              </h2>
              <p className="mt-3 text-muted">
                Hayagriva detects, locates, tracks, verifies, prioritizes and
                reports. Municipal teams stay in control of every decision.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard">Enter Platform</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/ai">AI Architecture</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <HowItWorks />
      <LandingCTA />
      <footer className="border-t border-[var(--border)] bg-cream/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
          <Logo showTagline />
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <Link href="/about" className="hover:text-charcoal">
              About
            </Link>
            <Link href="/citizen" className="hover:text-charcoal">
              Citizen View
            </Link>
            <Link href="/login" className="hover:text-charcoal">
              Sign In
            </Link>
          </div>
          <p className="text-xs text-muted">{BRAND.supporting}</p>
        </div>
      </footer>
    </div>
  );
}
