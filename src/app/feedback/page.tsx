"use client";

import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function FeedbackPage() {
  return (
    <DashboardShell>
      <div className="mb-6 max-w-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Feedback
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Help Improve Detection Quality
        </h1>
        <p className="mt-2 text-sm text-muted">
          Field teams can report incorrect detections or missing hazards.
          Hayagriva remains an assistant — human verification stays essential.
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Submit feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Feedback recorded (demo)");
            }}
          >
            <Input placeholder="Issue ID (optional)" />
            <Input placeholder="Location / road name" required />
            <textarea
              required
              placeholder="What should we review?"
              className="min-h-32 w-full rounded-xl border border-[var(--border-strong)] bg-cream px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <Button type="submit">Send Feedback</Button>
          </form>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
