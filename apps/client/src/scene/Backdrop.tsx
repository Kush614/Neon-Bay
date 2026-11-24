import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { BAY, STOREY, facadeTextures } from "./facade.js";
import { nightGlow, tod } from "./timeOfDay.js";

/** Facade material for instanced, scaled boxes: UVs come from world position in the shader. */
function backdropMaterial(): MeshStandardMaterial {
  const tex = facadeTextures();
  const m = new MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissive, emissive: new Color("#ffffff"), roughnessMap: tex.roughness, normalMap: tex.normal, roughness: 1 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
       vec4 nbWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
       vec3 nbN = abs(normal);
       vec2 nbUv = (nbN.x > 0.5 ? nbWorld.zy : nbWorld.xy) / vec2(${(BAY * 4).toFixed(2)}, ${(STOREY * 4).toFixed(2)});
       if (nbN.y > 0.5) nbUv = vec2(0.004, 0.996);
       vMapUv = nbUv;
       vEmissiveMapUv = nbUv;
       vRoughnessMapUv = nbUv;
       vNormalMapUv = (normalMapTransform * vec3(nbUv, 1.0)).xy;`,
    );
  };
  return m;
}
import { GROUND, WORLD_BOUNDS } from "@neon-bay/shared";

// Deterministic PRNG so the backdrop is identical on every client.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Block { x: number; z: number; w: number; d: number; h: number; color: Color }

const PALETTE = ["#e8d4e8", "#f2d6c4", "#cfe0ec", "#ece4c8", "#f4c9d6", "#cdeadb", "#ffffff"];

/** Non-colliding city blocks outside the playable area, so the map edges don't read as void. */
function backdropBlocks(): Block[] {
  const rand = mulberry32(1986);
  const blocks: Block[] = [];
  const add = (minX: number, maxX: number, minZ: number, maxZ: number) => {
    for (let x = minX; x < maxX; x += 22) {
      for (let z = minZ; z < maxZ; z += 22) {
        if (rand() < 0.15) continue;
        blocks.push({
          x: x + 11,
          z: z + 11,
          w: 12 + rand() * 7,
          d: 12 + rand() * 7,
          h: 6 + rand() * rand() * 40,
          color: new Color(PALETTE[Math.floor(rand() * PALETTE.length)]!),
        });
      }
    }
  };
  const { minX, minZ, maxZ } = WORLD_BOUNDS;
  add(minX - 8 - 22 * 8, minX - 8, minZ - 22 * 6, maxZ + 22 * 6); // west of Second Street
  add(minX, GROUND.maxX - 70, minZ - 8 - 22 * 6, minZ - 8); // north of the map
  add(minX, GROUND.maxX - 70, maxZ + 8, maxZ + 8 + 22 * 6); // south of the map
  return blocks;
}

export function Backdrop() {
  const blocks = useMemo(backdropBlocks, []);
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(backdropMaterial, []);
  useFrame(() => {
    material.emissiveIntensity = nightGlow(tod.value) * 1.4;
  });

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    blocks.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, b.color);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [blocks]);

  const { minX, minZ, maxZ } = WORLD_BOUNDS;
  return (
    <group>
      {/* Land beyond the playable area */}
      <mesh position={[(minX - 400 + GROUND.maxX) / 2, -0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[GROUND.maxX - minX + 400, (maxZ - minZ) + 800]} />
        <meshStandardMaterial color="#4a4650" roughness={1} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, material, blocks.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  );
}
