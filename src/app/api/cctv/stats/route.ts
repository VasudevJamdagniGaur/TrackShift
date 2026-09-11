import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const root = path.join(process.cwd(), "data", "cctv");
  try {
    const jobsDir = path.join(root, "jobs");
    const videosDir = path.join(root, "videos");
    const violationsDir = path.join(root, "violations");
    const jobFiles = await readdir(jobsDir).catch(() => []);
    const videoFiles = await readdir(videosDir).catch(() => []);
    const vioFiles = await readdir(violationsDir).catch(() => []);

    const jobs = [];
    for (const f of jobFiles.filter((x) => x.endsWith(".json"))) {
      jobs.push(JSON.parse(await readFile(path.join(jobsDir, f), "utf-8")));
    }
    const violations = [];
    for (const f of vioFiles.filter((x) => x.endsWith(".json"))) {
      violations.push(JSON.parse(await readFile(path.join(violationsDir, f), "utf-8")));
    }

    return NextResponse.json({
      totalVideos: videoFiles.filter((x) => x.endsWith(".json")).length,
      totalMotorcycles: jobs.reduce((s, j) => s + Number(j.motorcycles || 0), 0),
      totalPotentialViolations: violations.filter((v) => v.status === "POTENTIAL").length,
      totalConfirmedViolations: violations.filter((v) => v.status === "CONFIRMED").length,
      platesIdentified: violations.filter(
        (v) => v.plateText && v.plateStatus !== "NEEDS_REVIEW"
      ).length,
      platesUnreadable: violations.filter(
        (v) => !v.plateText || v.plateStatus === "NEEDS_REVIEW"
      ).length,
      processingJobs: jobs.filter((j) => j.status === "PROCESSING").length,
    });
  } catch {
    return NextResponse.json({
      totalVideos: 0,
      totalMotorcycles: 0,
      totalPotentialViolations: 0,
      totalConfirmedViolations: 0,
      platesIdentified: 0,
      platesUnreadable: 0,
      processingJobs: 0,
    });
  }
}
