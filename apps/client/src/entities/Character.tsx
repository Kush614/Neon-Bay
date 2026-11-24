// Stylised 1980s people built from primitives (original): jointed legs and arms with a walk
// cycle driven by how fast the character actually moves, hair, sunglasses for some, and an
// outfit chosen from the name so every player looks different. Feet at the group origin.
import { useFrame } from "@react-three/fiber";
import { forwardRef, useMemo, useRef } from "react";
import { MathUtils, Vector3, type Group } from "three";
import type { CaptureLabel } from "../capture/mode.js";
import { NameTag } from "./NameTag.js";

const SKIN = ["#f1c6a0", "#e0a97c", "#c68a5c", "#9b6640", "#6e4528", "#f5d3b8"];
const HAIR = ["#1d1611", "#3b2416", "#6b3f1f", "#c99a4b", "#e8d6a8", "#8a2a2a", "#2a2a2a"];
const JACKET = ["#ff6fae", "#4fd1ff", "#f7f2e8", "#ffd166", "#8e6cff", "#2ec4b6", "#ff8c5a", "#e8e8f0"];
const SHIRT = ["#1e1e28", "#ffffff", "#5fe3c0", "#ff9ad5", "#ffe08a", "#7fb3ff"];
const PANTS = ["#f4efe4", "#2a3245", "#3b3b44", "#d8c8a8", "#5a6b8a", "#1c1c22"];

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function outfit(name: string) {
  const h = hash(name);
  const pick = <T,>(a: readonly T[], shift: number) => a[(h >>> shift) % a.length]!;
  return {
    skin: pick(SKIN, 0),
    hair: pick(HAIR, 4),
    jacket: pick(JACKET, 8),
    shirt: pick(SHIRT, 12),
    pants: pick(PANTS, 16),
    shades: ((h >>> 20) & 3) !== 0,
    longHair: ((h >>> 23) & 3) === 0,
  };
}

const Mat = ({ c, r = 0.75, m = 0 }: { c: string; r?: number; m?: number }) => <meshStandardMaterial color={c} roughness={r} metalness={m} />;

