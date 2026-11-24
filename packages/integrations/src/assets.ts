// pnpm assets [-- --force] [--only <id>]: build-time art for the client (SPEC.md section 16).
// IMAGE_GENERATOR=runware generates with Runware; otherwise the stub writes flat placeholders.
// Existing images are kept unless --force, so a re-run never spends money twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GENERATED_ASSETS, type GeneratedAssetEntry, type GeneratedAssetManifest } from "@neon-bay/shared";
import { createImageGenerator } from "./index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { force: { type: "boolean", default: false }, only: { type: "string" } },
});

const outDir = `${root}apps/client/public/generated`;
mkdirSync(outDir, { recursive: true });
const manifestPath = `${outDir}/manifest.json`;
const previous: GeneratedAssetManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { generatedAt: "", assets: [] };
const byId = new Map(previous.assets.map((a) => [a.id, a]));

const gen = createImageGenerator(process.env, (l) => console.log(l));
let spent = 0;
for (const spec of GENERATED_ASSETS) {
  if (values.only && spec.id !== values.only) continue;
  const file = `${outDir}/${spec.id}.png`;
  const prior = byId.get(spec.id);
  if (!values.force && existsSync(file) && prior && prior.generator !== "stub" && prior.prompt === spec.prompt) {
    console.log(`keep ${spec.id}`);
    continue;
  }
  const img = await gen.generate({ prompt: spec.prompt, width: spec.width, height: spec.height });
  writeFileSync(file, img.bytes);
  spent += img.costUsd ?? 0;
  const entry: GeneratedAssetEntry = { id: spec.id, kind: spec.kind, path: `/generated/${spec.id}.png`, prompt: spec.prompt, generator: gen.name, model: img.model, seed: img.seed, costUsd: img.costUsd };
  byId.set(spec.id, entry);
  console.log(`wrote ${spec.id} (${gen.name}${img.costUsd ? `, $${img.costUsd}` : ""})`);
}
const manifest: GeneratedAssetManifest = { generatedAt: new Date().toISOString(), assets: GENERATED_ASSETS.flatMap((s) => byId.get(s.id) ?? []) };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${manifest.assets.length} assets via ${gen.name}; spent $${spent.toFixed(4)}`);
