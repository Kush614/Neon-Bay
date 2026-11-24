// pnpm models [-- --force] [--only <id>]: build-time 3D models for the client.
// MODEL_GENERATOR=runware generates with Runware 3dInference (Tripo / Meshy); the stub writes
// nothing and the client keeps its procedural models. Existing models are kept unless --force,
// so a re-run never spends money twice. Runs in parallel (each task takes minutes).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GENERATED_MODELS, type GeneratedModelEntry, type GeneratedModelManifest, type GeneratedModelSpec } from "@neon-bay/shared";
import { createModelGenerator } from "./index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { force: { type: "boolean", default: false }, reoptimise: { type: "boolean", default: false }, only: { type: "string" } },
});

const outDir = `${root}apps/client/public/generated/models`;
const rawDir = `${root}data/models-raw`; // gitignored: untouched downloads, kept so re-optimising is free
mkdirSync(outDir, { recursive: true });
mkdirSync(rawDir, { recursive: true });
const gltfTransform = fileURLToPath(new URL("../node_modules/.bin/gltf-transform", import.meta.url));

/** 1024 px WebP textures and meshopt geometry: about 30x smaller, same look in game. */
/**
 * People are small on screen and Meshy ignores the face limit (about 200k triangles back), so
 * they get 512 px textures and are simplified to roughly 8% of their vertices. Everything else
 * keeps full geometry and 1024 px textures.
 */
function optimiseArgs(kind: GeneratedModelSpec["kind"]): string[] {
  return kind === "character"
    ? ["--texture-size", "512", "--simplify", "true", "--simplify-ratio", "0.08", "--simplify-error", "0.002"]
    : ["--texture-size", "1024", "--simplify", "false"];
}

function optimise(src: string, dest: string, kind: GeneratedModelSpec["kind"]): void {
  execFileSync(gltfTransform, ["optimize", src, dest, ...optimiseArgs(kind), "--texture-compress", "webp", "--compress", "meshopt"], { stdio: "ignore" });
}
const manifestPath = `${outDir}/manifest.json`;
const previous: GeneratedModelManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { generatedAt: "", models: [] };
const byId = new Map(previous.models.map((m) => [m.id, m]));
const gen = createModelGenerator(process.env, (l) => console.log(l));
const only = values.only?.split(",");

const jobs = GENERATED_MODELS.filter((s) => !only || only.includes(s.id)).map(async (spec) => {
  const file = `${outDir}/${spec.id}.glb`;
  const prior = byId.get(spec.id);
  const raw = `${rawDir}/${spec.id}.glb`;
  if (!values.force && existsSync(file) && prior && prior.prompt === spec.prompt) {
    // --reoptimise rebuilds the shipped file from the saved raw download (no new generation).
    if (values.reoptimise && existsSync(raw)) {
      optimise(raw, file, spec.kind);
      return void console.log(`reoptimised ${spec.id}`);
    }
    return void console.log(`keep ${spec.id}`);
  }
  console.log(`generating ${spec.id} (${spec.engine})…`);
  const out = await gen.generate({ engine: spec.engine, prompt: spec.prompt, faces: spec.faces, ...(spec.aPose ? { aPose: true } : {}) });
  if (!out.bytes) return void console.log(`skip ${spec.id} (${gen.name} produced no file)`);
  writeFileSync(raw, out.bytes);
  optimise(raw, file, spec.kind);
  const entry: GeneratedModelEntry = {
    id: spec.id,
    file: `/generated/models/${spec.id}.glb`,
    kind: spec.kind,
    heightMetres: spec.heightMetres,
    ...(spec.paint ? { paint: spec.paint } : {}),
    ...(spec.fitFootprint ? { fitFootprint: true } : {}),
    generator: gen.name,
    model: out.model,
    seed: out.seed,
    costUsd: out.costUsd,
    prompt: spec.prompt,
  };
  byId.set(spec.id, entry);
  console.log(`wrote ${spec.id} (${(out.bytes.length / 1e6).toFixed(1)} MB raw → ${(statSync(file).size / 1e6).toFixed(2)} MB${out.costUsd ? `, $${out.costUsd}` : ""})`);
});
const results = await Promise.allSettled(jobs);
for (const r of results) if (r.status === "rejected") console.error(`failed: ${r.reason}`);
const manifest: GeneratedModelManifest = { generatedAt: new Date().toISOString(), models: GENERATED_MODELS.flatMap((s) => byId.get(s.id) ?? []) };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const spent = manifest.models.reduce((a, m) => a + (m.costUsd ?? 0), 0);
console.log(`manifest: ${manifest.models.length} models via ${gen.name}; total recorded cost $${spent.toFixed(2)}`);
