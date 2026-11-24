// 3D models generated for this project at build time (Runware 3dInference), written to
// apps/client/public/generated/models/ with a manifest. The client falls back to its procedural
// models when a file is missing, so the game still runs fully stubbed. All prompts describe
// original designs: no real brands, car makes, logos or text.

export type GeneratedModelKind = "car" | "character" | "prop" | "building" | "boat" | "animal";
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
  /** Buildings: stretched to the collider box, so physics and visuals always agree. */
  fitFootprint?: boolean;
}

export interface GeneratedModelEntry {
  id: string;
  file: string;
  kind: GeneratedModelKind;
  heightMetres: number;
  paint?: string;
  fitFootprint?: boolean;
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

const BUILDING = (what: string) =>
  `${what} Realistic 3D building, the whole building seen from outside, rectangular footprint, flat roof, main entrance in the middle of the front facade. No ground plane, no people, no vehicles, no trees. ${NO_MARKS} No signs with words.`;
const HOTEL = (storeys: number, paint: string, extra: string) =>
  BUILDING(`A ${storeys}-storey 1980s beachfront art deco hotel in the Miami Beach style: ${paint} and white stucco walls, rounded corners, horizontal eyebrow ledges over long rows of windows, a central vertical tower fin rising above the roofline, ${extra}, a shaded front terrace at ground level.`);

export const GENERATED_MODELS: readonly GeneratedModelSpec[] = [
  { id: "car_white", kind: "car", engine: "tripo", prompt: CAR("pearl white"), faces: 16000, heightMetres: 1.25, paint: "#f4f1ea" },
  { id: "car_pink", kind: "car", engine: "tripo", prompt: CAR("hot pink"), faces: 16000, heightMetres: 1.25, paint: "#ff4fa3" },
  { id: "car_teal", kind: "car", engine: "tripo", prompt: CAR("teal"), faces: 16000, heightMetres: 1.25, paint: "#2ec4b6" },
  // Second Street (front faces the street, -x). Heights match the colliders.
  { id: "bld_police_station", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 9, prompt: BUILDING("A long, low two-storey 1980s art deco police station: pale blue and white stucco, horizontal racing-stripe bands, glass-block windows, a flat entrance canopy over wide steps, a parapet with stepped corners.") },
  { id: "bld_nightclub", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 8, prompt: BUILDING("A two-storey 1980s art deco nightclub: magenta and white stucco, a curved corner, porthole windows, a tall vertical fin above the entrance, neon tube outlines along the roof edge, double doors under a chrome canopy.") },
  { id: "bld_pawn_shop", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 6, prompt: BUILDING("A single-storey 1980s beachfront shop: faded tan stucco, a wide storefront with large display windows behind roll-up security shutters, a striped fabric awning, a low parapet.") },
  { id: "bld_exchange", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 10, prompt: BUILDING("A three-storey 1980s art deco office building: mint green and cream stucco, fluted pilasters, tall vertical windows with chrome frames, a stepped parapet, a polished stone entrance with brass doors.") },
  // Hotel row (front faces the ocean, +x). The client picks the variant by storeys.
  { id: "bld_hotel_3", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 11.4, prompt: HOTEL(3, "pastel pink", "porthole windows on the corners") },
  { id: "bld_hotel_4", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 14.8, prompt: HOTEL(4, "mint green", "corner windows wrapping around") },
  { id: "bld_hotel_5", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 18.2, prompt: HOTEL(5, "lemon yellow", "balconies with tubular steel railings") },
  { id: "bld_hotel_5b", kind: "building", engine: "tripo", fitFootprint: true, faces: 20000, heightMetres: 18.2, prompt: HOTEL(5, "lavender", "two symmetrical wings and a stepped central tower") },
  // Marina and beach.
  { id: "yacht", kind: "boat", engine: "tripo", faces: 12000, heightMetres: 4, prompt: `A white 1980s motor yacht about twelve metres long: sleek hull, a flybridge, chrome railings, tinted windows, floating level. Realistic game asset, no water. ${NO_MARKS}` },
  { id: "speedboat", kind: "boat", engine: "tripo", faces: 12000, heightMetres: 1.8, prompt: `A 1980s offshore powerboat: a long pointed hull, a low open cockpit, glossy hot pink and white paint with racing stripes. Realistic game asset, no water. ${NO_MARKS}` },
  { id: "lifeguard_tower", kind: "prop", engine: "tripo", faces: 8000, heightMetres: 4.5, prompt: `A small beach lifeguard tower on wooden stilts: a pastel pink hut with a slanted roof, a railed deck and a ramp down to the sand, 1980s Miami Beach style. Realistic game asset, no ground. ${NO_MARKS}` },
  // Ambient NPCs (client-side scenery; the server never sees them).
  { id: "jogger", kind: "character", engine: "meshy", aPose: true, faces: 10000, heightMetres: 1.66, prompt: PERSON("a woman out jogging in 1980s style: a bright turquoise leotard over pink leggings, white leg warmers, a terry-cloth headband, white running shoes, a high ponytail") },
  { id: "skater", kind: "character", engine: "meshy", aPose: true, faces: 10000, heightMetres: 1.76, prompt: PERSON("a young man in 1980s beach style: a cropped tank top, short neon yellow shorts, knee pads, white tube socks, roller skates, a headband, curly hair") },
  { id: "beachgoer", kind: "character", engine: "meshy", aPose: true, faces: 10000, heightMetres: 1.65, prompt: PERSON("a woman heading to the beach in 1980s style: a flowing white cover-up over a coral swimsuit, a wide straw sun hat, sandals, big round sunglasses") },
  { id: "retiree", kind: "character", engine: "meshy", aPose: true, faces: 10000, heightMetres: 1.72, prompt: PERSON("a retired man in his seventies on a seaside stroll: a white short-sleeved shirt with pleats, beige slacks, a flat cap, white loafers, grey hair and a moustache") },
  { id: "dog", kind: "animal", engine: "tripo", faces: 8000, heightMetres: 0.62, prompt: `A friendly medium-sized dog with a golden coat standing on all four legs, tail up, head forward, side profile pose. Realistic game asset, no ground, no collar tag text. ${NO_MARKS}` },
  { id: "palm", kind: "prop", engine: "tripo", prompt: "A single tall coconut palm tree with a slender, gently curved trunk and a full crown of green fronds. Realistic, game asset, no ground, no pot.", faces: 8000, heightMetres: 9 },
  { id: "rico", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.8, prompt: PERSON("a man in his thirties in 1980s beachfront style: a pastel teal linen suit jacket with sleeves pushed up over a white t-shirt, light cream trousers, loafers, aviator sunglasses, short dark hair") },
  { id: "marisol", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.68, prompt: PERSON("a woman in her twenties in 1980s style: an oversized denim jacket over a neon pink top, high-waisted light jeans, white high-top sneakers, big curly dark hair") },
  { id: "dex", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.88, prompt: PERSON("a broad, muscular man in 1980s style: a black sleeveless tank top, a gold chain, dark cargo trousers, heavy boots, a shaved head and stubble") },
  { id: "opal", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.7, prompt: PERSON("a woman in her forties in 1980s style: a white power suit with big shoulder pads, matching trousers, low heels, a short blonde bob haircut") },
  { id: "cop", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.82, prompt: PERSON("a generic 1980s city police officer: a light blue short-sleeved uniform shirt, navy trousers, a black duty belt, a peaked cap, plain uniform with no badges or patches") },
  { id: "tourist", kind: "character", engine: "meshy", aPose: true, faces: 12000, heightMetres: 1.78, prompt: PERSON("a man on holiday in 1980s style: a bright floral short-sleeved shirt, khaki shorts, white sneakers, a straw hat") },
];
