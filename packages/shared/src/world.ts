// World layout from SPEC.md section 7, stored as data. Client and server both build from this.
// Units are metres. +x is east (toward the ocean), -z is north, y is up.

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Box {
  /** Centre of the box in world space. */
  center: { x: number; y: number; z: number };
  /** Half extents. */
  half: { x: number; y: number; z: number };
}

export interface StaticBox extends Box {
  id: string;
  kind: "floor" | "building" | "hotel" | "wall" | "prop";
  color: string;
  /** Invisible colliders (map edges, sea wall) are not rendered. */
  visible: boolean;
}

export const WORLD_BOUNDS: Rect = { minX: 0, maxX: 258, minZ: -200, maxZ: 200 };

/** Top of the walkable ground and pier. */
export const GROUND_Y = 0;
/** Water surface sits below the ground so the shoreline reads as a drop. */
export const WATER_Y = -0.6;

export type BandId =
  | "second_street"
  | "service_alley"
  | "hotel_row"
  | "beachfront_avenue"
  | "park_promenade"
  | "beach"
  | "ocean";

export interface Band {
  id: BandId;
  label: string;
  minX: number;
  maxX: number;
  color: string;
  walkable: boolean;
}

export const BANDS: readonly Band[] = [
  { id: "second_street", label: "Second Street", minX: 0, maxX: 50, color: "#6b6670", walkable: true },
  { id: "service_alley", label: "Service alley", minX: 50, maxX: 58, color: "#4d4a52", walkable: true },
  { id: "hotel_row", label: "Hotel row", minX: 58, maxX: 88, color: "#b9aa9a", walkable: true },
  { id: "beachfront_avenue", label: "Beachfront avenue", minX: 88, maxX: 108, color: "#2f2e36", walkable: true },
  { id: "park_promenade", label: "Park promenade", minX: 108, maxX: 138, color: "#5f8f5a", walkable: true },
  { id: "beach", label: "Beach", minX: 138, maxX: 198, color: "#e8d3a6", walkable: true },
  { id: "ocean", label: "Ocean", minX: 198, maxX: 258, color: "#1f6f8b", walkable: false },
];

/** The north-south road strip on the west edge of the second street band. */
export const SECOND_STREET_ROAD: Rect = { minX: 0, maxX: 8, minZ: -200, maxZ: 200 };

export const CROSS_STREET_Z = [-150, -50, 50, 150] as const;
export const CROSS_STREET_WIDTH = 12;

/** Cross streets run from second street to the avenue. */
export const CROSS_STREETS: readonly Rect[] = CROSS_STREET_Z.map((z) => ({
  minX: 0,
  maxX: 88,
  minZ: z - CROSS_STREET_WIDTH / 2,
  maxZ: z + CROSS_STREET_WIDTH / 2,
}));

export type LocationId =
  | "police_station"
  | "bank"
  | "nightclub"
  | "pawn_shop"
  | "exchange"
  | "car_park"
  | "marina";

export const LOCATION_IDS: readonly LocationId[] = [
  "police_station",
  "bank",
  "nightclub",
  "pawn_shop",
  "exchange",
  "car_park",
  "marina",
];

export interface Location {
  id: LocationId;
  label: string;
  /** Centre from the spec table (y omitted; ground level). */
  center: { x: number; z: number };
  /** Building footprint, or the zone footprint for open-air locations. */
  footprint: Rect;
  /** Height of the building block; 0 for open-air zones. */
  height: number;
  /** A reachable point outside the front door, used for spawns and pathing. */
  entrance: { x: number; z: number };
  color: string;
}

// Building blocks on second street span x 8..50 so the back wall meets the alley at x = 50.
// Footprints contain the spec centre but stop short of the 12 m cross streets.
const BLOCK_MIN_X = 8;
const BLOCK_MAX_X = 50;

