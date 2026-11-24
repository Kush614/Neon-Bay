// Seeded ambient NPCs: traffic, parked cars, pedestrians and dogs. Purely visual: the server
// never sees them, so they never affect the game, the agents or the ledger. Used in normal play
// (scenery) and in capture mode (dataset variety). ?npcs=0 turns them off.
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { CAR_CLEARANCE, CAR_HALF_EXTENTS, CROSS_STREET_Z, ROADS } from "@neon-bay/shared";
import { COSMETIC_GROUPS } from "@neon-bay/shared/physics";
import { ambientCars, players, propBodies, serverCars, sfx, soundAt, type Mover } from "../physics/cosmetic.js";
import { approachSpeed, brakeTarget, knockVelocity, sidestep } from "../physics/streetLogic.js";
import { useLocalStore } from "../store.js";

type KinematicBody = ReturnType<ReturnType<typeof useRapier>["world"]["createRigidBody"]>;
import { Character } from "../entities/Character.js";
import { CarModel } from "../entities/Vehicles.js";
import { CAPTURE_SEED, mulberry32 } from "./mode.js";
import { useGeneratedModels } from "../generated/manifest.js";
import { Dog } from "../generated/GeneratedProps.js";

const CAR_COLORS = ["#ff5fa2", "#3fd0d4", "#ffd166", "#9b7bff", "#f4f1ea", "#2b2d42", "#e63946", "#2a9d8f", "#c0c0c8", "#f77f00"];
const SHIRTS = ["#ff4fa3", "#4fd1ff", "#ffd166", "#7dffb0", "#ff8a5c", "#b38cff", "#f4f1ea", "#3a86ff"];
const LANE_OFFSET = 2.5;

