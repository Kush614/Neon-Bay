// Photo-scanned CC0 street furniture from Poly Haven (ASSETS.md): cast-iron lamps along Second
// Street. (The bins by the doors are physical now: physics/DynamicProps.tsx.) Models are normalised to real heights at load time.
// Triangle budget: ~13 lamps x 30k + 8 bins x 14k, under the 1.5M scene budget.
import { Clone, useGLTF } from "@react-three/drei";
import { CROSS_STREET_WIDTH, CROSS_STREET_Z, SECOND_STREET_ROAD, WORLD_BOUNDS } from "@neon-bay/shared";
import { useMemo } from "react";
import { Box3, Vector3, type Mesh, type Object3D } from "three";
import { NEON } from "./Props.js";

const LAMP = "/cc0/models/street_lamp_01/street_lamp_01.gltf";

/** Scale so the model is `height` metres tall with its base at y=0, centred on x/z. */
function normalise(scene: Object3D, height: number): { scale: number; offset: Vector3; size: Vector3 } {
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const scale = height / size.y;
  const c = box.getCenter(new Vector3());
  scene.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { scale, offset: new Vector3(-c.x, -box.min.y, -c.z).multiplyScalar(scale), size: size.multiplyScalar(scale) };
}

export function lampSpotsSecondStreet(): number[] {
  const out: number[] = [];
  for (let z = WORLD_BOUNDS.minZ + 10; z < WORLD_BOUNDS.maxZ; z += 30) {
    if (CROSS_STREET_Z.some((c) => Math.abs(c - z) < CROSS_STREET_WIDTH / 2 + 1)) continue;
    out.push(z);
  }
  return out;
}

export function StreetFurniture() {
  const lamp = useGLTF(LAMP);
  const lampFit = useMemo(() => normalise(lamp.scene, 5.5), [lamp]);
  const lampZ = useMemo(lampSpotsSecondStreet, []);
  const x = SECOND_STREET_ROAD.maxX + 0.8;
  return (
    <group>
      {lampZ.map((z) => (
        <group key={z} position={[x, 0, z]}>
          <Clone object={lamp.scene} scale={lampFit.scale} position={lampFit.offset} />
          {/* Warm glow at the lantern; neon-style emissive so it blooms at night. */}
          <mesh position={[0, lampFit.size.y - 0.55, 0]} material={NEON.lamp}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

useGLTF.preload(LAMP);