export const LOCATIONS: Readonly<Record<LocationId, Location>> = {
  police_station: {
    id: "police_station",
    label: "Police station",
    center: { x: 25, z: -170 },
    footprint: { minX: BLOCK_MIN_X, maxX: BLOCK_MAX_X, minZ: -192, maxZ: -158 },
    height: 9,
    entrance: { x: 5, z: -170 },
    color: "#4a6fa5",
  },
  bank: {
    id: "bank",
    label: "Bank",
    center: { x: 25, z: -60 },
    footprint: { minX: BLOCK_MIN_X, maxX: BLOCK_MAX_X, minZ: -80, maxZ: -57 },
    height: 12,
    entrance: { x: 5, z: -60 },
    color: "#c9b37e",
  },
  nightclub: {
    id: "nightclub",
    label: "Nightclub",
    center: { x: 25, z: 40 },
    footprint: { minX: BLOCK_MIN_X, maxX: BLOCK_MAX_X, minZ: 18, maxZ: 43 },
    height: 8,
    entrance: { x: 5, z: 40 },
    color: "#c2417f",
  },
  pawn_shop: {
    id: "pawn_shop",
    label: "Pawn shop",
    center: { x: 25, z: 90 },
    footprint: { minX: BLOCK_MIN_X, maxX: BLOCK_MAX_X, minZ: 76, maxZ: 100 },
    height: 6,
    entrance: { x: 5, z: 90 },
    color: "#8f7a5c",
  },
  exchange: {
    id: "exchange",
    label: "Exchange office",
    center: { x: 25, z: 120 },
    footprint: { minX: BLOCK_MIN_X, maxX: BLOCK_MAX_X, minZ: 108, maxZ: 140 },
    height: 10,
    entrance: { x: 5, z: 120 },
    color: "#5f9e8f",
  },
  car_park: {
    id: "car_park",
    label: "Car park",
    center: { x: 98, z: 0 },
    footprint: { minX: 100, maxX: 108, minZ: -16, maxZ: 16 },
    height: 0,
    entrance: { x: 98, z: 0 },
    color: "#3d3c48",
  },
  marina: {
    id: "marina",
    label: "Marina",
    center: { x: 205, z: 185 },
    footprint: { minX: 198, maxX: 214, minZ: 178, maxZ: 192 },
    height: 0,
    entrance: { x: 205, z: 185 },
    color: "#8a6a4a",
  },
};

/** The pier carries the walkway from the beach out to the marina. Its top is level with the ground. */
export const PIER: Rect = { minX: 190, maxX: 214, minZ: 178, maxZ: 192 };
export const PIER_THICKNESS = 1;

/** Ground slab covers every walkable band; the ocean has no ground, only the pier. */
export const GROUND: Rect = { minX: 0, maxX: 198, minZ: -200, maxZ: 200 };
export const GROUND_THICKNESS = 2;

export type BusinessId = "citrus_grove" | "palmetto_video" | "seaspray_telecom" | "coquina_realty";

export interface Business {
  id: BusinessId;
  label: string;
  startPrice: number;
}

/** Fictional businesses traded at the exchange (SPEC.md section 11). */
export const BUSINESSES: Readonly<Record<BusinessId, Business>> = {
  citrus_grove: { id: "citrus_grove", label: "Citrus Grove Juices", startPrice: 100 },
  palmetto_video: { id: "palmetto_video", label: "Palmetto Video Rental", startPrice: 100 },
  seaspray_telecom: { id: "seaspray_telecom", label: "Seaspray Telecom", startPrice: 100 },
  coquina_realty: { id: "coquina_realty", label: "Coquina Realty Trust", startPrice: 100 },
};

// ---------------------------------------------------------------------------
// Hotel row: 12 plots between the cross streets, 3 to 5 storeys, 6 facade variants.

export interface HotelPlot {
  id: string;
  footprint: Rect;
  storeys: number;
  height: number;
  /** Which of the 6 facade models this plot uses (0..5). */
  facade: number;
  color: string;
  trim: string;
}

