"use client";

import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">
          Settings
        </div>
        <h1 className="mt-1 font-serif text-3xl md:text-4xl">
          Workspace Preferences
        </h1>
      </div>
      <div className="grid max-w-3xl gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Monitoring defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] px-4 py-3">
              <span>Show live monitoring indicator</span>
              <input type="checkbox" defaultChecked className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] px-4 py-3">
              <span>Email weekly road condition digest</span>
              <input type="checkbox" defaultChecked className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] px-4 py-3">
              <span>Label datasets as demo when mocked</span>
              <input type="checkbox" defaultChecked className="h-4 w-4" />
            </label>
            <Button onClick={() => toast.success("Settings saved (demo)")}>
              Save changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