type XZ = { x: number; z: number };
const nodes = new Map(ROADS.nodes.map((n) => [n.id, n]));
const adjacency = new Map<string, string[]>();
for (const [a, b] of ROADS.edges) {
  (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
}

interface MovingCar {
  kind: "moving";
  id: string;
  color: string;
  from: string;
  to: string;
  t: number;
  speed: number;
  /** Current speed (m/s): eases toward `speed`, or below it when something is in the lane. */
  v: number;
  honkedAt: number;
}
interface ParkedCar {
  kind: "parked";
  id: string;
  color: string;
  x: number;
  z: number;
  heading: number;
}
interface Walker {
  id: string;
  color: string;
  a: XZ;
  b: XZ;
  t: number;
  speed: number;
  dir: 1 | -1;
  /** Physics state (game mode): displacement from the path, knock-down velocity and timers. */
  ox: number;
  oz: number;
  vx: number;
  vz: number;
  down: number;
  fall: number;
  fallHeading: number;
}

function plan(seed: number, scale: { moving: number; parked: number; walkers: number; parkOnSecond: boolean }) {
  const rng = mulberry32(seed * 104729 + 17);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
  const cars: (MovingCar | ParkedCar)[] = [];
  const ids = [...nodes.keys()];
  for (let i = 0; i < scale.moving; i++) {
    const from = pick(ids);
    const speed = 7 + rng() * 7;
    cars.push({ kind: "moving", id: `ambient_car_${i}`, color: pick(CAR_COLORS), from, to: pick(adjacency.get(from)!), t: rng(), speed, v: speed, honkedAt: 0 });
  }
  for (let i = 0; i < scale.parked; i++) {
    const id = `ambient_parked_${i}`;
    if (rng() < 0.6) {
      const z = pick(CROSS_STREET_Z) + (rng() < 0.5 ? -4.6 : 4.6);
      cars.push({ kind: "parked", id, color: pick(CAR_COLORS), x: 12 + rng() * 70, z, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
    } else {
      // Second Street has no parking lane (x 7 is in traffic), so the game only parks on the avenue.
      const x = rng() < 0.5 || !scale.parkOnSecond ? 92.5 : 7;
      cars.push({ kind: "parked", id, color: pick(CAR_COLORS), x, z: -185 + rng() * 370, heading: rng() < 0.5 ? 0 : Math.PI });
    }
  }
  // Pedestrians walk back and forth along sidewalks, the promenade and the beach.
  const walkers: Walker[] = [];
  for (let i = 0; i < scale.walkers; i++) {
    const r = rng();
    let a: XZ;
    let b: XZ;
    if (r < 0.3) {
      const z0 = -190 + rng() * 300;
      a = { x: 7.85, z: z0 }; // the curb, clear of the northbound lane (x 6.5)
      b = { x: 7.85, z: z0 + 20 + rng() * 60 };
    } else if (r < 0.55) {
      const z = pick(CROSS_STREET_Z) + (rng() < 0.5 ? -5.4 : 5.4);
      const x0 = 10 + rng() * 40;
      a = { x: x0, z };
      b = { x: x0 + 15 + rng() * 30, z };
    } else if (r < 0.75) {
      const x = 112 + rng() * 22;
      const z0 = -180 + rng() * 300;
      a = { x, z: z0 };
      b = { x: x + (rng() - 0.5) * 10, z: z0 + 20 + rng() * 40 };
    } else {
      a = { x: 145 + rng() * 40, z: -180 + rng() * 340 };
      b = { x: 145 + rng() * 40, z: a.z + (rng() - 0.5) * 60 };
    }
    walkers.push({ id: `ambient_ped_${i}`, color: pick(SHIRTS), a, b, t: rng(), speed: 1.1 + rng() * 0.6, dir: rng() < 0.5 ? 1 : -1, ox: 0, oz: 0, vx: 0, vz: 0, down: 0, fall: 0, fallHeading: 0 });
  }
  return { cars, walkers, rng };
}

function placeMoving(c: MovingCar, g: Group): { x: number; z: number; dx: number; dz: number; heading: number } {
  const a = nodes.get(c.from)!;
  const b = nodes.get(c.to)!;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const heading = Math.atan2(dx, dz);
  // Drive on the right-hand side of the road centreline.
  const ox = (-dz / len) * LANE_OFFSET;
  const oz = (dx / len) * LANE_OFFSET;
  g.position.set(a.x + dx * c.t + ox, 0, a.z + dz * c.t + oz);
  g.rotation.y = heading;
  g.userData.captureLabel = { id: c.id, cls: "Car", heading };
  return { x: g.position.x, z: g.position.z, dx: dx / len, dz: dz / len, heading };
}

const CAPTURE_SCALE = { moving: 14, parked: 18, walkers: 26, parkOnSecond: true };
const GAME_SCALE = { moving: 9, parked: 10, walkers: 18, parkOnSecond: false };

export function AmbientTraffic({ game = false }: { game?: boolean }) {
  const { cars, walkers, rng } = useMemo(() => plan(CAPTURE_SEED, game ? GAME_SCALE : CAPTURE_SCALE), [game]);
  const models = useGeneratedModels();
  const dog = models?.get("dog");
  const carRefs = useRef<(Group | null)[]>([]);
  const walkerRefs = useRef<(Group | null)[]>([]);

  // Game mode: every ambient car gets a kinematic COSMETIC body so it shoves props around;
  // the player's prediction ignores those bodies (shared/physics.ts PREDICTION_QUERY).
  const { rapier, world } = useRapier();
  const carBodies = useRef<(KinematicBody | null)[]>([]);
  useEffect(() => {
    if (!game) return;
    const halfY = CAR_HALF_EXTENTS.y - CAR_CLEARANCE / 2;
    const made = cars.map((c) => {
      const b = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(c.kind === "parked" ? c.x : 0, c.kind === "parked" ? 0 : -50, c.kind === "parked" ? c.z : 0));
      if (c.kind === "parked") b.setRotation({ x: 0, y: Math.sin(c.heading / 2), z: 0, w: Math.cos(c.heading / 2) }, true);
      world.createCollider(
        rapier.ColliderDesc.cuboid(CAR_HALF_EXTENTS.x, halfY, CAR_HALF_EXTENTS.z).setTranslation(0, CAR_CLEARANCE + halfY, 0).setCollisionGroups(COSMETIC_GROUPS),
        b,
      );
      return b;
    });
    carBodies.current = made;
    return () => {
      for (const b of made) if (world.getRigidBody(b.handle)) world.removeRigidBody(b);
      carBodies.current = [];
      ambientCars.length = 0;
    };
  }, [game, cars, rapier, world]);

  const lastBallKick = useRef(new Map<number, number>());
  const lastBark = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const now = performance.now();
    // What the street knows this frame (game mode only; capture stays a fixed, seeded scene).
    const people = game ? players(now) : [];
    const server = game ? serverCars(now) : [];
    const walkerPos = game ? walkers.map((w, i) => walkerRefs.current[i]?.position ?? { x: 1e6, z: 1e6 }) : [];
    const moverCars: Mover[] = [];

    cars.forEach((c, i) => {
      const g = carRefs.current[i];
      if (!g) return;
      if (c.kind === "parked") {
        g.position.set(c.x, 0, c.z);
        g.rotation.y = c.heading;
        g.userData.captureLabel = { id: c.id, cls: "Car", heading: c.heading };
        return;
      }
      const a = nodes.get(c.from)!;
      const b = nodes.get(c.to)!;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      if (game) {
        // Brake for players, pedestrians and cars in the lane ahead; honk at people.
        const pose = { x: g.position.x, z: g.position.z };
        const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
        const sameWay = ambientCars.filter((o) => (o.vx * dir.x + o.vz * dir.z) > 0.5 * Math.hypot(o.vx, o.vz));
        const obstacles = [...people, ...walkerPos, ...server, ...sameWay];
        const { speed, blockedBy } = brakeTarget(pose, dir, c.speed, obstacles);
        const isPerson = blockedBy >= 0 && blockedBy < people.length + walkerPos.length;
        if (isPerson && c.v > 2 && speed < c.v * 0.5 && now - c.honkedAt > 2500) {
          c.honkedAt = now;
          soundAt(c.id, pose.x, pose.z, (vol) => sfx.horn(vol), 0);
        }
        c.v = approachSpeed(c.v, speed, dt);
      } else c.v = c.speed;
      c.t += (c.v * dt) / len;
      while (c.t >= 1) {
        c.t -= 1;
        const next = adjacency.get(c.to)!.filter((n) => n !== c.from);
        const options = next.length ? next : adjacency.get(c.to)!;
        c.from = c.to;
        c.to = options[Math.floor(rng() * options.length)]!;
      }
      const p = placeMoving(c, g);
      if (game) {
        moverCars.push({ x: p.x, z: p.z, vx: p.dx * c.v, vz: p.dz * c.v, radius: 2.3, kind: "car" });
        const body = carBodies.current[i];
        if (body && world.getRigidBody(body.handle)) {
          body.setNextKinematicTranslation({ x: p.x, y: 0, z: p.z });
          body.setNextKinematicRotation({ x: 0, y: Math.sin(p.heading / 2), z: 0, w: Math.cos(p.heading / 2) });
        }
      }
    });
    if (game) {
      ambientCars.length = 0;
      ambientCars.push(...moverCars);
    }
    const hazards = game ? [...moverCars, ...server] : [];
    const running = game && useLocalStore.getState().running;
    const me = people[0];

    walkers.forEach((w, i) => {
      const g = walkerRefs.current[i];
      if (!g) return;
      const pose = g.children[0];
      const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
      if (w.down <= 0) {
        w.t += (w.dir * w.speed * dt) / len;
        if (w.t > 1 || w.t < 0) {
          w.dir = w.dir === 1 ? -1 : 1;
          w.t = Math.max(0, Math.min(1, w.t));
        }
      }
      const px = w.a.x + (w.b.x - w.a.x) * w.t;
      const pz = w.a.z + (w.b.z - w.a.z) * w.t;
      let heading = Math.atan2((w.b.x - w.a.x) * w.dir, (w.b.z - w.a.z) * w.dir);
      if (game) {
        const at = { x: px + w.ox, z: pz + w.oz };
        if (w.down <= 0) {
          // Hit by a car at speed: thrown along its path, down for a few seconds.
          const kv = knockVelocity(at, hazards);
          const stumble = !kv && running && me && Math.hypot(me.x - at.x, me.z - at.z) < 0.6;
          if (kv || stumble) {
            const v = kv ?? { x: (at.x - me!.x) * 4, z: (at.z - me!.z) * 4 };
            w.vx = v.x;
            w.vz = v.z;
            w.down = kv ? 3.4 : 1.6;
            w.fallHeading = Math.atan2(-v.x, -v.z); // face the hit, fall backwards
            soundAt(`ped${i}`, at.x, at.z, (vol) => sfx.thud(vol * (kv ? 1 : 0.5)), 0);
            if (dog && i % 3 === 0) soundAt(`dog${i}`, at.x, at.z, (vol) => sfx.bark(vol), 0);
          } else {
            // Step out of players' way, then drift back onto the path.
            const s = sidestep(at, people);
            w.ox += s.x;
            w.oz += s.z;
            const k = Math.exp(-0.8 * dt);
            if (s.x === 0 && s.z === 0) {
              w.ox *= k;
              w.oz *= k;
            }
            // Kick any beach ball underfoot.
            propBodies.forEach((pb, bi) => {
              if (pb.kind !== "ball" || !world.getRigidBody(pb.body.handle)) return;
              const bt = pb.body.translation();
              if (Math.hypot(bt.x - at.x, bt.z - at.z) > 0.75 || now - (lastBallKick.current.get(bi) ?? 0) < 1200) return;
              lastBallKick.current.set(bi, now);
              pb.body.applyImpulse({ x: Math.sin(heading) * 1.6, y: 1.8, z: Math.cos(heading) * 1.6 }, true);
            });
          }
        }
        if (w.down > 0) {
          w.down -= dt;
          w.ox += w.vx * dt;
          w.oz += w.vz * dt;
          const f = Math.exp(-4 * dt);
          w.vx *= f;
          w.vz *= f;
          heading = w.fallHeading;
          const target = w.down > 0.7 ? 1 : 0;
          w.fall += (target - w.fall) * Math.min(1, dt * (target ? 9 : 3));
        } else if (w.fall > 0.001) w.fall *= Math.exp(-6 * dt);
        if (dog && i % 3 === 0 && me && Math.hypot(me.x - at.x, me.z - at.z) < 2.2 && now - lastBark.current > 4000) {
          lastBark.current = now;
          soundAt(`dog${i}`, at.x, at.z, (vol) => sfx.bark(vol), 0);
        }
      }
      g.position.set(px + w.ox, 0, pz + w.oz);
      g.rotation.y = heading;
      if (pose) {
        pose.rotation.x = -w.fall * 1.45;
        pose.position.y = w.fall * 0.18;
        pose.userData.captureLabel = { id: w.id, cls: "Pedestrian", heading };
      }
    });
  });

  return (
    <>
      {cars.map((c, i) => (
        <group key={c.id} ref={(g) => void (carRefs.current[i] = g)}>
          <CarModel color={c.color} />
        </group>
      ))}
      {walkers.map((w, i) => (
        <group key={w.id} ref={(g) => void (walkerRefs.current[i] = g)}>
          <group>
            <Character name={game ? `npc_${w.id}` : ""} color={w.color} showName={false} label={{ id: w.id, cls: "Pedestrian" }} />
          </group>
          {/* Every third walker has a dog trotting at heel. */}
          {game && dog && i % 3 === 0 && (
            <Suspense fallback={null}>
              <group position={[0.7, 0, -0.5]}>
                <Dog entry={dog} />
              </group>
            </Suspense>
          )}
        </group>
      ))}
    </>
  );
}
