import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createInterface } from "readline";
import path from "path";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type HelmetWorkerState = {
  child: ChildProcessWithoutNullStreams | null;
  ready: Promise<void> | null;
  pending: Map<string, Pending>;
  nextId: number;
};

const globalForWorker = globalThis as typeof globalThis & {
  __hayagrivaHelmetWorker?: HelmetWorkerState;
};

function state(): HelmetWorkerState {
  if (!globalForWorker.__hayagrivaHelmetWorker) {
    globalForWorker.__hayagrivaHelmetWorker = {
      child: null,
      ready: null,
      pending: new Map(),
      nextId: 1,
    };
  }
  return globalForWorker.__hayagrivaHelmetWorker;
}

function ensureWorker(): Promise<void> {
  const s = state();
  if (s.ready) return s.ready;

  s.ready = new Promise<void>((resolve, reject) => {
    const script = path.join(process.cwd(), "scripts", "helmet_live_worker.py");
    const child = spawn("python", ["-u", script], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    s.child = child;

    let settled = false;
    const rl = createInterface({ input: child.stdout });

    rl.on("line", (line) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      if (msg.ready && !settled) {
        settled = true;
        resolve();
        return;
      }

      const id = String(msg.id ?? "");
      const pending = s.pending.get(id);
      if (!pending) return;
      s.pending.delete(id);
      if (msg.ok === false) {
        pending.reject(new Error(String(msg.error || "Helmet detect failed")));
      } else {
        pending.resolve(msg);
      }
    });

    child.stderr.on("data", () => {
      // model load logs — ignore
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
      failAll(err);
      reset();
    });

    child.on("close", (code) => {
      const err = new Error(`Helmet worker exited (${code ?? "?"})`);
      if (!settled) {
        settled = true;
        reject(err);
      }
      failAll(err);
      reset();
    });
  });

  return s.ready;
}

function failAll(err: Error) {
  const s = state();
  for (const pending of s.pending.values()) {
    pending.reject(err);
  }
  s.pending.clear();
}

function reset() {
  const s = state();
  s.child = null;
  s.ready = null;
}

export async function detectHelmetFrame(payload: {
  imagePath: string;
  conf?: number;
  withPlate?: boolean;
  saveTicket?: boolean;
  timestampSec?: number;
  jobId?: string;
}): Promise<Record<string, unknown>> {
  await ensureWorker();
  const s = state();
  if (!s.child) {
    throw new Error("Helmet worker is not running");
  }

  const id = String(s.nextId++);
  const message = {
    id,
    cmd: "detect",
    imagePath: payload.imagePath,
    conf: payload.conf ?? 0.25,
    withPlate: payload.withPlate ?? false,
    saveTicket: payload.saveTicket ?? false,
    timestampSec: payload.timestampSec ?? 0,
    jobId: payload.jobId ?? "live",
  };

  const result = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      s.pending.delete(id);
      reject(new Error("Helmet detect timed out"));
    }, 120_000);

    s.pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value as Record<string, unknown>);
      },
      reject: (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    });
  });

  s.child.stdin.write(`${JSON.stringify(message)}\n`);
  return result;
}
