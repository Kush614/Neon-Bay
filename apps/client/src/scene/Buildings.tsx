// Buildings with procedural art-deco facades, parapet copings and windows that light up at night.
import { useFrame } from "@react-three/fiber";
import type { StaticBox } from "@neon-bay/shared";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { facadeBox, facadeTextures } from "./facade.js";
import { nightGlow, tod } from "./timeOfDay.js";

/** Lighten saturated location colours into painted-stucco pastels. */
function stucco(hex: string): Color {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(hsl.s, 0.55), Math.max(hsl.l, 0.62));
}

export function Buildings({ boxes }: { boxes: StaticBox[] }) {
  const tex = useMemo(facadeTextures, []);
  const faced = useMemo(() => boxes.filter((b) => b.visible && (b.kind === "building" || b.kind === "hotel")), [boxes]);
  const others = useMemo(() => boxes.filter((b) => b.visible && b.kind !== "building" && b.kind !== "hotel"), [boxes]);
  const materials = useMemo(
    () =>
      faced.map(
        (b) =>
          new MeshStandardMaterial({
            map: tex.map,
            emissiveMap: tex.emissive,
            emissive: new Color("#ffffff"),
            roughnessMap: tex.roughness,
            color: stucco(b.color),
            roughness: 1,
            metalness: 0.05,
          }),
      ),
    [faced, tex],
  );
  const geos = useMemo(() => faced.map((b) => facadeBox(b.half.x * 2, b.half.y * 2, b.half.z * 2)), [faced]);
  // Parapet copings on the tall buildings, as one instanced mesh.
  const copings = useMemo(() => faced.filter((b) => b.half.y > 2.5 && !b.id.startsWith("bank_")), [faced]);
  const coping = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    copings.forEach((b, i) => {
      o.position.set(b.center.x, b.center.y + b.half.y + 0.2, b.center.z);
      o.scale.set(b.half.x * 2 + 0.5, 0.4, b.half.z * 2 + 0.5);
      o.updateMatrix();
      coping.current?.setMatrixAt(i, o.matrix);
    });
    if (coping.current) {
      coping.current.instanceMatrix.needsUpdate = true;
      coping.current.computeBoundingSphere();
    }
  }, [copings]);
  const unit = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useFrame(() => {
    const g = nightGlow(tod.value);
    for (const m of materials) m.emissiveIntensity = g * 1.6;
  });
  return (
    <group>
      {faced.map((b, i) => (
        <mesh key={b.id} position={[b.center.x, b.center.y, b.center.z]} geometry={geos[i]} material={materials[i]} castShadow receiveShadow />
      ))}
      <instancedMesh ref={coping} args={[unit, undefined, copings.length]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#f7f3ea" roughness={0.7} />
      </instancedMesh>
      {others.map((b) => (
        <mesh key={b.id} position={[b.center.x, b.center.y, b.center.z]} castShadow receiveShadow>
          <boxGeometry args={[b.half.x * 2, b.half.y * 2, b.half.z * 2]} />
          <meshStandardMaterial color={b.color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
