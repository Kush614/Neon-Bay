// Knockable street props: bins, road-work cones, crates and beach balls. Each is a dynamic Rapier
// body that sleeps until something touches it: the local player's capsule, a car (server or
// ambient), another prop or a walker's kick. They are COSMETIC group members, so the client's
// movement prediction ignores them (shared/physics.ts) and the server never knows they exist.
import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { RapierRigidBody as RigidBody } from "@react-three/rapier";
import { LOCATIONS, SECOND_STREET_ROAD } from "@neon-bay/shared";
import { COSMETIC_GROUPS } from "@neon-bay/shared/physics";
import { useEffect, useMemo, useRef } from "react";
import { Box3, CanvasTexture, Color, MeshStandardMaterial, SRGBColorSpace, Vector3, type Group, type Mesh } from "three";
import { propBodies, sfx, soundAt } from "./cosmetic.js";

const BIN = "/cc0/models/metal_trash_can/metal_trash_can.gltf";

type Kind = "bin" | "cone" | "crate" | "ball";
interface PropSpec {
  kind: Kind;
  x: number;
  y?: number;
  z: number;
  yaw?: number;
}

/** Physical size and feel of each prop kind. */
const KIND: Record<Kind, { density: number; friction: number; restitution: number; metal: boolean }> = {
  bin: { density: 120, friction: 0.6, restitution: 0.15, metal: true },
  cone: { density: 90, friction: 0.8, restitution: 0.2, metal: false },
  crate: { density: 140, friction: 0.7, restitution: 0.05, metal: false },
  ball: { density: 6, friction: 0.4, restitution: 0.75, metal: false },
};
const BIN_H = 1.05;
const BIN_R = 0.3;
const CONE_H = 0.72;
const CRATE = 0.55;
const BALL_R = 0.33;

export function propLayout(): PropSpec[] {
  const out: PropSpec[] = [];
  // A bin beside every doorway on Second Street.
  for (const id of ["bank", "nightclub", "pawn_shop", "exchange", "police_station"] as const) {
    const e = LOCATIONS[id].entrance;
    out.push({ kind: "bin", x: 7.8, z: e.z + 5, yaw: e.z }); // on the curb, clear of traffic
  }
  // Road works on Second Street: a ring of cones in the northbound lane.
  const rx = (SECOND_STREET_ROAD.minX + SECOND_STREET_ROAD.maxX) / 2 + 1.6;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push({ kind: "cone", x: rx + Math.cos(a) * 1.2, z: -110 + Math.sin(a) * 3 });
  }
  // A row of cones closing off the car park's spare bay.
  for (let i = 0; i < 6; i++) out.push({ kind: "cone", x: 99, z: -14 + i * 1.6 });
  // Crates stacked by the pawn shop's side door.
  const pawn = LOCATIONS.pawn_shop.entrance;
  for (let i = 0; i < 3; i++) out.push({ kind: "crate", x: pawn.x - 2.4, z: pawn.z - 6 + i * 0.6, yaw: i * 0.3 });
  out.push({ kind: "crate", x: pawn.x - 2.4, y: CRATE, z: pawn.z - 5.7, yaw: 0.6 });
  // Beach balls on the sand.
  for (let i = 0; i < 10; i++) out.push({ kind: "ball", x: 150 + ((i * 37) % 36), z: -170 + i * 36 });
  return out;
}

function ballTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const stripes = ["#ff4fa3", "#ffffff", "#4fd1ff", "#ffffff", "#ffd166", "#ffffff"];
  stripes.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i * c.width) / stripes.length, 0, c.width / stripes.length + 1, c.height);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function DynamicProps() {
  const { rapier, world } = useRapier();
  const layout = useMemo(propLayout, []);
  const bin = useGLTF(BIN);
  const binFit = useMemo(() => {
    const box = new Box3().setFromObject(bin.scene);
    const size = box.getSize(new Vector3());
    const c = box.getCenter(new Vector3());
    const scale = BIN_H / size.y;
    bin.scene.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    // Body origin is the bin's centre, so drop the model by half its height.
    return { scale, offset: new Vector3(-c.x * scale, -box.min.y * scale - BIN_H / 2, -c.z * scale) };
  }, [bin]);
  const mats = useMemo(
    () => ({
      cone: new MeshStandardMaterial({ color: new Color("#ff6a1a"), roughness: 0.55 }),
      coneBand: new MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.4, emissive: new Color("#555555") }),
      crate: new MeshStandardMaterial({ color: new Color("#a07a4a"), roughness: 0.9 }),
      ball: new MeshStandardMaterial({ map: ballTexture(), roughness: 0.35 }),
    }),
    [],
  );
  const refs = useRef<(Group | null)[]>([]);
  const bodies = useRef<{ body: RigidBody; spec: PropSpec; asleep: boolean; displacedFor: number }[]>([]);

  useEffect(() => {
    const made: { body: RigidBody; spec: PropSpec; asleep: boolean; displacedFor: number }[] = [];
    for (const spec of layout) {
      const k = KIND[spec.kind];
      const half = spec.kind === "bin" ? BIN_H / 2 : spec.kind === "cone" ? CONE_H / 2 : spec.kind === "crate" ? CRATE / 2 : BALL_R;
      const y = (spec.y ?? 0) + half + 0.01;
      const yaw = spec.yaw ?? 0;
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(spec.x, y, spec.z)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
          .setLinearDamping(spec.kind === "ball" ? 0.25 : 0.4)
          .setAngularDamping(spec.kind === "ball" ? 0.3 : 0.8)
          .setCanSleep(true)
          .setCcdEnabled(spec.kind === "ball"),
      );
      const shape =
        spec.kind === "bin"
          ? rapier.ColliderDesc.cylinder(BIN_H / 2, BIN_R)
          : spec.kind === "cone"
            ? rapier.ColliderDesc.cone(CONE_H / 2, 0.2)
            : spec.kind === "crate"
              ? rapier.ColliderDesc.cuboid(CRATE / 2, CRATE / 2, CRATE / 2)
              : rapier.ColliderDesc.ball(BALL_R);
      world.createCollider(
        shape.setDensity(k.density).setFriction(k.friction).setRestitution(k.restitution).setCollisionGroups(COSMETIC_GROUPS),
        body,
      );
      body.sleep(); // nothing costs anything until it is touched
      made.push({ body, spec, asleep: true, displacedFor: 0 });
      propBodies.push({ body, kind: spec.kind });
    }
    bodies.current = made;
    return () => {
      for (const m of made) if (world.getRigidBody(m.body.handle)) world.removeRigidBody(m.body);
      propBodies.length = 0;
      bodies.current = [];
    };
  }, [rapier, world, layout]);

  const reset = (m: { body: RigidBody; spec: PropSpec }, lift = 0) => {
    const s = m.spec;
    const half = s.kind === "bin" ? BIN_H / 2 : s.kind === "cone" ? CONE_H / 2 : s.kind === "crate" ? CRATE / 2 : BALL_R;
    const yaw = s.yaw ?? 0;
    m.body.setTranslation({ x: s.x, y: (s.y ?? 0) + half + 0.01 + lift, z: s.z }, true);
    m.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    m.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    m.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };

  useFrame((_, dt) => {
    bodies.current.forEach((m, i) => {
      const g = refs.current[i];
      if (!g || !world.getRigidBody(m.body.handle)) return;
      const asleep = m.body.isSleeping();
      const t = m.body.translation();
      if (m.asleep && !asleep) {
        // Just got hit: a thump (metal clang for bins), scaled by how hard.
        const v = m.body.linvel();
        const hit = Math.min(1, Math.hypot(v.x, v.y, v.z) / 6);
        soundAt(`prop${i}`, t.x, t.z, (vol) => sfx.thud(vol * (0.4 + hit), KIND[m.spec.kind].metal));
      }
      m.asleep = asleep;
      if (asleep) {
        // The city crew tidies up: a prop left knocked away for 40 s is put back.
        const away = Math.hypot(t.x - m.spec.x, t.z - m.spec.z) > 1.5;
        m.displacedFor = away ? m.displacedFor + dt : 0;
        if (m.displacedFor > 40 && m.spec.kind !== "ball") {
          m.displacedFor = 0;
          reset(m);
          const half = m.spec.kind === "bin" ? BIN_H / 2 : m.spec.kind === "cone" ? CONE_H / 2 : CRATE / 2;
          g.position.set(m.spec.x, (m.spec.y ?? 0) + half + 0.01, m.spec.z);
          g.quaternion.set(0, Math.sin((m.spec.yaw ?? 0) / 2), 0, Math.cos((m.spec.yaw ?? 0) / 2));
          m.body.sleep();
          m.asleep = true;
        }
        return;
      }
      // Fell off the world (into the ocean past the beach): put it back where it started.
      if (t.y < -6) reset(m, 1);
      const r = m.body.rotation();
      g.position.set(t.x, t.y, t.z);
      g.quaternion.set(r.x, r.y, r.z, r.w);
    });
  });

  return (
    <group>
      {layout.map((p, i) => {
        const half = p.kind === "bin" ? BIN_H / 2 : p.kind === "cone" ? CONE_H / 2 : p.kind === "crate" ? CRATE / 2 : BALL_R;
        const yaw = p.yaw ?? 0;
        return (
          <group key={i} ref={(g) => void (refs.current[i] = g)} position={[p.x, (p.y ?? 0) + half + 0.01, p.z]} rotation-y={yaw}>
            {p.kind === "bin" && <Clone object={bin.scene} scale={binFit.scale} position={binFit.offset} />}
            {p.kind === "cone" && (
              <>
                <mesh material={mats.cone} castShadow>
                  <coneGeometry args={[0.2, CONE_H, 18]} />
                </mesh>
                <mesh material={mats.coneBand} position={[0, 0.02, 0]}>
                  <cylinderGeometry args={[0.105, 0.125, 0.1, 18, 1, true]} />
                </mesh>
                <mesh material={mats.cone} position={[0, -CONE_H / 2 + 0.02, 0]} castShadow receiveShadow>
                  <boxGeometry args={[0.46, 0.04, 0.46]} />
                </mesh>
              </>
            )}
            {p.kind === "crate" && (
              <mesh material={mats.crate} castShadow receiveShadow>
                <boxGeometry args={[CRATE, CRATE, CRATE]} />
              </mesh>
            )}
            {p.kind === "ball" && (
              <mesh material={mats.ball} castShadow>
                <sphereGeometry args={[BALL_R, 24, 16]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload(BIN);
