// Midday-to-night lighting rig (SPEC.md section 8), driven by timeOfDay. Two photographed CC0
// skies (Poly Haven): a clear sunny one with cumulus until golden hour, then a sunset one.
// The sun's light matches each photo's sun (azimuth u = 0.6 in both, 48 deg up at midday).
// The sun sets in the west, behind Second Street; the shadow camera follows the local player
// so one 70 m map stays sharp (a stand-in for cascaded shadow maps).
import { Environment, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { PHASE_SECONDS, type Phase } from "@neon-bay/shared";
import { useEffect, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { Color, MathUtils, Vector3, type DirectionalLight, type Fog, type HemisphereLight } from "three";
import { useNetStore } from "../net/connection.js";
import { useLocalStore } from "../store.js";
import { QUALITY } from "./quality.js";
import { daylight, dusk, GOLDEN, nightGlow, PINNED_TOD, ramp, targetTimeOfDay, tod } from "./timeOfDay.js";

const SUN_AZIMUTH = MathUtils.degToRad(250); // west-south-west, over the city
const sunDir = new Vector3();

const DAY_SKY = "/cc0/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr";
const SUNSET_SKY = "/cc0/hdri/belfast_sunset_puresky_2k.hdr";
/** Swap skies a little before golden hour, under a brief dimming so the change isn't a pop. */
const SKY_SWAP = GOLDEN - 0.04;

export function sunDirection(t: number, out = sunDir): Vector3 {
  // 48 deg at midday (where the day photo's sun is), 16 deg at golden hour, -7 deg at night.
  const deg = t < GOLDEN ? MathUtils.lerp(48, 16, MathUtils.smoothstep(t, 0, GOLDEN)) : MathUtils.lerp(16, -7, dusk(t));
  const elevation = MathUtils.degToRad(deg);
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
  const [sky, setSky] = useState(() => (tod.value < SKY_SWAP ? DAY_SKY : SUNSET_SKY));
  // Fetch the sunset sky once the game is idle, so it is cached before golden hour and is
  // not part of the initial download.
  useEffect(() => {
    // Only fetch the sunset sky if this session can reach it (?tod=cycle or a late ?tod).
    if (PINNED_TOD !== null && PINNED_TOD < SKY_SWAP) return;
    const id = setTimeout(() => useLoader.preload(HDRLoader, SUNSET_SKY), 8000);
    return () => clearTimeout(id);
  }, []);

  useFrame(() => {
    const t = tod.value;
    const want = t < SKY_SWAP ? DAY_SKY : SUNSET_SKY;
    if (want !== sky) setSky(want);
    const day = daylight(t);
    const d = dusk(t);
    const p = useLocalStore.getState().position;
    const sd = sunDirection(t);
    const s = sun.current;
    if (s) {
      s.position.set(p.x + sd.x * 150, Math.max(sd.y, 0.05) * 150, p.z + sd.z * 150);
      s.target.position.set(p.x, 0, p.z);
      s.target.updateMatrixWorld();
      s.intensity = MathUtils.lerp(3.4, 0, MathUtils.smoothstep(d, 0.25, 0.92)) + day * 0.5;
      s.color.copy(ramp(t, ["#ffc28a", "#ff8a4a", "#ff4a3a"], "#fff3e2"));
    }
    if (moon.current) {
      moon.current.intensity = MathUtils.lerp(0, 0.55, MathUtils.smoothstep(d, 0.35, 1));
      moon.current.position.set(p.x + 80, 160, p.z + 60);
      moon.current.target.position.set(p.x, 0, p.z);
      moon.current.target.updateMatrixWorld();
    }
    if (hemi.current) {
      hemi.current.color.copy(ramp(t, ["#ffd6b0", "#d98ab8", "#3a3f8f"], "#cfe4ff"));
      hemi.current.groundColor.copy(ramp(t, ["#6b4a3a", "#4a2f4a", "#120f24"], "#8c7a62"));
      hemi.current.intensity = MathUtils.lerp(1.1, 0.45, d) + day * 0.2;
    }
    // Dip around the sky swap (a passing cloud), then the sunset sky fades out into the night.
    const swapDip = 1 - 0.55 * Math.exp(-(((t - SKY_SWAP) / 0.025) ** 2));
    scene.backgroundIntensity = MathUtils.lerp(1, 0.04, MathUtils.smoothstep(d, 0.1, 0.92)) * swapDip;
    if (stars.current) stars.current.visible = d > 0.5;
    const fog = scene.fog as Fog | null;
    if (fog) {
      // A light sea haze at midday (it matches the day photo's horizon), thicker toward night.
      fog.color.copy(fogColor.current.copy(ramp(t, ["#f2b38c", "#b2628c", "#1b1638"], "#c4dcf2")));
      fog.near = MathUtils.lerp(90, 60, d) + day * 110;
      fog.far = MathUtils.lerp(520, 380, d) + day * 480;
    }
    scene.environmentIntensity = (MathUtils.lerp(0.9, 0.35, d) - day * 0.1) * swapDip + nightGlow(t) * 0.1;
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
      {/* CC0 photographed skies (Poly Haven, ASSETS.md): background and image-based light. */}
      <Environment files={sky} background backgroundRotation={[0, SUN_AZIMUTH + Math.PI / 2, 0]} environmentRotation={[0, SUN_AZIMUTH + Math.PI / 2, 0]} />
      <fog attach="fog" args={["#f2b38c", 90, 520]} />
    </>
  );
}
