import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/constants";

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-14 md:px-6 page-enter">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          About Hayagriva
        </div>
        <h1 className="mt-2 font-serif text-5xl text-charcoal">
          The Intelligence Behind Every Journey.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          Hayagriva is an AI-powered road intelligence platform. Public buses
          become mobile observatories — capturing road conditions, detecting
          damage, and helping cities prioritize safer infrastructure.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          The name draws lightly from a tradition associated with knowledge and
          wisdom. The product itself is civic technology: calm, precise, and
          designed for municipalities, transport departments, and infrastructure
          teams.
        </p>
        <blockquote className="mt-8 border-l-2 border-gold pl-5 font-serif text-2xl text-forest">
          “{BRAND.philosophy}”
        </blockquote>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">Explore Platform</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/ai">View AI Architecture</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
