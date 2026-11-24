// Capture mode (?capture=1): the client becomes a synthetic-data camera. The game renders
// its own ground truth (instance masks, tight boxes, 3D labels) instead of humans labelling
// screenshots, after "Driving in the Matrix" (Johnson-Roberson et al., ICRA 2017).
import type { LabelClass } from "@neon-bay/shared";
import { create } from "zustand";

const params = new URLSearchParams(window.location.search);
export const CAPTURE = params.has("capture");
export const CAPTURE_SEED = Number(params.get("seed") ?? 1) || 1;

export type { LabelClass };
/** Put on an object's root group as `userData.captureLabel` to make it a labelled instance. */
export interface CaptureLabel {
  id: string;
  cls: LabelClass;
  /** World-space heading (radians, 0 = +z), for the 3D label. */
  heading?: number;
}

export interface Conditions {
  name: string;
  /** Sky sun direction, degrees. Below 0 is night. */
  skyElevation: number;
  skyAzimuth: number;
  /** Key light direction (the sun, or the moon at night). */
  lightElevation: number;
  lightAzimuth: number;
  lightIntensity: number;
  lightColor: string;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambientIntensity: number;
  turbidity: number;
  rayleigh: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
}

/** The look the game ships with. */
export const GOLDEN_HOUR: Conditions = {
  name: "golden_hour",
  skyElevation: 22.6,
  skyAzimuth: 146.3,
  lightElevation: 22.6,
  lightAzimuth: 146.3,
  lightIntensity: 2.2,
  lightColor: "#ffc690",
  hemiSky: "#ffe2c8",
  hemiGround: "#6a5a7a",
  hemiIntensity: 1.4,
  ambientIntensity: 0.35,
  turbidity: 6,
  rayleigh: 2.5,
  fogColor: "#e8a98a",
  fogNear: 250,
  fogFar: 900,
};

export const PRESETS: readonly Conditions[] = [
  GOLDEN_HOUR,
  { ...GOLDEN_HOUR, name: "noon_clear", skyElevation: 65, skyAzimuth: 120, lightElevation: 65, lightAzimuth: 120, lightIntensity: 2.6, lightColor: "#fff4e0", hemiSky: "#e8f1ff", hemiGround: "#7a7060", hemiIntensity: 1.2, ambientIntensity: 0.3, turbidity: 4, rayleigh: 1, fogColor: "#cfe3f0", fogNear: 300, fogFar: 1100 },
  { ...GOLDEN_HOUR, name: "dusk", skyElevation: 3, skyAzimuth: 170, lightElevation: 6, lightAzimuth: 170, lightIntensity: 1.0, lightColor: "#ff8a5c", hemiSky: "#c58fb0", hemiGround: "#3a2f4a", hemiIntensity: 0.75, ambientIntensity: 0.25, turbidity: 10, rayleigh: 3, fogColor: "#9a6a8a", fogNear: 150, fogFar: 650 },
  { ...GOLDEN_HOUR, name: "night", skyElevation: -10, skyAzimuth: 200, lightElevation: 40, lightAzimuth: 60, lightIntensity: 0.35, lightColor: "#8aa0ff", hemiSky: "#2a3060", hemiGround: "#100c18", hemiIntensity: 0.35, ambientIntensity: 0.18, turbidity: 2, rayleigh: 0.5, fogColor: "#1a1830", fogNear: 80, fogFar: 420 },
  { ...GOLDEN_HOUR, name: "overcast", skyElevation: 45, skyAzimuth: 120, lightElevation: 50, lightAzimuth: 120, lightIntensity: 0.9, lightColor: "#e8e8f0", hemiSky: "#d0d4dc", hemiGround: "#6a6a70", hemiIntensity: 1.6, ambientIntensity: 0.4, turbidity: 20, rayleigh: 4, fogColor: "#b8bcc4", fogNear: 120, fogFar: 600 },
  { ...GOLDEN_HOUR, name: "sea_fog", skyElevation: 30, skyAzimuth: 140, lightElevation: 30, lightAzimuth: 140, lightIntensity: 1.2, lightColor: "#ffe6cc", hemiSky: "#e6e0dc", hemiGround: "#7a7070", hemiIntensity: 1.1, ambientIntensity: 0.45, turbidity: 12, rayleigh: 2, fogColor: "#c9c2c0", fogNear: 20, fogFar: 160 },
];

export const useConditions = create<{ c: Conditions; set: (c: Conditions) => void }>((set) => ({
  c: GOLDEN_HOUR,
  set: (c) => set({ c }),
}));

export function direction(elevationDeg: number, azimuthDeg: number, r: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az)];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
