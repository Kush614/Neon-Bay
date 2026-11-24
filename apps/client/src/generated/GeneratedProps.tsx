// Runware-generated cars and palms, normalised to real-world size at load time.
import { Clone, useGLTF } from "@react-three/drei";
import type { GeneratedModelEntry } from "@neon-bay/shared";
import { CROSS_STREET_WIDTH, CROSS_STREET_Z, HOTEL_PLOTS, WORLD_BOUNDS } from "@neon-bay/shared";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Box3, Color, Matrix4, MeshStandardMaterial, Object3D, Vector3, type BufferGeometry, type InstancedMesh, type Material, type Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toFloatGeometry } from "./dequantize.js";

const CAR_LENGTH = 4.4; // CAR_HALF_EXTENTS.z * 2
/** Tripo cars come out facing +x; turn them to face +z (the car's forward). */
export const CAR_YAW = -Math.PI / 2;

/** The generated car variant whose paint is closest to the vehicle's colour. */
export function nearestCar(models: Map<string, GeneratedModelEntry>, color: string): GeneratedModelEntry | undefined {
  const target = new Color(color);
  let best: { e: GeneratedModelEntry; d: number } | undefined;
  for (const e of models.values()) {
    if (e.kind !== "car" || !e.paint) continue;
    const c = new Color(e.paint);
    const d = (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2;
    if (!best || d < best.d) best = { e, d };
  }
  return best?.e;
}

function fit(scene: Object3D, yaw: number) {
  const holder = new Object3D();
  holder.rotation.y = yaw;
  holder.add(scene.clone());
  holder.updateMatrixWorld(true);
  const box = new Box3().setFromObject(holder);
  const size = box.getSize(new Vector3());
  const s = CAR_LENGTH / Math.max(size.x, size.z);
  const c = box.getCenter(new Vector3());
  return { scale: s, position: new Vector3(-c.x * s, -box.min.y * s, -c.z * s) };
}

export function GeneratedCar({ entry }: { entry: GeneratedModelEntry }) {
  const gltf = useGLTF(entry.file);
  const f = useMemo(() => {
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    return fit(gltf.scene, CAR_YAW);
  }, [gltf]);
  return (
    <group scale={f.scale} position={f.position}>
      <group rotation-y={CAR_YAW}>
        <Clone object={gltf.scene} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const swayTime = { value: 0 };
export function tickPalmSway(dt: number) {
  swayTime.value += dt;
}

/** Instanced generated palms (one draw call per material), swaying in the vertex shader. */
export function GeneratedPalms({ entry, count, at }: { entry: GeneratedModelEntry; count: number; at?: [number, number][] }) {
  const gltf = useGLTF(entry.file);
  const parts = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const byMat = new Map<Material, BufferGeometry[]>();
    gltf.scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const g = toFloatGeometry(m.geometry).applyMatrix4(m.matrixWorld);
      const mat = Array.isArray(m.material) ? m.material[0]! : m.material;
      byMat.set(mat, [...(byMat.get(mat) ?? []), g]);
    });
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const c = box.getCenter(new Vector3());
    const s = entry.heightMetres / size.y;
    const norm = new Matrix4().makeScale(s, s, s).multiply(new Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
    return [...byMat].map(([mat, gs]) => {
      const geometry = (gs.length > 1 ? mergeGeometries(gs) : gs[0])!.applyMatrix4(norm);
      const material = (mat as MeshStandardMaterial).clone();
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uSway = swayTime;
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uSway;").replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float hgt = max(position.y, 0.0) / ${entry.heightMetres.toFixed(1)};
           vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float ph = base.x * 0.13 + base.z * 0.07;
           transformed.x += (sin(uSway * 1.1 + ph) * 0.5 + sin(uSway * 2.3 + ph * 2.0) * 0.2) * hgt * hgt;
           transformed.z += cos(uSway * 0.9 + ph) * hgt * hgt * 0.4;`,
        );
      };
      return { geometry, material };
    });
  }, [gltf, entry.heightMetres]);
  const spots = useMemo(() => {
    const rand = rng(1986);
    const out: Matrix4[] = [];
    const o = new Object3D();
    if (at) return at.map(([x, z]) => new Matrix4().makeTranslation(x, 0, z));
    const bands: [number, number][] = [[110, 134], [140, 165], [60, 86]];
    for (let i = 0; out.length < count && i < count * 3; i++) {
      const [a, b] = bands[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0]!;
      const x = a + rand() * (b - a);
      const z = WORLD_BOUNDS.minZ + 6 + rand() * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - 12);
      if (CROSS_STREET_Z.some((cz) => Math.abs(cz - z) < CROSS_STREET_WIDTH)) continue;
      if (a === 60 && HOTEL_PLOTS.some((p) => x >= p.footprint.minX - 1 && x <= p.footprint.maxX + 1 && z >= p.footprint.minZ - 1 && z <= p.footprint.maxZ + 1)) continue;
      o.position.set(x, 0, z);
      o.rotation.set(0, rand() * Math.PI * 2, 0);
      o.scale.setScalar(0.8 + rand() * 0.45);
      o.updateMatrix();
      out.push(o.matrix.clone());
    }
    return out;
  }, [count, at]);
  const refs = useRef<(InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    for (const m of refs.current) {
      if (!m) continue;
      spots.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [spots, parts]);
  return (
    <group>
      {parts.map((p, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          args={[p.geometry, p.material, spots.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
