// Cars: interpolated from server state, with kinematic colliders so local prediction
// bumps into them the way the server does.
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useRef } from "react";
import type { Group } from "three";
import { CAR_CLEARANCE, CAR_HALF_EXTENTS } from "@neon-bay/shared";
import { useNetStore, vehicleBuffers, type VehicleEntry } from "../net/connection.js";
import { SportsCar } from "./SportsCar.js";
import { useGeneratedModels } from "../generated/manifest.js";
import { GeneratedCar, nearestCar } from "../generated/GeneratedProps.js";

const H = CAR_HALF_EXTENTS;

type KinematicBody = ReturnType<ReturnType<typeof useRapier>["world"]["createRigidBody"]>;

/** The car body: a Runware-generated coupe when available, the procedural one otherwise. */
export function CarModel({ color }: { color: string }) {
  const models = useGeneratedModels();
  const entry = models && nearestCar(models, color);
  if (!entry) return <SportsCar color={color} />;
  return (
    <Suspense fallback={<SportsCar color={color} />}>
      <GeneratedCar entry={entry} />
    </Suspense>
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
    g.userData.captureLabel = { id: entry.id, cls: "Car", heading: s.heading };
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