export const Character = forwardRef<Group, { name: string; color: string; bag?: boolean; label?: CaptureLabel; showName?: boolean }>(function Character(
  { name, color, bag = false, label, showName = true },
  ref,
) {
  const o = useMemo(() => outfit(name), [name]);
  const root = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const state = useRef({ last: new Vector3(), now: new Vector3(), phase: 0, speed: 0, init: false });

  useFrame((_, dt) => {
    const r = root.current;
    if (!r || dt <= 0) return;
    const s = state.current;
    r.getWorldPosition(s.now);
    if (!s.init) {
      s.last.copy(s.now);
      s.init = true;
    }
    const moved = Math.hypot(s.now.x - s.last.x, s.now.z - s.last.z) / dt;
    s.last.copy(s.now);
    s.speed = MathUtils.damp(s.speed, Math.min(moved, 9), 10, dt);
    const stride = Math.min(s.speed / 3.5, 1.2);
    s.phase += dt * (4 + s.speed * 1.6) * (stride > 0.05 ? 1 : 0);
    const swing = Math.sin(s.phase) * 0.7 * stride;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8;
    if (armR.current) armR.current.rotation.x = swing * 0.8;
    if (torso.current) {
      torso.current.position.y = 0.95 + Math.abs(Math.cos(s.phase)) * 0.05 * stride + Math.sin(performance.now() / 700) * 0.006;
      torso.current.rotation.x = stride * 0.08;
    }
  });

  const leg = (side: number, refL: typeof legL) => (
    <group ref={refL} position={[side * 0.11, 0.95, 0]}>
      <mesh position={[0, -0.24, 0]} castShadow>
        <capsuleGeometry args={[0.085, 0.36, 4, 8]} />
        <Mat c={o.pants} r={0.85} />
      </mesh>
      <mesh position={[0, -0.66, 0.01]} castShadow>
        <capsuleGeometry args={[0.072, 0.36, 4, 8]} />
        <Mat c={o.pants} r={0.85} />
      </mesh>
      <mesh position={[0, -0.9, 0.06]} castShadow>
        <boxGeometry args={[0.13, 0.09, 0.28]} />
        <Mat c="#f5f5f5" r={0.5} />
      </mesh>
    </group>
  );

  const arm = (side: number, refA: typeof armL) => (
    <group ref={refA} position={[side * 0.25, 0.5, 0]}>
      <mesh position={[side * 0.02, -0.2, 0]} rotation-z={side * 0.06} castShadow>
        <capsuleGeometry args={[0.07, 0.3, 4, 8]} />
        <Mat c={o.jacket} r={0.6} />
      </mesh>
      <mesh position={[side * 0.04, -0.52, 0.02]} castShadow>
        <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
        <Mat c={o.skin} r={0.65} />
      </mesh>
    </group>
  );

  return (
    <group ref={ref} userData={label ? { captureLabel: label } : {}}>
      <group ref={root} name="body">
        {leg(-1, legL)}
        {leg(1, legR)}
        <group ref={torso} position={[0, 0.95, 0]}>
          {/* Hips and jacket with padded 80s shoulders. */}
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.34, 0.16, 0.2]} />
            <Mat c={o.pants} r={0.85} />
          </mesh>
          <mesh position={[0, 0.33, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.26, 4, 10]} />
            <Mat c={o.shirt} r={0.7} />
          </mesh>
          <mesh position={[0, 0.36, -0.01]} scale={[1.18, 1, 1.05]} castShadow>
            <capsuleGeometry args={[0.165, 0.24, 4, 10]} />
            <Mat c={o.jacket} r={0.55} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.5, 0.09, 0.22]} />
            <Mat c={o.jacket} r={0.55} />
          </mesh>
          {arm(-1, armL)}
          {arm(1, armR)}
          {/* Neck, head, hair, shades. */}
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.055, 0.065, 0.1, 8]} />
            <Mat c={o.skin} r={0.65} />
          </mesh>
          <mesh position={[0, 0.76, 0.01]} scale={[0.9, 1.08, 0.95]} castShadow>
            <sphereGeometry args={[0.13, 16, 14]} />
            <Mat c={o.skin} r={0.6} />
          </mesh>
          <mesh position={[0, 0.82, -0.015]} scale={[0.98, o.longHair ? 1.05 : 0.8, 1.02]} castShadow>
            <sphereGeometry args={[0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
            <Mat c={o.hair} r={0.9} />
          </mesh>
          {o.longHair && (
            <mesh position={[0, 0.68, -0.08]} castShadow>
              <boxGeometry args={[0.24, 0.26, 0.08]} />
              <Mat c={o.hair} r={0.9} />
            </mesh>
          )}
          {o.shades ? (
            <mesh position={[0, 0.775, 0.115]}>
              <boxGeometry args={[0.2, 0.05, 0.03]} />
              <meshStandardMaterial color="#0d0d12" roughness={0.1} metalness={0.8} />
            </mesh>
          ) : (
            [-0.045, 0.045].map((x) => (
              <mesh key={x} position={[x, 0.78, 0.115]}>
                <sphereGeometry args={[0.016, 6, 6]} />
                <Mat c="#1a1410" r={0.3} />
              </mesh>
            ))
          )}
          {bag && (
            <mesh position={[0, 0.3, -0.24]} castShadow>
              <boxGeometry args={[0.42, 0.46, 0.22]} />
              <Mat c="#3d6b3a" r={0.9} />
            </mesh>
          )}
          {/* Role colour as a belt accent, so teams still read at a glance. */}
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.36, 0.04, 0.215]} />
            <Mat c={color} r={0.4} />
          </mesh>
        </group>
      </group>
      {showName && <NameTag name={name} color={color} />}
    </group>
  );
});
