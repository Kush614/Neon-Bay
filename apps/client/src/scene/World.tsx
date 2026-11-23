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

function FlatRect({ r, y, color }: { r: Rect; y: number; color: string }) {
  return (
    <mesh position={[(r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[r.maxX - r.minX, r.maxZ - r.minZ]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/** Grey-box world built entirely from packages/shared/src/world.ts. */
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
      {BANDS.filter((b) => b.walkable).map((b) => (
        <FlatRect key={b.id} r={{ minX: b.minX, maxX: b.maxX, minZ, maxZ }} y={0} color={b.color} />
      ))}
      <FlatRect r={SECOND_STREET_ROAD} y={0.01} color="#3a3940" />
      {CROSS_STREETS.map((r, i) => (
        <FlatRect key={i} r={r} y={0.02} color="#3a3940" />
      ))}
      {/* Open-air zones */}
      <FlatRect r={LOCATIONS.car_park.footprint} y={0.03} color={LOCATIONS.car_park.color} />

      {/* Ocean, extended past the playable area to reach the horizon */}
      <mesh position={[700, WATER_Y, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1004, 2400]} />
        <meshStandardMaterial color="#1f6f8b" roughness={0.25} metalness={0.1} />
      </mesh>

      {boxes
        .filter((b) => b.visible)
        .map((b) => (
          <mesh key={b.id} position={[b.center.x, b.center.y, b.center.z]} castShadow receiveShadow>
            <boxGeometry args={[b.half.x * 2, b.half.y * 2, b.half.z * 2]} />
            <meshStandardMaterial color={b.color} roughness={0.8} />
          </mesh>
        ))}

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
