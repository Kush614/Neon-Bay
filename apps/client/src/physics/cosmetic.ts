// Client-only cosmetic physics: shared state between knockable props, ambient traffic and
// pedestrians. None of it reaches the server, the agents or the ledger (README decisions).
import type { RapierRigidBody as RigidBody } from "@react-three/rapier";
import { remoteBuffers, vehicleBuffers } from "../net/connection.js";
import { useLocalStore } from "../store.js";
import { sfx } from "../audio/sound.js";

export interface XZ {
  x: number;
  z: number;
}

/** Something that moves through the street: used for braking and knock-downs. */
export interface Mover extends XZ {
  /** Velocity in m/s. */
  vx: number;
  vz: number;
  /** Rough radius in metres (a car is ~2.3, a person ~0.4). */
  radius: number;
  kind: "car" | "person";
}

/** Dynamic prop bodies, so walkers and dogs can nudge beach balls. */
export const propBodies: { body: RigidBody; kind: string }[] = [];

/** Ambient cars publish themselves here every frame (cleared by the traffic component). */
export const ambientCars: Mover[] = [];

const lastVehicle = new Map<string, { x: number; z: number; t: number; vx: number; vz: number }>();

/** Server-simulated cars, with velocities estimated from interpolated samples. */
export function serverCars(now = performance.now()): Mover[] {
  const out: Mover[] = [];
  for (const [id, buf] of vehicleBuffers) {
    const s = buf.sample(now);
    if (!s) continue;
    const prev = lastVehicle.get(id);
    let vx = 0;
    let vz = 0;
    if (prev && now - prev.t > 1) {
      const dt = (now - prev.t) / 1000;
      // Smooth the estimate: samples are interpolated, so raw differences jitter.
      vx = prev.vx + ((s.x - prev.x) / dt - prev.vx) * 0.3;
      vz = prev.vz + ((s.z - prev.z) / dt - prev.vz) * 0.3;
    }
    lastVehicle.set(id, { x: s.x, z: s.z, t: now, vx, vz });
    out.push({ x: s.x, z: s.z, vx, vz, radius: 2.3, kind: "car" });
  }
  return out;
}

/** Every human or agent player the client knows about (the local one included). */
export function players(now = performance.now()): XZ[] {
  const out: XZ[] = [];
  const me = useLocalStore.getState().position;
  out.push({ x: me.x, z: me.z });
  for (const buf of remoteBuffers.values()) {
    const s = buf.sample(now);
    if (s) out.push({ x: s.x, z: s.z });
  }
  return out;
}

/** Volume 0..1 for a sound at (x, z): full within 6 m of the listener, silent past 45 m. */
export function nearVolume(x: number, z: number): number {
  const me = useLocalStore.getState().position;
  const d = Math.hypot(me.x - x, me.z - z);
  return d <= 6 ? 1 : Math.max(0, 1 - (d - 6) / 39);
}

/** Rate-limited positional sounds so a pile-up doesn't machine-gun the speakers. */
const lastSound = new Map<string, number>();
export function soundAt(key: string, x: number, z: number, play: (vol: number) => void, gapMs = 400): void {
  const now = performance.now();
  if (now - (lastSound.get(key) ?? 0) < gapMs) return;
  const vol = nearVolume(x, z);
  if (vol <= 0) return;
  lastSound.set(key, now);
  play(vol);
}

export { sfx };

// Dev-only handle so end-to-end checks can measure the cosmetic simulation.
declare global {
  interface Window {
    __cosmetic?: { propBodies: typeof propBodies; ambientCars: typeof ambientCars };
  }
}
if (import.meta.env.DEV && typeof window !== "undefined") window.__cosmetic = { propBodies, ambientCars };
