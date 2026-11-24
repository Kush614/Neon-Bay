// Generated art (SPEC.md section 16: Runware ImageGenerator, build-time only).
// `pnpm assets` renders each entry to apps/client/public/generated/<id>.png and writes
// manifest.json; the client falls back to plain panels when an image is missing.
// Every brand here is invented for Neon Bay; no real brands, logos or car makes.
import { LOCATIONS } from "./world.js";

export type GeneratedAssetKind = "billboard" | "sign" | "texture" | "portrait";

export interface GeneratedAssetSpec {
  id: string;
  kind: GeneratedAssetKind;
  prompt: string;
  width: number;
  height: number;
}

export interface GeneratedAssetEntry {
  id: string;
  kind: GeneratedAssetKind;
  /** Path under the client's public root, e.g. "/generated/billboard_bank.png". */
  path: string;
  prompt: string;
  generator: string;
  model: string | null;
  seed: number | null;
  costUsd: number | null;
}

export interface GeneratedAssetManifest {
  generatedAt: string;
  assets: GeneratedAssetEntry[];
}

const STYLE =
  "Flat 2D advertisement poster artwork that fills the entire frame edge to edge, 1986 retro airbrush style, sunset gradient in hot pink and teal";
const NO = "No people, no frame, no building, no photo, no other text.";

function poster(headline: string, slogan: string, scene: string): string {
  return `${STYLE}. Big bold chrome lettering reads "${headline}" and below it smaller neon script text reads "${slogan}". ${scene}. ${NO}`;
}

export interface BillboardSpot {
  assetId: string;
  /** Centre of the billboard face. */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** Rotation about Y; Math.PI / 2 faces west, toward Second Street. */
  rotationY: number;
}

const ROOFTOP_BILLBOARDS: { loc: keyof typeof LOCATIONS; id: string; prompt: string }[] = [
  { loc: "police_station", id: "billboard_harbor_cola", prompt: poster("HARBOR COLA", "Taste the Tide", "A sweating glass bottle of pink grapefruit soda on the right, palm silhouettes") },
  { loc: "bank", id: "billboard_first_coral", prompt: poster("FIRST CORAL TRUST", "Your Money, Sun-Kissed", "A pink coral-shaped vault door and gold coins on the right, ocean horizon") },
  { loc: "nightclub", id: "billboard_velvet_static", prompt: poster("VELVET STATIC 96.6 FM", "Synth All Night", "A glowing boombox radio with cyan equalizer bars, a grid horizon") },
  { loc: "pawn_shop", id: "billboard_gatorline", prompt: poster("GATORLINE MARINE", "Outrun Everything", "A sleek white speedboat cutting across teal water with spray, a setting sun") },
  { loc: "exchange", id: "billboard_palmetto_video", prompt: poster("PALMETTO VIDEO", "Be Kind, Rewind", "A stack of VHS tapes and a palm tree, purple sky") },
];

export const BILLBOARD_SPOTS: readonly BillboardSpot[] = [
  ...ROOFTOP_BILLBOARDS.map(({ loc, id }) => {
    const l = LOCATIONS[loc];
    return { assetId: id, x: l.footprint.minX + 1, y: l.height + 3.2, z: (l.footprint.minZ + l.footprint.maxZ) / 2, width: 12, height: 6, rotationY: -Math.PI / 2 };
  }),
  { assetId: "billboard_seaspray", x: LOCATIONS.car_park.footprint.maxX + 2, y: 6, z: 0, width: 12, height: 6, rotationY: -Math.PI / 2 },
];

const FACADE = (what: string) =>
  `A straight-on orthographic photograph of ${what}, perfectly flat and front-facing, filling the entire frame edge to edge, evenly lit by soft daylight, no perspective, no sky, no ground, no people, no trees, no signs, no text. Seamless tileable texture.`;

export const GENERATED_ASSETS: readonly GeneratedAssetSpec[] = [
  { id: "facade_bank", kind: "texture", width: 1024, height: 1024, prompt: FACADE("a 1930s art deco bank wall in warm sandstone: fluted pilasters between tall bronze-framed windows, carved stone bands, polished granite base") },
  { id: "facade_city", kind: "texture", width: 1024, height: 1024, prompt: FACADE("a pastel stucco 1980s Miami Beach apartment building wall: a regular grid of four by four aluminium-framed windows with dark glass, thin white eyebrow ledges above each row") },
  ...ROOFTOP_BILLBOARDS.map(({ id, prompt }) => ({ id, kind: "billboard" as const, prompt, width: 1024, height: 512 })),
  {
    id: "billboard_seaspray",
    kind: "billboard",
    prompt: poster("SEASPRAY TELECOM", "Call From Anywhere", "A chunky white car phone with a coiled cord, a convertible silhouette on a coastal road"),
    width: 1024,
    height: 512,
  },
];
