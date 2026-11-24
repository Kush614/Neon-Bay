// Quality presets (SPEC.md section 8): ?quality=low|medium|high, default medium.
// low disables reflections, ambient occlusion and post-processing.
export type Quality = "low" | "medium" | "high";

export interface QualitySettings {
  quality: Quality;
  dpr: [number, number];
  shadowMapSize: number;
  shadows: boolean;
  reflections: boolean;
  ambientOcclusion: boolean;
  postprocessing: boolean;
  palms: number;
}

const PRESETS: Record<Quality, Omit<QualitySettings, "quality">> = {
  low: { dpr: [1, 1], shadowMapSize: 1024, shadows: true, reflections: false, ambientOcclusion: false, postprocessing: false, palms: 60 },
  medium: { dpr: [1, 1.5], shadowMapSize: 2048, shadows: true, reflections: true, ambientOcclusion: true, postprocessing: true, palms: 120 },
  high: { dpr: [1, 2], shadowMapSize: 4096, shadows: true, reflections: true, ambientOcclusion: true, postprocessing: true, palms: 180 },
};

function fromUrl(): Quality {
  const q = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("quality");
  return q === "low" || q === "high" ? q : "medium";
}

export const QUALITY: QualitySettings = { quality: fromUrl(), ...PRESETS[fromUrl()] };
