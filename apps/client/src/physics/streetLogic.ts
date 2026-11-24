// Pure rules for street NPC physics, kept free of three/rapier so they can be unit-tested.

export interface Vec2 {
  x: number;
  z: number;
}

/** How far ahead a car looks, how wide its lane check is, and where it stops short. */
export const LOOK_AHEAD = 14;
/** Car half-width (1 m) plus a person (0.3 m): anything further to the side can't be hit. */
export const LANE_HALF_WIDTH = 1.3;
export const STOP_GAP = 4.5;

/**
 * The speed a car should aim for given what is in front of it. `dir` is its unit heading.
 * Anything within the lane strip ahead slows it linearly, down to a stop at STOP_GAP metres.
 */
export function brakeTarget(pos: Vec2, dir: Vec2, cruise: number, obstacles: readonly Vec2[]): { speed: number; blockedBy: number } {
  let speed = cruise;
  let blockedBy = -1;
  obstacles.forEach((o, i) => {
    const rx = o.x - pos.x;
    const rz = o.z - pos.z;
    const ahead = rx * dir.x + rz * dir.z;
    if (ahead <= 0 || ahead > LOOK_AHEAD) return;
    const side = Math.abs(rx * dir.z - rz * dir.x);
    if (side > LANE_HALF_WIDTH) return;
    const s = ahead <= STOP_GAP ? 0 : (cruise * (ahead - STOP_GAP)) / (LOOK_AHEAD - STOP_GAP);
    if (s < speed) {
      speed = s;
      blockedBy = i;
    }
  });
  return { speed, blockedBy };
}

/** Ease the current speed toward the target: brake hard, accelerate gently. */
export function approachSpeed(v: number, target: number, dt: number): number {
  const rate = target < v ? 14 : 4; // m/s^2
  return v + Math.sign(target - v) * Math.min(Math.abs(target - v), rate * dt);
}

export interface Hazard extends Vec2 {
  vx: number;
  vz: number;
  radius: number;
}

/** Below this a car just nudges people; above it, they go down. */
export const KNOCK_SPEED = 3;

/**
 * If a moving hazard hits a pedestrian at (p), the velocity the pedestrian is thrown at:
 * mostly the car's direction of travel, plus a push away from its centre. Null if no hit.
 */
export function knockVelocity(p: Vec2, hazards: readonly Hazard[], personRadius = 0.4): Vec2 | null {
  for (const h of hazards) {
    const speed = Math.hypot(h.vx, h.vz);
    if (speed < KNOCK_SPEED) continue;
    const dx = p.x - h.x;
    const dz = p.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d > h.radius + personRadius) continue;
    const ax = d > 1e-3 ? dx / d : 0;
    const az = d > 1e-3 ? dz / d : 0;
    const throwSpeed = Math.min(9, speed * 0.6);
    return { x: (h.vx / speed) * throwSpeed + ax * 2, z: (h.vz / speed) * throwSpeed + az * 2 };
  }
  return null;
}

/** Push a pedestrian out of a player's personal space: the offset to add this frame. */
export function sidestep(p: Vec2, others: readonly Vec2[], space = 0.9): Vec2 {
  let x = 0;
  let z = 0;
  for (const o of others) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= space || d < 1e-4) continue;
    x += (dx / d) * (space - d);
    z += (dz / d) * (space - d);
  }
  return { x, z };
}
