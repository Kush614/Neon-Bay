import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGeneratedModels } from "../generated/manifest.js";
import { PlacedModel } from "../generated/GeneratedProps.js";
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

/**
 * Buoyancy on the ocean swell: heave, pitch and roll from the sum of two slow waves sampled at
 * the bow, stern and beam. Longer hulls average more of the wave, so big boats move less.
 */
function Floating({ seed, size, children }: { seed: number; size: number; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    const o = g.current;
    if (!o) return;
    const t = clock.elapsedTime;
    const wave = (u: number, v: number) => 0.22 * Math.sin(u * 0.35 + t * 1.1 + seed) + 0.12 * Math.sin(v * 0.5 - t * 1.7 + seed * 2);
    const half = size / 2;
    const bow = wave(0, half);
    const stern = wave(0, -half);
    const port = wave(-half * 0.3, 0);
    const starboard = wave(half * 0.3, 0);
    o.position.y = WATER_Y - 0.25 + (bow + stern + port + starboard) / 4;
    o.rotation.x = Math.atan2(stern - bow, size) * 1.5;
    o.rotation.z = Math.atan2(port - starboard, size * 0.3) * 0.6;
  });
  return <group ref={g}>{children}</group>;
}

/** Moored boats and the getaway speedboat: Runware models when generated, boxes otherwise. */
function Boats() {
  const models = useGeneratedModels();
  return (
    <>
      {[...MOORED_BOATS, SPEEDBOAT].map((b) => {
        const e = models?.get(b.id === SPEEDBOAT.id ? "speedboat" : "yacht");
        if (e)
          return (
            <group key={b.id} position={[b.x, 0, b.z]}>
            <Suspense fallback={null}>
              <Floating seed={b.x * 0.37 + b.z * 0.11} size={b.length}>
                <PlacedModel entry={e} x={0} y={0} z={0} length={b.length} />
              </Floating>
            </Suspense>
            </group>
          );
        return (
          <mesh key={b.id} position={[b.x, WATER_Y + 0.6, b.z]} castShadow>
            <boxGeometry args={[b.length * 0.35, 1.4, b.length]} />
            <meshStandardMaterial color={b.id === SPEEDBOAT.id ? "#ff4fa3" : "#f2f2f2"} />
          </mesh>
        );
      })}
    </>
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

      <Boats />

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
