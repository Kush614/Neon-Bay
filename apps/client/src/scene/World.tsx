import { Html } from "@react-three/drei";
import { useRapier } from "@react-three/rapier";
import { useEffect, useMemo } from "react";
import {
  BANDS,
  CROSS_STREETS,
  LOCATIONS,
  MOORED_BOATS,
  SECOND_STREET_ROAD,
  SPEEDBOAT,
  WATER_Y,
  WORLD_BOUNDS,
  staticColliders,
  type Rect,
} from "@neon-bay/shared";
import { addStaticColliders, removeColliders } from "@neon-bay/shared/physics";
import { Backdrop } from "./Backdrop.js";
import { useSurface, type Surface } from "./surfaces.js";
import { StreetFurniture } from "./StreetFurniture.js";
import { Buildings } from "./Buildings.js";
import { Ocean } from "./Ocean.js";
import { Avenue, NeonSigns, Palms, RoadMarkings, StreetLamps } from "./Props.js";

const BAND_SURFACE: Partial<Record<string, Surface>> = {
  second_street: "tiles",
  service_alley: "asphalt",
  hotel_row: "tiles",
  park_promenade: "grass",
  beach: "sand",
};

function FlatRect({ r, y, surface }: { r: Rect; y: number; surface: Surface }) {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const material = useSurface(surface, w, d);
  return (
    <mesh position={[(r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2]} rotation-x={-Math.PI / 2} receiveShadow material={material}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}

/** The world, built from packages/shared/src/world.ts and dressed with CC0 surfaces. */
export function World() {
  const { rapier, world } = useRapier();
  const boxes = useMemo(() => staticColliders(), []);

  useEffect(() => {
    const colliders = addStaticColliders(rapier, world, boxes);
    return () => removeColliders(world, colliders);
  }, [rapier, world, boxes]);

  const { minZ, maxZ } = WORLD_BOUNDS;
  return (
    <group>
      <Backdrop />
      {BANDS.filter((b) => b.walkable && b.id !== "beachfront_avenue").map((b) => (
        <FlatRect key={b.id} r={{ minX: b.minX, maxX: b.maxX, minZ, maxZ }} y={0} surface={BAND_SURFACE[b.id] ?? "tiles"} />
      ))}
      <FlatRect r={SECOND_STREET_ROAD} y={0.01} surface="asphalt" />
      {CROSS_STREETS.map((r, i) => (
        <FlatRect key={i} r={r} y={0.02} surface="asphalt" />
      ))}
      {/* Open-air zones */}
      <FlatRect r={LOCATIONS.car_park.footprint} y={0.03} surface="asphalt" />

      <Ocean />
      <Avenue />
      <RoadMarkings />
      <Buildings boxes={boxes} />
      <NeonSigns />
      <StreetLamps />
      <StreetFurniture />
      <Palms />

      {[...MOORED_BOATS, SPEEDBOAT].map((b) => (
        <mesh key={b.id} position={[b.x, WATER_Y + 0.6, b.z]} castShadow>
          <boxGeometry args={[b.length * 0.35, 1.4, b.length]} />
          <meshStandardMaterial color={b.id === SPEEDBOAT.id ? "#ff4fa3" : "#f2f2f2"} />
        </mesh>
      ))}

      {Object.values(LOCATIONS).map((loc) => (
        <Html
          key={loc.id}
          position={[loc.entrance.x, Math.max(loc.height, 2) + 2, loc.entrance.z]}
          center
          distanceFactor={60}
          zIndexRange={[10, 0]}
        >
          <div style={{ padding: "2px 8px", background: "rgba(20,10,30,0.75)", border: `2px solid ${loc.color}`, borderRadius: 6, whiteSpace: "nowrap", fontSize: 14, fontWeight: 600 }}>
            {loc.label}
          </div>
        </Html>
      ))}
    </group>
  );
}
