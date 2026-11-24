// Seeded ambient cars and pedestrians for capture mode only. Purely visual: the server
// never sees them, so they don't affect the game; they exist to give the dataset variety.
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { CROSS_STREET_Z, ROADS } from "@neon-bay/shared";
import { Character } from "../entities/Character.js";
import { CarModel } from "../entities/Vehicles.js";
import { CAPTURE_SEED, mulberry32 } from "./mode.js";

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
}

function plan(seed: number) {
  const rng = mulberry32(seed * 104729 + 17);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
  const cars: (MovingCar | ParkedCar)[] = [];
  const ids = [...nodes.keys()];
  for (let i = 0; i < 14; i++) {
    const from = pick(ids);
    cars.push({ kind: "moving", id: `ambient_car_${i}`, color: pick(CAR_COLORS), from, to: pick(adjacency.get(from)!), t: rng(), speed: 7 + rng() * 7 });
  }
  for (let i = 0; i < 18; i++) {
    const id = `ambient_parked_${i}`;
    if (rng() < 0.6) {
      const z = pick(CROSS_STREET_Z) + (rng() < 0.5 ? -4.6 : 4.6);
      cars.push({ kind: "parked", id, color: pick(CAR_COLORS), x: 12 + rng() * 70, z, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
    } else {
      cars.push({ kind: "parked", id, color: pick(CAR_COLORS), x: rng() < 0.5 ? 92.5 : 7, z: -185 + rng() * 370, heading: rng() < 0.5 ? 0 : Math.PI });
    }
  }
  // Pedestrians walk back and forth along sidewalks, the promenade and the beach.
  const walkers: Walker[] = [];
  for (let i = 0; i < 26; i++) {
    const r = rng();
    let a: XZ;
    let b: XZ;
    if (r < 0.3) {
      const z0 = -190 + rng() * 300;
      a = { x: 6.8, z: z0 };
      b = { x: 6.8, z: z0 + 20 + rng() * 60 };
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
    walkers.push({ id: `ambient_ped_${i}`, color: pick(SHIRTS), a, b, t: rng(), speed: 1.1 + rng() * 0.6, dir: rng() < 0.5 ? 1 : -1 });
  }
  return { cars, walkers, rng };
}

function placeMoving(c: MovingCar, g: Group) {
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
}

export function AmbientTraffic() {
  const { cars, walkers, rng } = useMemo(() => plan(CAPTURE_SEED), []);
  const carRefs = useRef<(Group | null)[]>([]);
  const walkerRefs = useRef<(Group | null)[]>([]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
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
      c.t += (c.speed * dt) / len;
      while (c.t >= 1) {
        c.t -= 1;
        const next = adjacency.get(c.to)!.filter((n) => n !== c.from);
        const options = next.length ? next : adjacency.get(c.to)!;
        c.from = c.to;
        c.to = options[Math.floor(rng() * options.length)]!;
      }
      placeMoving(c, g);
    });
    walkers.forEach((w, i) => {
      const g = walkerRefs.current[i];
      if (!g) return;
      const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
      w.t += (w.dir * w.speed * dt) / len;
      if (w.t > 1 || w.t < 0) {
        w.dir = w.dir === 1 ? -1 : 1;
        w.t = Math.max(0, Math.min(1, w.t));
      }
      const x = w.a.x + (w.b.x - w.a.x) * w.t;
      const z = w.a.z + (w.b.z - w.a.z) * w.t;
      const heading = Math.atan2((w.b.x - w.a.x) * w.dir, (w.b.z - w.a.z) * w.dir);
      g.position.set(x, 0, z);
      g.rotation.y = heading;
      const model = g.children[0];
      if (model) model.userData.captureLabel = { id: w.id, cls: "Pedestrian", heading };
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
          <Character name="" color={w.color} showName={false} label={{ id: w.id, cls: "Pedestrian" }} />
        </group>
      ))}
    </>
  );
}
