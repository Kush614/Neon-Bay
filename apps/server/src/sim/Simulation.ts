// Authoritative movement simulation: characters, vehicles and path following.
// No networking here so it can be unit-tested and run headless.
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import {
  BAG_SPEED_FACTOR,
  CAR_ENTER_RADIUS,
  CAR_HALF_EXTENTS,
  CAR_MAX_SPEED,
  CARS,
  RUN_SPEED,
  type InputMessage,
  type PlayerEvent,
  type Vec3,
} from "@neon-bay/shared";
import { addStaticColliders, CharacterBody, NO_INPUT, type MoveInput, type Rapier } from "@neon-bay/shared/physics";
import { Vehicle, type DriveInput } from "./vehicles.js";

/** Slack on the per-step speed check, for controller skin offsets and float error. */
const SPEED_TOLERANCE = 1.1;
const SPEED_EPSILON = 0.01;
const WAYPOINT_RADIUS = 0.6;
const STUCK_SECONDS = 3;
const STUCK_PROGRESS = 0.3;
/** After this long without progress, sidestep to slide around a car or another player. */
const SIDESTEP_AFTER = 0.7;
const SIDESTEP_ANGLE = (70 * Math.PI) / 180;

interface ActivePath {
  points: Vec3[];
  index: number;
  target: string;
  run: boolean;
  bestRemaining: number;
  sinceProgress: number;
}

interface SimPlayer {
  body: CharacterBody;
  input: MoveInput;
  lastSeq: number;
  speedViolations: number;
  path: ActivePath | null;
  vehicleId: string | null;
}

export interface PlayerSnapshot {
  position: Vec3;
  heading: number;
  moving: boolean;
  running: boolean;
  lastSeq: number;
  vehicleId: string | null;
}

export interface VehicleSnapshot {
  id: string;
  position: Vec3;
  heading: number;
  speed: number;
  driverId: string | null;
}

export class Simulation {
  readonly world: RAPIER_NS.World;
  private readonly players = new Map<string, SimPlayer>();
  readonly vehicles = new Map<string, Vehicle>();
  private events: { id: string; event: PlayerEvent }[] = [];

  constructor(private readonly rapier: Rapier) {
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    addStaticColliders(rapier, this.world);
    for (const spec of CARS) this.vehicles.set(spec.id, new Vehicle(rapier, this.world, spec));
    this.world.step();
  }

  addPlayer(id: string, spawn: { x: number; z: number }): void {
    this.removePlayer(id);
    this.players.set(id, {
      body: new CharacterBody(this.rapier, this.world, spawn),
      input: NO_INPUT,
      lastSeq: -1,
      speedViolations: 0,
      path: null,
      vehicleId: null,
    });
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.vehicleId) this.exitVehicle(id);
    p.body.dispose();
    this.players.delete(id);
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  /**
   * Store the latest movement intent. Out-of-order input is dropped, and the direction is
   * clamped to length 1 so no input can exceed run speed. In a car, the same message drives it.
   */
  setInput(id: string, msg: InputMessage): boolean {
    const p = this.players.get(id);
    if (!p || msg.seq <= p.lastSeq) return false;
    p.lastSeq = msg.seq;
    if (p.vehicleId) {
      const v = this.vehicles.get(p.vehicleId)!;
      const drive: DriveInput = { throttle: msg.throttle ?? 0, steer: msg.steer ?? 0 };
      // Zero input while the autopilot drives leaves it alone; anything else takes over.
      if (!v.route || drive.throttle !== 0 || drive.steer !== 0) v.drive(drive);
      return true;
    }
    const len = Math.hypot(msg.x, msg.z);
    const scale = len > 1 ? 1 / len : 1;
    p.input = { x: msg.x * scale, z: msg.z * scale, run: msg.run };
    // Steering by hand cancels any path the player was following.
    if (p.path && len > 1e-3) p.path = null;
    return true;
  }

  setPath(id: string, points: Vec3[], target: string, run: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.path = { points, index: 0, target, run, bestRemaining: Infinity, sinceProgress: 0 };
  }

