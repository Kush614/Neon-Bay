// Golden-hour-to-night lighting rig (SPEC.md section 8), driven by timeOfDay.
// The sun sets in the west, behind Second Street; the shadow camera follows the local player
// so one 70 m map stays sharp (a stand-in for cascaded shadow maps).
import { Environment, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { PHASE_SECONDS, type Phase } from "@neon-bay/shared";
import { useRef } from "react";
import { Color, MathUtils, Vector3, type DirectionalLight, type Fog, type HemisphereLight } from "three";
import { useNetStore } from "../net/connection.js";
import { useLocalStore } from "../store.js";
import { QUALITY } from "./quality.js";
import { nightGlow, ramp, targetTimeOfDay, tod } from "./timeOfDay.js";

const SUN_AZIMUTH = MathUtils.degToRad(250); // west-south-west, over the city
const sunDir = new Vector3();

export function sunDirection(t: number, out = sunDir): Vector3 {
  const elevation = MathUtils.degToRad(MathUtils.lerp(16, -7, t));
  return out.set(Math.cos(elevation) * Math.cos(SUN_AZIMUTH), Math.sin(elevation), Math.cos(elevation) * Math.sin(SUN_AZIMUTH));
}

/** Eases the shared timeOfDay toward the session's target every frame. */
export function TimeOfDayDriver() {
  useFrame((_, dt) => {
    const g = useNetStore.getState().game;
    const target = targetTimeOfDay(g.phase as Phase, g.timeLeft ?? (PHASE_SECONDS as Record<string, number>)[g.phase] ?? 0);
    tod.value = MathUtils.damp(tod.value, target, 0.6, Math.min(dt, 0.1));
  });
  return null;
}

export function DuskLighting() {
  const sun = useRef<DirectionalLight>(null);
  const moon = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const stars = useRef<{ visible: boolean }>(null);
  const scene = useThree((s) => s.scene);
  const fogColor = useRef(new Color());

  useFrame(() => {
    const t = tod.value;
    const p = useLocalStore.getState().position;
    const d = sunDirection(t);
    const s = sun.current;
    if (s) {
      s.position.set(p.x + d.x * 150, Math.max(d.y, 0.05) * 150, p.z + d.z * 150);
      s.target.position.set(p.x, 0, p.z);
      s.target.updateMatrixWorld();
      s.intensity = MathUtils.lerp(3.4, 0, MathUtils.smoothstep(t, 0.55, 0.95));
      s.color.copy(ramp(t, ["#ffc28a", "#ff8a4a", "#ff4a3a"]));
    }
    if (moon.current) {
      moon.current.intensity = MathUtils.lerp(0, 0.55, MathUtils.smoothstep(t, 0.6, 1));
      moon.current.position.set(p.x + 80, 160, p.z + 60);
      moon.current.target.position.set(p.x, 0, p.z);
      moon.current.target.updateMatrixWorld();
    }
    if (hemi.current) {
      hemi.current.color.copy(ramp(t, ["#ffd6b0", "#d98ab8", "#3a3f8f"]));
      hemi.current.groundColor.copy(ramp(t, ["#6b4a3a", "#4a2f4a", "#120f24"]));
      hemi.current.intensity = MathUtils.lerp(1.1, 0.45, t);
    }
    scene.backgroundIntensity = MathUtils.lerp(1, 0.04, MathUtils.smoothstep(t, 0.45, 0.95));
    if (stars.current) stars.current.visible = t > 0.7;
    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.color.copy(fogColor.current.copy(ramp(t, ["#f2b38c", "#b2628c", "#1b1638"])));
      fog.near = MathUtils.lerp(90, 60, t);
      fog.far = MathUtils.lerp(520, 380, t);
    }
    scene.environmentIntensity = MathUtils.lerp(0.9, 0.35, t) + nightGlow(t) * 0.1;
  });

  return (
    <>
      <Stars ref={stars as never} radius={600} depth={80} count={2500} factor={5} fade speed={0} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow={QUALITY.shadows}
        shadow-mapSize={[QUALITY.shadowMapSize, QUALITY.shadowMapSize]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight ref={moon} color="#8fa8ff" />
      {/* CC0 photographed sunset sky (Poly Haven, ASSETS.md): background and image-based light. */}
      <Environment files="/cc0/hdri/belfast_sunset_puresky_2k.hdr" background backgroundRotation={[0, SUN_AZIMUTH + Math.PI / 2, 0]} environmentRotation={[0, SUN_AZIMUTH + Math.PI / 2, 0]} />
      <fog attach="fog" args={["#f2b38c", 90, 520]} />
    </>
  );
}
