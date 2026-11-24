// Runware-generated 3D models (packages/shared/src/models3d.ts). Loaded once; when the manifest
// or a file is missing, callers keep their procedural models, so the game always runs stubbed.
import type { GeneratedModelEntry, GeneratedModelManifest } from "@neon-bay/shared";
import { useEffect, useState } from "react";

let cache: Promise<Map<string, GeneratedModelEntry>> | null = null;
let resolved: Map<string, GeneratedModelEntry> | null = null;

export function loadGeneratedModels(): Promise<Map<string, GeneratedModelEntry>> {
  cache ??= fetch("/generated/models/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<GeneratedModelManifest>) : { generatedAt: "", models: [] }))
    .catch(() => ({ generatedAt: "", models: [] }) as GeneratedModelManifest)
    .then((m) => (resolved = new Map(m.models.filter((e) => e.generator !== "stub").map((e) => [e.id, e]))));
  return cache;
}

/** The manifest entries, or null until loaded. */
export function useGeneratedModels(): Map<string, GeneratedModelEntry> | null {
  const [m, setM] = useState(resolved);
  useEffect(() => {
    if (!m) void loadGeneratedModels().then(setM);
  }, [m]);
  return m;
}

/** Which generated character a player uses: crew by name, cops share one, humans the tourist. */
export function characterModelId(name: string, role?: string): string {
  const n = name.toLowerCase();
  if (["rico", "marisol", "dex", "opal"].includes(n)) return n;
  if (role === "cop" || n === "vega" || n === "burke") return "cop";
  return "tourist";
}
