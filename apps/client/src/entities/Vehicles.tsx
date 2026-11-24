// Cars: interpolated from server state, with kinematic colliders so local prediction
// bumps into them the way the server does.
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { CAR_CLEARANCE, CAR_HALF_EXTENTS } from "@neon-bay/shared";
import { useNetStore, vehicleBuffers, type VehicleEntry } from "../net/connection.js";

const H = CAR_HALF_EXTENTS;

type KinematicBody = ReturnType<ReturnType<typeof useRapier>["world"]["createRigidBody"]>;

/** An original boxy 1980s coupe: wedge body, glass cabin, four wheels, neon underglow. */
function CarModel({ color }: { color: string }) {
  const wheel = (x: number, z: number) => (
    <mesh key={`${x},${z}`} position={[x, 0.36, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.36, 0.36, 0.3, 14]} />
      <meshStandardMaterial color="#1b1b22" roughness={0.9} />
    </mesh>
  );
  return (
    <group>
      <mesh position={[0, CAR_CLEARANCE + 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[H.x * 2, 0.6, H.z * 2]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.35} />
      </mesh>
      <mesh position={[0, CAR_CLEARANCE + 0.9, -0.25]} castShadow>
        <boxGeometry args={[H.x * 1.7, 0.5, H.z * 1.0]} />
        <meshStandardMaterial color="#2a3550" metalness={0.6} roughness={0.15} />
      </mesh>
      {/* Pop-up headlights at the front (+z). */}
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, CAR_CLEARANCE + 0.5, H.z - 0.02]}>
          <boxGeometry args={[0.45, 0.14, 0.05]} />
          <meshStandardMaterial color="#fff6d0" emissive="#fff1b0" emissiveIntensity={1.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[H.x * 2.1, H.z * 2.1]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      {wheel(-H.x, H.z - 0.7)}
      {wheel(H.x, H.z - 0.7)}
      {wheel(-H.x, -H.z + 0.7)}
      {wheel(H.x, -H.z + 0.7)}
    </group>
  );
}

function Car({ entry }: { entry: VehicleEntry }) {
  const { rapier, world } = useRapier();
  const ref = useRef<Group>(null);
  const body = useRef<KinematicBody | null>(null);

  useEffect(() => {
    const halfY = H.y - CAR_CLEARANCE / 2;
    const b = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    world.createCollider(rapier.ColliderDesc.cuboid(H.x, halfY, H.z).setTranslation(0, CAR_CLEARANCE + halfY, 0), b);
    body.current = b;
    return () => {
      // Physics may already have freed the world (StrictMode remounts); only remove live bodies.
      if (world.getRigidBody(b.handle)) world.removeRigidBody(b);
      body.current = null;
    };
  }, [rapier, world]);

  useFrame(() => {
    const g = ref.current;
    const s = vehicleBuffers.get(entry.id)?.sample(performance.now());
    if (!g || !s) return;
    g.visible = true;
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.heading;
    const b = body.current;
    if (b && world.getRigidBody(b.handle)) {
      b.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
      b.setNextKinematicRotation({ x: 0, y: Math.sin(s.heading / 2), z: 0, w: Math.cos(s.heading / 2) });
    }
  });

  return (
    <group ref={ref} visible={false}>
      <CarModel color={entry.color} />
    </group>
  );
}

export function Vehicles() {
  const vehicles = useNetStore((s) => s.vehicles);
  return (
    <>
      {vehicles.map((v) => (
        <Car key={v.id} entry={v} />
      ))}
    </>
  );
}