export const STOREY_HEIGHT = 3.4;
const HOTEL_COLORS = ["#f4b6c2", "#a8e6cf", "#ffd3a5", "#b8d8f8", "#e0c3fc", "#fdfd96"];
const HOTEL_ROW_MIN_X = 59;
const HOTEL_ROW_MAX_X = 87;
const PLOT_GAP = 2;

function hotelPlots(): HotelPlot[] {
  // Segments of hotel row between cross streets, with how many plots each holds.
  const edges = [WORLD_BOUNDS.minZ, ...CROSS_STREETS.flatMap((s) => [s.minZ, s.maxZ]), WORLD_BOUNDS.maxZ];
  const counts = [2, 3, 2, 3, 2];
  const plots: HotelPlot[] = [];
  for (let seg = 0; seg < counts.length; seg++) {
    const start = edges[seg * 2]! + PLOT_GAP;
    const end = edges[seg * 2 + 1]! - PLOT_GAP;
    const count = counts[seg]!;
    const width = (end - start - PLOT_GAP * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const n = plots.length;
      const minZ = start + i * (width + PLOT_GAP);
      const storeys = 3 + ((n * 7 + 3) % 3);
      plots.push({
        id: `hotel_${String(n + 1).padStart(2, "0")}`,
        footprint: { minX: HOTEL_ROW_MIN_X, maxX: HOTEL_ROW_MAX_X, minZ, maxZ: minZ + width },
        storeys,
        height: storeys * STOREY_HEIGHT + 1.2,
        facade: n % 6,
        color: HOTEL_COLORS[n % HOTEL_COLORS.length]!,
        trim: "#ffffff",
      });
    }
  }
  return plots;
}

export const HOTEL_PLOTS: readonly HotelPlot[] = hotelPlots();

// ---------------------------------------------------------------------------
// Grey-box props that block movement in M1.

/** Low wall between the promenade and the beach, broken by openings. */
export const PARK_WALL_X = 137.5;
export const PARK_WALL_OPENINGS_Z = [-150, -100, -50, 0, 50, 100, 150] as const;
export const PARK_WALL_OPENING_WIDTH = 8;
export const PARK_WALL_HEIGHT = 0.9;

export const LIFEGUARD_TOWERS: readonly { x: number; z: number }[] = [
  { x: 170, z: -120 },
  { x: 170, z: -40 },
  { x: 170, z: 40 },
  { x: 170, z: 120 },
];

export const MOORED_BOATS: readonly { id: string; x: number; z: number; length: number }[] = [
  { id: "boat_north", x: 225, z: -60, length: 14 },
  { id: "boat_south", x: 232, z: 60, length: 18 },
];

export const SPEEDBOAT = { id: "speedboat", x: 207, z: 196, length: 8 };

// ---------------------------------------------------------------------------
// Collider generation. Pure data so physics can be built by any Rapier instance.

function rectBox(r: Rect, minY: number, maxY: number): Box {
  return {
    center: { x: (r.minX + r.maxX) / 2, y: (minY + maxY) / 2, z: (r.minZ + r.maxZ) / 2 },
    half: { x: (r.maxX - r.minX) / 2, y: (maxY - minY) / 2, z: (r.maxZ - r.minZ) / 2 },
  };
}

const EDGE_WALL_HEIGHT = 6;
const EDGE_WALL_THICKNESS = 1;

function wall(id: string, r: Rect, height = EDGE_WALL_HEIGHT): StaticBox {
  return { id, kind: "wall", color: "#000000", visible: false, ...rectBox(r, GROUND_Y, GROUND_Y + height) };
}

/** Floor slabs: the ground and the pier. */
export function floorBoxes(): StaticBox[] {
  return [
    { id: "ground", kind: "floor", color: "#000000", visible: false, ...rectBox(GROUND, GROUND_Y - GROUND_THICKNESS, GROUND_Y) },
    { id: "pier", kind: "floor", color: "#8a6a4a", visible: true, ...rectBox(PIER, GROUND_Y - PIER_THICKNESS, GROUND_Y) },
  ];
}