  stop(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.path = null;
    p.input = NO_INPUT;
    if (p.vehicleId) this.vehicles.get(p.vehicleId)?.clearRoute();
  }

  isFollowingPath(id: string): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    return p.vehicleId ? !!this.vehicles.get(p.vehicleId)?.route : !!p.path;
  }

  setCarryingBag(id: string, carrying: boolean): void {
    const p = this.players.get(id);
    if (p) p.body.carryingBag = carrying;
  }

  // ---- vehicles -----------------------------------------------------------

  vehicleOf(id: string): Vehicle | null {
    const vid = this.players.get(id)?.vehicleId;
    return vid ? (this.vehicles.get(vid) ?? null) : null;
  }

  /** Nearest vehicle with no driver within reach of the player, or null. */
  nearestFreeVehicle(id: string): Vehicle | null {
    const p = this.players.get(id);
    if (!p) return null;
    const f = p.body.feet();
    let best: Vehicle | null = null;
    let d = CAR_ENTER_RADIUS;
    for (const v of this.vehicles.values()) {
      if (v.driverId) continue;
      const vp = v.position();
      const vd = Math.hypot(vp.x - f.x, vp.z - f.z) - CAR_HALF_EXTENTS.x;
      if (vd <= d) {
        d = vd;
        best = v;
      }
    }
    return best;
  }

  enterVehicle(id: string, vehicleId: string): boolean {
    const p = this.players.get(id);
    const v = this.vehicles.get(vehicleId);
    if (!p || !v || v.driverId || p.vehicleId) return false;
    v.driverId = id;
    p.vehicleId = vehicleId;
    p.path = null;
    p.input = NO_INPUT;
    p.body.collider.setEnabled(false);
    return true;
  }

  /** Leave the car on the driver's side; falls back to the passenger side if that is blocked. */
  exitVehicle(id: string): boolean {
    const p = this.players.get(id);
    if (!p?.vehicleId) return false;
    const v = this.vehicles.get(p.vehicleId)!;
    v.driverId = null;
    v.clearRoute();
    v.speed = 0;
    p.vehicleId = null;
    const c = v.position();
    const rightX = -Math.cos(v.heading);
    const rightZ = Math.sin(v.heading);
    const off = CAR_HALF_EXTENTS.x + 1;
    const candidates = [
      { x: c.x - rightX * off, z: c.z - rightZ * off },
      { x: c.x + rightX * off, z: c.z + rightZ * off },
      { x: c.x, z: c.z + Math.cos(v.heading) * (CAR_HALF_EXTENTS.z + 1) },
    ];
    const spot = candidates.find((s) => this.isClear(s)) ?? candidates[0]!;
    p.body.teleport(spot);
    p.body.collider.setEnabled(true);
    return true;
  }

  private isClear(s: { x: number; z: number }): boolean {
    const shape = new this.rapier.Capsule(0.5, 0.4);
    let hit = false;
    this.world.intersectionsWithShape({ x: s.x, y: 0.95, z: s.z }, { x: 0, y: 0, z: 0, w: 1 }, shape, () => {
      hit = true;
      return false;
    });
    return !hit;
  }

  setVehicleRoute(id: string, points: { x: number; z: number }[], target: string): boolean {
    const v = this.vehicleOf(id);
    if (!v) return false;
    v.setRoute(points, target);
    return true;
  }

  vehicleSnapshots(): VehicleSnapshot[] {
    return [...this.vehicles.values()].map((v) => ({ id: v.id, position: v.position(), heading: v.heading, speed: v.speed, driverId: v.driverId }));
  }

  // ---- stepping -----------------------------------------------------------

  drainEvents(): { id: string; event: PlayerEvent }[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private steer(id: string, p: SimPlayer, dt: number): void {
    const path = p.path;
    if (!path) return;
    const feet = p.body.feet();
    let wp = path.points[path.index]!;
    while (Math.hypot(wp.x - feet.x, wp.z - feet.z) < WAYPOINT_RADIUS) {
      path.index++;
      if (path.index >= path.points.length) {
        p.path = null;
        p.input = NO_INPUT;
        this.events.push({ id, event: { type: "arrived", target: path.target } });
        return;
      }
      wp = path.points[path.index]!;
    }
    const end = path.points[path.points.length - 1]!;
    const remaining = Math.hypot(end.x - feet.x, end.z - feet.z);
    if (remaining < path.bestRemaining - STUCK_PROGRESS) {
      path.bestRemaining = remaining;
      path.sinceProgress = 0;
    } else if ((path.sinceProgress += dt) > STUCK_SECONDS) {
      p.path = null;
      p.input = NO_INPUT;
      this.events.push({ id, event: { type: "path_failed", target: path.target, reason: "blocked: no progress for 3 s" } });
      return;
    }
    const dx = wp.x - feet.x;
    const dz = wp.z - feet.z;
    const d = Math.hypot(dx, dz);
    let x = dx / d;
    let z = dz / d;
    if (path.sinceProgress > SIDESTEP_AFTER) {
      // Alternate sides so a head-on block against a box gets a sliding component.
      const a = (Math.floor(path.sinceProgress / SIDESTEP_AFTER) % 2 ? 1 : -1) * SIDESTEP_ANGLE;
      [x, z] = [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
    }
    p.input = { x, z, run: path.run };
  }

  /** Advance one sub-step: steer, move characters and cars, validate speeds, then step the world. */
  step(dt: number): void {
    for (const v of this.vehicles.values()) {
      const before = v.position();
      const ev = v.step(dt);
      if (ev && v.driverId) {
        this.events.push({
          id: v.driverId,
          event: ev.type === "arrived" ? { type: "arrived", target: ev.target } : { type: "path_failed", target: ev.target, reason: ev.reason },
        });
      }
      const next = v.body.nextTranslation();
      if (Math.hypot(next.x - before.x, next.z - before.z) > CAR_MAX_SPEED * dt * SPEED_TOLERANCE + SPEED_EPSILON) {
        v.body.setNextKinematicTranslation({ x: before.x, y: next.y, z: before.z });
        v.speed = 0;
      }
    }
    for (const [id, p] of this.players) {
      if (p.vehicleId) continue;
      this.steer(id, p, dt);
      const before = p.body.position();
      p.body.step(p.input, dt);
      const next = p.body.body.nextTranslation();
      const horizontal = Math.hypot(next.x - before.x, next.z - before.z);
      const max = RUN_SPEED * (p.body.carryingBag ? BAG_SPEED_FACTOR : 1) * dt * SPEED_TOLERANCE + SPEED_EPSILON;
      if (horizontal > max) {
        p.body.body.setNextKinematicTranslation({ x: before.x, y: next.y, z: before.z });
        p.speedViolations++;
      }
    }
    this.world.step();
    // Drivers ride at their car's position.
    for (const p of this.players.values()) {
      if (!p.vehicleId) continue;
      const v = this.vehicles.get(p.vehicleId)!;
      const c = v.position();
      p.body.teleport(c);
      p.body.heading = v.heading;
    }
  }

  snapshot(id: string): PlayerSnapshot | null {
    const p = this.players.get(id);
    if (!p) return null;
    const v = p.vehicleId ? this.vehicles.get(p.vehicleId) : null;
    const moving = v ? Math.abs(v.speed) > 0.3 : Math.hypot(p.input.x, p.input.z) > 1e-3;
    return {
      position: v ? v.position() : p.body.feet(),
      heading: p.body.heading,
      moving,
      running: !v && moving && p.input.run,
      lastSeq: p.lastSeq,
      vehicleId: p.vehicleId,
    };
  }

  speedViolations(id: string): number {
    return this.players.get(id)?.speedViolations ?? 0;
  }

  teleport(id: string, to: { x: number; z: number }): void {
    this.players.get(id)?.body.teleport(to);
  }

  dispose(): void {
    for (const id of [...this.players.keys()]) this.removePlayer(id);
    for (const v of this.vehicles.values()) v.dispose();
    this.world.free();
  }
}
