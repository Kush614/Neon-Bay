// 3D models generated for this project at build time (Runware 3dInference), written to
// apps/client/public/generated/models/ with a manifest. The client falls back to its procedural
// models when a file is missing, so the game still runs fully stubbed. All prompts describe
// original designs: no real brands, car makes, logos or text.

export type GeneratedModelKind = "car" | "character" | "prop";
export type GeneratedModelEngine = "tripo" | "meshy";

export interface GeneratedModelSpec {
  id: string;
  kind: GeneratedModelKind;
  engine: GeneratedModelEngine;
  prompt: string;
  /** Triangle budget: Tripo faceLimit or Meshy polyCount. */
  faces: number;
  /** Real-world height the client scales the model to, in metres. */
  heightMetres: number;
  /** Characters only: generated in an A-pose so the client can rig them. */
  aPose?: boolean;
  /** Cars only: the paint colour, used to match a vehicle's colour to a variant. */
  paint?: string;
}

export interface GeneratedModelEntry {
  id: string;
  file: string;
  kind: GeneratedModelKind;
  heightMetres: number;
  paint?: string;
  generator: string;
  model: string | null;
  seed: number | null;
  costUsd: number | null;
  prompt: string;
}

export interface GeneratedModelManifest {
  generatedAt: string;
  models: GeneratedModelEntry[];
}

const NO_MARKS = "No logos, no badges, no text, no license plate lettering.";
const CAR = (name: string) =>
  `An original 1980s wedge-shaped two-door sports coupe, low and sleek, sharp creased lines, pop-up headlights, a full-width red tail-light bar across the rear, a small rear wing, black five-spoke alloy wheels, tinted windows, glossy ${name} paint. Realistic game asset. ${NO_MARKS}`;
const PERSON = (who: string) =>
  `Full-body realistic 3D character, ${who}. Standing straight in an A-pose, arms slightly away from the body, feet apart, facing forward. Realistic proportions and face, game-ready. ${NO_MARKS}`;

export const GENERATED_MODELS: readonly GeneratedModelSpec[] = [
  { id: "car_white", kind: "car", engine: "tripo", prompt: CAR("pearl white"), faces: 16000, heightMetres: 1.25, paint: "#f4f1ea" },
  { id: "car_pink", kind: "car", engine: "tripo", prompt: CAR("hot pink"), faces: 16000, heightMetres: 1.25, paint: "#ff4fa3" },
  { id: "car_teal", kind: "car", engine: "tripo", prompt: CAR("teal"), faces: 16000, heightMetres: 1.25, paint: "#2ec4b6" },
  { id: "palm", kind: "prop", engine: "tripo", prompt: "A single tall coconut palm tree with a slender, gently curved trunk and a full crown of green fronds. Realistic, game asset, no ground, no pot.", faces: 8000, heightMetres: 9 },
  { id: "rico", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.8, prompt: PERSON("a man in his thirties in 1980s beachfront style: a pastel teal linen suit jacket with sleeves pushed up over a white t-shirt, light cream trousers, loafers, aviator sunglasses, short dark hair") },
  { id: "marisol", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.68, prompt: PERSON("a woman in her twenties in 1980s style: an oversized denim jacket over a neon pink top, high-waisted light jeans, white high-top sneakers, big curly dark hair") },
  { id: "dex", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.88, prompt: PERSON("a broad, muscular man in 1980s style: a black sleeveless tank top, a gold chain, dark cargo trousers, heavy boots, a shaved head and stubble") },
  { id: "opal", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.7, prompt: PERSON("a woman in her forties in 1980s style: a white power suit with big shoulder pads, matching trousers, low heels, a short blonde bob haircut") },
  { id: "cop", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.82, prompt: PERSON("a generic 1980s city police officer: a light blue short-sleeved uniform shirt, navy trousers, a black duty belt, a peaked cap, plain uniform with no badges or patches") },
  { id: "tourist", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.78, prompt: PERSON("a man on holiday in 1980s style: a bright floral short-sleeved shirt, khaki shorts, white sneakers, a straw hat") },
];
