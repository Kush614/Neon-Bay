// Palms (instanced, vertex-shader sway), street lamps, the reflective beachfront avenue,
// lane markings, rooftop neon and the two real point lights (bank, nightclub).
// All geometry is procedural and original.
import { MeshReflectorMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { BANDS, CROSS_STREET_Z, CROSS_STREET_WIDTH, HOTEL_PLOTS, LOCATIONS, SECOND_STREET_ROAD, WORLD_BOUNDS } from "@neon-bay/shared";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useGeneratedModels } from "../generated/manifest.js";
import { GeneratedPalms, tickPalmSway } from "../generated/GeneratedProps.js";
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type InstancedMesh,
  type PointLight,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { QUALITY } from "./quality.js";
import { nightGlow, tod } from "./timeOfDay.js";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const swayTime = { value: 0 };

/** Bend and sway in the vertex shader: the higher the vertex, the more it moves. */
function withSway(m: MeshStandardMaterial, amount: number): MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSway = swayTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uSway;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float hgt = max(position.y, 0.0) / 9.0;
         vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float ph = base.x * 0.13 + base.z * 0.07;
         transformed.x += (sin(uSway * 1.1 + ph) * 0.6 + sin(uSway * 2.3 + ph * 2.0) * 0.25) * hgt * hgt * ${amount.toFixed(2)};
         transformed.z += cos(uSway * 0.9 + ph) * hgt * hgt * ${(amount * 0.5).toFixed(2)};`,
      );
  };
  return m;
}

function palmGeometries(): { trunk: BufferGeometry; leaves: BufferGeometry } {
  const H = 8.5;
  const segs: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new CylinderGeometry(0.2 - i * 0.012, 0.24 - i * 0.012, H / 6, 7);
    s.translate(Math.pow(i / 6, 2) * 0.9, (i + 0.5) * (H / 6), 0); // gentle lean
    segs.push(s);
  }
  const trunk = mergeGeometries(segs)!;
  const fronds: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const f = new ConeGeometry(0.55, 4.2, 4, 1);
    f.scale(1, 1, 0.18);
    f.translate(0, 2.1, 0);
    f.rotateZ(-1.15 - (i % 2) * 0.25); // droop
    f.rotateY((i / 9) * Math.PI * 2);
    f.translate(0.9, H, 0);
    fronds.push(f);
  }
  const coconuts = new SphereGeometry(0.32, 6, 5);
  coconuts.translate(0.9, H - 0.35, 0);
  fronds.push(coconuts);
  return { trunk, leaves: mergeGeometries(fronds.map((g) => g.toNonIndexed()))! };
}

function palmSpots(count: number): { x: number; z: number; s: number; r: number }[] {
  const rand = rng(1986);
  const out: { x: number; z: number; s: number; r: number }[] = [];
  const bands: [number, number][] = [
    [110, 134], // park promenade
    [140, 165], // upper beach
    [60, 86], // hotel row front gardens are tight; few
  ];
  for (let i = 0; i < count; i++) {
    const [a, b] = bands[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0]!;
    const x = a + rand() * (b - a);
    const z = WORLD_BOUNDS.minZ + 6 + rand() * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - 12);
    if (CROSS_STREET_Z.some((c) => Math.abs(c - z) < CROSS_STREET_WIDTH)) continue;
    if (a === 60 && HOTEL_PLOTS.some((p) => x >= p.footprint.minX - 1 && x <= p.footprint.maxX + 1 && z >= p.footprint.minZ - 1 && z <= p.footprint.maxZ + 1)) continue;
    out.push({ x, z, s: 0.8 + rand() * 0.45, r: rand() * Math.PI * 2 });
  }
  return out;
}

export function Palms() {
  const models = useGeneratedModels();
  const palm = models?.get("palm");
  useFrame((_, dt) => tickPalmSway(dt));
  if (palm)
    return (
      <Suspense fallback={null}>
        <GeneratedPalms entry={palm} count={Math.round(QUALITY.palms * 0.5)} />
      </Suspense>
    );
  return <ProceduralPalms />;
}

function ProceduralPalms() {
  const trunkRef = useRef<InstancedMesh>(null);
  const leafRef = useRef<InstancedMesh>(null);
  const { trunk, leaves } = useMemo(palmGeometries, []);
  const spots = useMemo(() => palmSpots(QUALITY.palms), []);
  const mats = useMemo(
    () => ({
      trunk: withSway(new MeshStandardMaterial({ color: "#7a5a3c", roughness: 0.95 }), 0.5),
      leaf: withSway(new MeshStandardMaterial({ color: "#2f7d3a", roughness: 0.7, flatShading: true }), 0.9),
    }),
    [],
  );
  useLayoutEffect(() => {
    const o = new Object3D();
    spots.forEach((p, i) => {
      o.position.set(p.x, 0, p.z);
      o.rotation.set(0, p.r, 0);
      o.scale.setScalar(p.s);
      o.updateMatrix();
      trunkRef.current?.setMatrixAt(i, o.matrix);
      leafRef.current?.setMatrixAt(i, o.matrix);
      leafRef.current?.setColorAt(i, new Color().setHSL(0.3 + (i % 5) * 0.015, 0.45, 0.28 + (i % 3) * 0.04));
    });
    for (const r of [trunkRef, leafRef]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, [spots]);
  useFrame((_, dt) => {
    swayTime.value += dt;
  });
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunk, mats.trunk, spots.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={leafRef} args={[leaves, mats.leaf, spots.length]} castShadow frustumCulled={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------

/** Neon tube colours; intensity follows night. Emissive above 1 so only neon blooms. */
export const NEON = {
  pink: new MeshStandardMaterial({ color: "#200010", emissive: "#ff2f9a", toneMapped: false }),
  cyan: new MeshStandardMaterial({ color: "#001820", emissive: "#2fe4ff", toneMapped: false }),
  yellow: new MeshStandardMaterial({ color: "#201800", emissive: "#ffd23f", toneMapped: false }),
  violet: new MeshStandardMaterial({ color: "#100020", emissive: "#a35cff", toneMapped: false }),
  lamp: new MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd9a0", toneMapped: false }),
};
const NEON_COLORS = [NEON.pink, NEON.cyan, NEON.yellow, NEON.violet] as const;

export function NeonDriver() {
  useFrame(() => {
    const g = nightGlow(tod.value);
    const flicker = 0.96 + Math.random() * 0.04;
    NEON.pink.emissiveIntensity = (1.1 + g * 1.9) * flicker;
    NEON.cyan.emissiveIntensity = 1.1 + g * 1.9;
    NEON.yellow.emissiveIntensity = 1 + g * 1.6;
    NEON.violet.emissiveIntensity = 1.1 + g * 1.9;
    NEON.lamp.emissiveIntensity = 0.2 + g * 2.6;
  });
  return null;
}

interface Tube {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  mat: MeshStandardMaterial;
}

function neonTubes(): Tube[] {
  const out: Tube[] = [];
  const blockLocs = ["police_station", "bank", "nightclub", "pawn_shop", "exchange"] as const;
  blockLocs.forEach((id, i) => {
    const l = LOCATIONS[id];
    const f = l.footprint;
    const len = f.maxZ - f.minZ;
    const mat = id === "police_station" ? NEON.cyan : id === "nightclub" ? NEON.pink : NEON_COLORS[i % NEON_COLORS.length]!;
    // Roofline tube on the street face, plus a second band above the door.
    out.push({ x: f.minX - 0.12, y: l.height - 0.5, z: (f.minZ + f.maxZ) / 2, sx: 0.18, sy: 0.18, sz: len - 1, mat });
    out.push({ x: f.minX - 0.12, y: 3.6, z: l.entrance.z, sx: 0.12, sy: 0.12, sz: 7, mat: id === "nightclub" ? NEON.cyan : mat });
  });
  HOTEL_PLOTS.forEach((p, i) => {
    const f = p.footprint;
    const mat = NEON_COLORS[i % NEON_COLORS.length]!;
    const zc = (f.minZ + f.maxZ) / 2;
    const len = f.maxZ - f.minZ;
    // Ocean-facing roofline and a vertical blade on the corner: the beachfront look.
    out.push({ x: f.maxX + 0.12, y: p.height - 0.6, z: zc, sx: 0.18, sy: 0.18, sz: len - 1, mat });
    out.push({ x: f.maxX + 0.25, y: p.height / 2 + 1.5, z: f.minZ + 1.2, sx: 0.3, sy: p.height - 4, sz: 0.3, mat: NEON_COLORS[(i + 1) % NEON_COLORS.length]! });
  });
  return out;
}

export function NeonSigns() {
  const tubes = useMemo(neonTubes, []);
  const bank = useRef<PointLight>(null);
  const club = useRef<PointLight>(null);
  useFrame(() => {
    const g = nightGlow(tod.value);
    if (bank.current) bank.current.intensity = 20 + g * 140;
    if (club.current) club.current.intensity = (30 + g * 220) * (0.85 + Math.sin(performance.now() / 180) * 0.15);
  });
  const b = LOCATIONS.bank.entrance;
  const c = LOCATIONS.nightclub.entrance;
  return (
    <group>
      {tubes.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.z]} material={t.mat}>
          <boxGeometry args={[t.sx, t.sy, t.sz]} />
        </mesh>
      ))}
      {/* The only real point lights (SPEC.md section 8). */}
      <pointLight ref={bank} position={[b.x - 2, 4, b.z]} color="#5fe0ff" distance={26} decay={2} />
      <pointLight ref={club} position={[c.x - 2, 4, c.z]} color="#ff3fa8" distance={30} decay={2} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------

function lampSpots(): { x: number; z: number; ry: number }[] {
  const out: { x: number; z: number; ry: number }[] = [];
  for (let z = WORLD_BOUNDS.minZ + 10; z < WORLD_BOUNDS.maxZ; z += 26) {
    if (CROSS_STREET_Z.some((c) => Math.abs(c - z) < CROSS_STREET_WIDTH / 2 + 1)) continue;
    out.push({ x: 88.6, z: z + 13, ry: Math.PI }); // avenue, west side
    out.push({ x: 107.4, z, ry: 0 }); // avenue, park side
  }
  return out;
}

export function StreetLamps() {
  const spots = useMemo(lampSpots, []);
  const pole = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const geo = useMemo(() => {
    const p = new CylinderGeometry(0.08, 0.12, 6, 6);
    p.translate(0, 3, 0);
    const arm = new CylinderGeometry(0.05, 0.05, 1.6, 5);
    arm.rotateZ(Math.PI / 2);
    arm.translate(0.8, 5.9, 0);
    const h = new SphereGeometry(0.28, 10, 8);
    h.scale(1, 0.6, 1);
    h.translate(1.55, 5.75, 0);
    return { pole: mergeGeometries([p, arm])!, head: h };
  }, []);
  const poleMat = useMemo(() => new MeshStandardMaterial({ color: "#2b2b33", metalness: 0.6, roughness: 0.45 }), []);
  useLayoutEffect(() => {
    const o = new Object3D();
    spots.forEach((s, i) => {
      o.position.set(s.x, 0, s.z);
      o.rotation.set(0, s.ry, 0);
      o.updateMatrix();
      pole.current?.setMatrixAt(i, o.matrix);
      head.current?.setMatrixAt(i, o.matrix);
    });
    for (const r of [pole, head]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <group>
      <instancedMesh ref={pole} args={[geo.pole, poleMat, spots.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={head} args={[geo.head, NEON.lamp, spots.length]} frustumCulled={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------

/** Beachfront avenue: the one reflective surface, so neon mirrors on the road. */
export function Avenue() {
  const band = BANDS.find((b) => b.id === "beachfront_avenue")!;
  const { minZ, maxZ } = WORLD_BOUNDS;
  const w = band.maxX - band.minX;
  const pos: [number, number, number] = [(band.minX + band.maxX) / 2, 0.012, 0];
  return (
    <mesh position={pos} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[w, maxZ - minZ]} />
      {QUALITY.reflections ? (
        <MeshReflectorMaterial
          resolution={QUALITY.quality === "high" ? 1024 : 512}
          mirror={0.6}
          mixBlur={6}
          mixStrength={2.2}
          blur={[300, 80]}
          roughness={0.75}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#1d1b24"
          metalness={0.4}
        />
      ) : (
        <meshStandardMaterial color="#26242d" roughness={0.6} metalness={0.2} />
      )}
    </mesh>
  );
}

/** Dashed centre lines on Second Street and the avenue, plus kerbs. */
export function RoadMarkings() {
  const dash = useRef<InstancedMesh>(null);
  const dashes = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let z = WORLD_BOUNDS.minZ + 2; z < WORLD_BOUNDS.maxZ; z += 6) {
      if (CROSS_STREET_Z.some((c) => Math.abs(c - z) < CROSS_STREET_WIDTH / 2 + 1)) continue;
      out.push({ x: (SECOND_STREET_ROAD.minX + SECOND_STREET_ROAD.maxX) / 2, z });
      out.push({ x: 98, z });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new Object3D();
    o.rotation.x = -Math.PI / 2;
    dashes.forEach((d, i) => {
      o.position.set(d.x, 0.03, d.z);
      o.updateMatrix();
      dash.current?.setMatrixAt(i, o.matrix);
    });
    if (dash.current) {
      dash.current.instanceMatrix.needsUpdate = true;
      dash.current.computeBoundingSphere();
    }
  }, [dashes]);
  const { minZ, maxZ } = WORLD_BOUNDS;
  return (
    <group>
      <instancedMesh ref={dash} args={[undefined, undefined, dashes.length]} frustumCulled={false}>
        <planeGeometry args={[0.18, 3]} />
        <meshStandardMaterial color="#f2c94c" roughness={0.6} />
      </instancedMesh>
      {/* Kerbs between road and pavement. */}
      {[SECOND_STREET_ROAD.maxX, 88, 108].map((x) => (
        <mesh key={x} position={[x, 0.08, 0]} receiveShadow>
          <boxGeometry args={[0.3, 0.16, maxZ - minZ]} />
          <meshStandardMaterial color="#cfc6b8" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
