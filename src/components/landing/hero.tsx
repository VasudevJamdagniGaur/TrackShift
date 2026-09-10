"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platformStats } from "@/data/mock";
import { BRAND } from "@/lib/constants";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(184,151,90,0.14),transparent_45%),radial-gradient(ellipse_at_bottom_left,rgba(27,58,47,0.08),transparent_40%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-cream/80 px-3 py-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            Continuous infrastructure intelligence
          </div>
          <h1 className="font-serif text-5xl leading-[1.05] text-charcoal md:text-6xl lg:text-7xl">
            On Every Route,
            <span className="mt-1 block text-gold">A Better Tomorrow.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Hayagriva turns everyday bus journeys into continuous road
            intelligence — detecting damage, mapping risk and helping cities
            prioritize what needs attention.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/map">
                Explore Road Intelligence
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
          <p className="mt-8 max-w-lg font-serif text-xl text-forest/90">
            “{BRAND.philosophy}”
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.1 }}
          className="relative"
        >
          <HeroIllustration />
        </motion.div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-10 md:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              value: `${platformStats.citiesMonitored}+`,
              label: "Cities Monitored",
            },
            {
              value: `${Math.round(platformStats.kilometersScanned / 1000)}K+`,
              label: "Kilometers Scanned",
            },
            {
              value: `${Math.round(platformStats.issuesDetected / 1000000)}M+`,
              label: "Road Issues Detected",
            },
            {
              value: platformStats.continuousMonitoring,
              label: "Continuous Monitoring",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[1.25rem] border border-[var(--border)] bg-cream/70 px-5 py-5 shadow-[var(--shadow-soft)]"
            >
              <div className="font-serif text-3xl text-forest md:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Demo monitoring values — structured for live backend replacement.
        </p>
      </div>
    </section>
  );
}

function HeroIllustration() {
  return (
    <div className="relative overflow-hidden rounded-[1.8rem] border border-[var(--border-strong)] bg-[#f3eee4] shadow-[var(--shadow)]">
      <Image
        src="/brand/hero-illustration.jpg"
        alt="Hayagriva road intelligence — buses scanning routes with live damage detection"
        width={1200}
        height={900}
        priority
        unoptimized
        className="h-auto w-full object-cover object-center"
      />
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Move",
      copy: "Public buses travel their regular routes across the city.",
    },
    {
      n: "02",
      title: "Observe",
      copy: "Forward-facing cameras continuously capture road conditions.",
    },
    {
      n: "03",
      title: "Understand",
      copy: "Computer vision detects and classifies damage with confidence scores.",
    },
    {
      n: "04",
      title: "Act",
      copy: "Hayagriva maps, prioritizes and reports infrastructure issues.",
    },
  ];

  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 md:px-6">
      <div className="max-w-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          How It Works
        </div>
        <h2 className="mt-2 font-serif text-4xl text-charcoal md:text-5xl">
          Every Journey Can Tell a Story About the Road.
        </h2>
        <p className="mt-4 text-muted">
          Public buses already travel the roads cities need to monitor.
          Hayagriva turns those journeys into a continuously updated view of
          road health.
        </p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.n}
            className="rounded-[1.4rem] border border-[var(--border)] bg-cream/80 p-6 shadow-[var(--shadow-soft)]"
          >
            <div className="font-serif text-4xl text-gold/80">{step.n}</div>
            <h3 className="mt-3 font-serif text-2xl">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.copy}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--border)] bg-beige-soft/50 px-4 py-4 text-center text-sm text-forest">
        BUS → CAMERA → AI → MAP → ACTION
      </div>
    </section>
  );
}

export function LandingCTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 md:px-6">
      <div className="overflow-hidden rounded-[1.8rem] border border-[var(--border)] bg-forest px-8 py-12 text-cream shadow-[var(--shadow)] md:px-12">
        <div className="max-w-2xl">
          <h2 className="font-serif text-4xl md:text-5xl">
            Detect. Locate. Track. Verify. Prioritize. Report.
          </h2>
          <p className="mt-4 text-cream/75">
            {BRAND.philosophy} Explore the live map, review evidence, and see
            which roads deserve attention first.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="gold" size="lg">
              <Link href="/dashboard">Open Dashboard</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/20 text-cream hover:bg-white/10"
            >
              <Link href="/citizen">Citizen Portal</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