/** Invisible walls that keep players inside the playable area and off the water. */
export function boundaryWalls(): StaticBox[] {
  const t = EDGE_WALL_THICKNESS;
  const { minX, maxX, minZ, maxZ } = WORLD_BOUNDS;
  const shore = GROUND.maxX;
  return [
    wall("edge_west", { minX: minX - t, maxX: minX, minZ, maxZ }),
    wall("edge_east", { minX: maxX, maxX: maxX + t, minZ, maxZ }),
    wall("edge_north", { minX, maxX, minZ: minZ - t, maxZ: minZ }),
    wall("edge_south", { minX, maxX, minZ: maxZ, maxZ: maxZ + t }),
    // Sea wall along the shoreline with a gap where the pier starts.
    wall("sea_north", { minX: shore, maxX: shore + t, minZ, maxZ: PIER.minZ }),
    wall("sea_south", { minX: shore, maxX: shore + t, minZ: PIER.maxZ, maxZ }),
    // Railings round the pier where it stands over water.
    wall("pier_rail_north", { minX: shore, maxX: PIER.maxX, minZ: PIER.minZ - t, maxZ: PIER.minZ }, 1.1),
    wall("pier_rail_south", { minX: shore, maxX: PIER.maxX, minZ: PIER.maxZ, maxZ: PIER.maxZ + t }, 1.1),
    wall("pier_rail_end", { minX: PIER.maxX, maxX: PIER.maxX + t, minZ: PIER.minZ - t, maxZ: PIER.maxZ + t }, 1.1),
  ];
}

export function buildingBoxes(): StaticBox[] {
  const out: StaticBox[] = [];
  for (const loc of Object.values(LOCATIONS)) {
    if (loc.height <= 0) continue;
    out.push({ id: loc.id, kind: "building", color: loc.color, visible: true, ...rectBox(loc.footprint, GROUND_Y, loc.height) });
  }
  for (const plot of HOTEL_PLOTS) {
    out.push({ id: plot.id, kind: "hotel", color: plot.color, visible: true, ...rectBox(plot.footprint, GROUND_Y, plot.height) });
  }
  return out;
}

export function propBoxes(): StaticBox[] {
  const out: StaticBox[] = [];
  // Park wall segments between openings.
  const half = PARK_WALL_OPENING_WIDTH / 2;
  const cuts = [WORLD_BOUNDS.minZ, ...PARK_WALL_OPENINGS_Z.flatMap((z) => [z - half, z + half]), WORLD_BOUNDS.maxZ];
  for (let i = 0; i < cuts.length; i += 2) {
    const r = { minX: PARK_WALL_X - 0.3, maxX: PARK_WALL_X + 0.3, minZ: cuts[i]!, maxZ: cuts[i + 1]! };
    out.push({ id: `park_wall_${i / 2}`, kind: "prop", color: "#f3efe6", visible: true, ...rectBox(r, GROUND_Y, GROUND_Y + PARK_WALL_HEIGHT) });
  }
  for (const [i, t] of LIFEGUARD_TOWERS.entries()) {
    const r = { minX: t.x - 1.5, maxX: t.x + 1.5, minZ: t.z - 1.5, maxZ: t.z + 1.5 };
    out.push({ id: `lifeguard_${i}`, kind: "prop", color: "#ff8fa3", visible: true, ...rectBox(r, GROUND_Y, GROUND_Y + 4) });
  }
  return out;
}

/** Every static collider in the world, in a stable order. */
export function staticColliders(): StaticBox[] {
  return [...floorBoxes(), ...boundaryWalls(), ...buildingBoxes(), ...propBoxes()];
}

export function rectContains(r: Rect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/** True if (x, z) is on a walkable floor: the ground slab or the pier. */
export function isOnFloor(x: number, z: number): boolean {
  return rectContains(GROUND, x, z) || rectContains(PIER, x, z);
}
