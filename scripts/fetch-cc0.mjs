// Downloads the CC0 assets the client uses from Poly Haven (https://polyhaven.com, CC0 1.0)
// into apps/client/public/cc0/. Re-runnable; skips files that already exist. Logged in ASSETS.md.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../apps/client/public/cc0");
const TEXTURES = {
  plastered_wall: ["Diffuse", "nor_gl", "Rough"], // building stucco
  clean_asphalt: ["Diffuse", "nor_gl", "Rough"], // roads
  coast_sand_01: ["Diffuse", "nor_gl", "Rough"], // beach
  leafy_grass: ["Diffuse", "nor_gl", "Rough"], // park
  large_grey_tiles: ["Diffuse", "nor_gl", "Rough"], // pavements
};
const HDRI = "belfast_sunset_puresky";
const MODELS = ["street_lamp_01", "metal_trash_can"];

async function save(url, file) {
  const path = join(OUT, file);
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  console.log("saved", file);
}
const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();

for (const [id, maps] of Object.entries(TEXTURES)) {
  const f = await files(id);
  for (const m of maps) await save(f[m]["1k"].jpg.url, `textures/${id}_${m.toLowerCase()}.jpg`);
}
await save((await files(HDRI)).hdri["2k"].hdr.url, `hdri/${HDRI}_2k.hdr`);
for (const id of MODELS) {
  const g = (await files(id)).gltf["1k"].gltf;
  await save(g.url, `models/${id}/${id}.gltf`);
  for (const [rel, inc] of Object.entries(g.include ?? {})) await save(inc.url, `models/${id}/${rel}`);
}
console.log("done");
