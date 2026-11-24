// Buildings with procedural art-deco facades, parapet copings and windows that light up at night.
import { useFrame } from "@react-three/fiber";
import { HOTEL_PLOTS, type StaticBox } from "@neon-bay/shared";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, MeshStandardMaterial, Object3D, type InstancedMesh } from "three";
import { bankFacade, facadeBox, facadeTextures } from "./facade.js";
import { useGeneratedModels } from "../generated/manifest.js";
import { buildingModelId, FittedBuilding, PlacedModel } from "../generated/GeneratedProps.js";
import { Suspense } from "react";
import { Vector3 } from "three";
import { nightGlow, tod } from "./timeOfDay.js";

/** Lighten saturated location colours into painted-stucco pastels. */
function stucco(hex: string): Color {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(hsl.s, 0.55), Math.max(hsl.l, 0.62));
}

export function Buildings({ boxes }: { boxes: StaticBox[] }) {
  const models = useGeneratedModels();
  const tex = useMemo(facadeTextures, []);
  /** Box id -> generated building entry, when Runware made one for it. */
  const generated = useMemo(() => {
    const out = new Map<string, NonNullable<ReturnType<NonNullable<typeof models>["get"]>>>();
    if (!models) return out;
    for (const b of boxes) {
      const plotIndex = HOTEL_PLOTS.findIndex((p) => p.id === b.id);
      const id = buildingModelId(b.id, HOTEL_PLOTS[plotIndex]?.storeys, plotIndex);
      const e = id ? models.get(id) : undefined;
      if (e) out.set(b.id, e);
    }
    return out;
  }, [models, boxes]);
  const faced = useMemo(() => boxes.filter((b) => b.visible && (b.kind === "building" || b.kind === "hotel")), [boxes]);
  const others = useMemo(() => boxes.filter((b) => b.visible && b.kind !== "building" && b.kind !== "hotel"), [boxes]);
  const materials = useMemo(
    () =>
      faced.map((b) =>
        b.id.startsWith("bank_")
          ? new MeshStandardMaterial({ map: bankFacade(), normalMap: tex.normal, roughness: 0.75, metalness: 0.05 })
          : new MeshStandardMaterial({
            map: tex.map,
            emissiveMap: tex.emissive,
            emissive: new Color("#ffffff"),
            roughnessMap: tex.roughness,
            normalMap: tex.normal,
            color: stucco(b.color),
            roughness: 1,
            metalness: 0.05,
          }),
      ),
    [faced, tex],
  );
  const geos = useMemo(() => faced.map((b) => facadeBox(b.half.x * 2, b.half.y * 2, b.half.z * 2)), [faced]);
  // Parapet copings on the tall buildings, as one instanced mesh.
  const copings = useMemo(() => faced.filter((b) => b.half.y > 2.5 && !b.id.startsWith("bank_") && !generated.has(b.id)), [faced, generated]);
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
      {faced.map((b, i) => {
        const e = generated.get(b.id);
        if (e)
          return (
            <Suspense key={b.id} fallback={null}>
              <FittedBuilding entry={e} center={new Vector3(b.center.x, 0, b.center.z)} size={new Vector3(b.half.x * 2, b.half.y * 2, b.half.z * 2)} facing={b.kind === "hotel" ? "+x" : "-x"} />
            </Suspense>
          );
        return (
        <mesh key={b.id} position={[b.center.x, b.center.y, b.center.z]} geometry={geos[i]} material={materials[i]} castShadow receiveShadow />
        );
      })}
      <instancedMesh ref={coping} args={[unit, undefined, copings.length]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#f7f3ea" roughness={0.7} />
      </instancedMesh>
      {others.map((b) => {
        const tower = b.id.startsWith("lifeguard_") ? models?.get("lifeguard_tower") : undefined;
        if (tower)
          return (
            <Suspense key={b.id} fallback={null}>
              <PlacedModel entry={tower} x={b.center.x} y={0} z={b.center.z} yaw={Math.PI / 2} />
            </Suspense>
          );
        return (
        <mesh key={b.id} position={[b.center.x, b.center.y, b.center.z]} castShadow receiveShadow>
          <boxGeometry args={[b.half.x * 2, b.half.y * 2, b.half.z * 2]} />
          <meshStandardMaterial color={b.color} roughness={0.8} />
        </mesh>
        );
      })}
    </group>
  );
}
