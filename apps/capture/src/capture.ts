// pnpm capture -- --frames 200 --seed 1 [--width 960 --height 540] [--no-game] [--warmup 20]
// Starts the game server, the agent crew and the client in capture mode, then has the client
// render N labelled frames. Writes KITTI (image_2/label_2), COCO and an HTML viewer.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { CaptureApi } from "@neon-bay/shared";
import { addToCoco, CATEGORIES, kittiLines, type CocoDataset } from "./labels.js";
import { writeViewer, type FrameSummary } from "./viewer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const { chromium } = createRequire(path.join(root, "package.json"))("@playwright/test") as typeof import("@playwright/test");

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    frames: { type: "string", default: "200" },
    seed: { type: "string", default: "1" },
    width: { type: "string", default: "960" },
    height: { type: "string", default: "540" },
    warmup: { type: "string", default: "20" },
    out: { type: "string" },
    "no-game": { type: "boolean", default: false },
  },
});
const frames = Number(values.frames);
const seed = Number(values.seed);
const width = Number(values.width);
const height = Number(values.height);
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const outDir = path.resolve(values.out ?? path.join(root, "data", "captures", `${stamp}-seed${seed}`));
const serverPort = 27000 + Math.floor(Math.random() * 1000);
const clientPort = 28000 + Math.floor(Math.random() * 1000);

const children: ChildProcess[] = [];
function start(name: string, args: string[], env: Record<string, string>) {
  const c = spawn("pnpm", args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  c.stderr?.on("data", (d: Buffer) => {
    const s = d.toString();
    if (/error/i.test(s) && !/deprecated/i.test(s)) process.stderr.write(`[${name}] ${s}`);
  });
  children.push(c);
  return c;
}
function stopAll() {
  for (const c of children) {
    try {
      if (c.pid) process.kill(-c.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

async function waitForPort(port: number, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = createConnection({ port, host: "localhost" }, () => {
        s.end();
        resolve(true);
      });
      s.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`nothing listening on ${port} after ${timeoutMs} ms`);
}

declare global {
  interface Window {
    __neonBayCapture?: CaptureApi;
  }
}

const decode = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

async function main() {
  for (const d of ["image_2", "label_2", "mask"]) mkdirSync(path.join(outDir, d), { recursive: true });
  console.log(`[capture] ${frames} frames, seed ${seed}, ${width}x${height} -> ${path.relative(root, outDir)}`);

  if (!values["no-game"]) {
    // The heist runs with its agent crew as live traffic. MIN_HUMANS=0 so nobody needs to press ready.
    start("server", ["--filter", "@neon-bay/server", "start"], { PORT: String(serverPort), MIN_HUMANS: "0", NEON_BAY_DATA_DIR: path.join(outDir, "ledger") });
    await waitForPort(serverPort);
    start("agents", ["--filter", "@neon-bay/agents", "start"], { GAME_SERVER_URL: `http://localhost:${serverPort}`, LLM_PROVIDER: "stub" });
  }
  start("client", ["--filter", "@neon-bay/client", "exec", "vite", "--port", String(clientPort), "--strictPort"], {
    VITE_SERVER_URL: values["no-game"] ? "http://localhost:1" : `http://localhost:${serverPort}`,
  });
  await waitForPort(clientPort);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("[client]", e.message));
  await page.goto(`http://localhost:${clientPort}/?capture=1&seed=${seed}&name=Camera`);
  await page.waitForFunction(() => (window.__neonBayCapture?.labelledCount() ?? 0) > 10, null, { timeout: 90_000 });
  const warmup = Number(values.warmup);
  if (warmup > 0) {
    console.log(`[capture] letting the crew play for ${warmup} s first`);
    await page.waitForTimeout(warmup * 1000);
  }

  const coco: CocoDataset = { info: { description: "Neon Bay '86 synthetic capture (labels rendered by the engine, no human annotation)", date_created: new Date().toISOString(), seed }, images: [], annotations: [], categories: CATEGORIES };
  const summaries: FrameSummary[] = [];
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const f = await page.evaluate((index) => window.__neonBayCapture!.frame(index), i);
    const name = String(i).padStart(6, "0");
    writeFileSync(path.join(outDir, "image_2", `${name}.png`), decode(f.rgb));
    writeFileSync(path.join(outDir, "mask", `${name}.png`), decode(f.mask));
    writeFileSync(path.join(outDir, "label_2", `${name}.txt`), kittiLines(f.objects) + (f.objects.length ? "\n" : ""));
    addToCoco(coco, f, `image_2/${name}.png`);
    summaries.push({ name, conditions: f.conditions, camera: f.camera.mode, width: f.width, height: f.height, objects: f.objects.map(({ id, cls, bbox, occlusion, truncation, distance }) => ({ id, cls, bbox, occlusion, truncation, distance })) });
    if ((i + 1) % 10 === 0 || i === frames - 1) {
      const rate = (i + 1) / ((Date.now() - started) / 1000);
      console.log(`[capture] ${i + 1}/${frames} frames, ${coco.annotations.length} labels (${rate.toFixed(1)} frames/s)`);
    }
    // Let the world move on between frames, like the paper's 1 Hz capture.
    await page.waitForTimeout(250);
  }
  await browser.close();

  writeFileSync(path.join(outDir, "coco.json"), JSON.stringify(coco));
  writeFileSync(path.join(outDir, "frames.json"), JSON.stringify(summaries));
  const stats = writeViewer(outDir, summaries, { seed, startedAt: coco.info.date_created, wallSeconds: (Date.now() - started) / 1000 });
  writeFileSync(path.join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(`[capture] done: ${stats.images} images, ${stats.labels} labels (${stats.byClass.Car} cars, ${stats.byClass.Pedestrian} pedestrians), 0 human labels`);
  console.log(`[capture] open ${path.join(outDir, "index.html")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(stopAll);
