// Authoritative movement simulation. No networking here so it can be unit-tested directly.
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { BAG_SPEED_FACTOR, RUN_SPEED, type InputMessage, type PlayerEvent, type Vec3 } from "@neon-bay/shared";
import { addStaticColliders, CharacterBody, NO_INPUT, type MoveInput, type Rapier } from "@neon-bay/shared/physics";

/** Slack on the per-step speed check, for controller skin offsets and float error. */
const SPEED_TOLERANCE = 1.1;
const SPEED_EPSILON = 0.01;
/** Distance at which a path waypoint counts as reached. */
const WAYPOINT_RADIUS = 0.6;
/** A path that makes no progress for this long is abandoned. */
const STUCK_SECONDS = 3;
const STUCK_PROGRESS = 0.3;

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
  /** Count of steps where the speed check rejected the move. */
  speedViolations: number;
  path: ActivePath | null;
}

export interface PlayerSnapshot {
  position: Vec3;
  heading: number;
  moving: boolean;
  running: boolean;
  lastSeq: number;
}

export class Simulation {
  readonly world: RAPIER_NS.World;
  private readonly players = new Map<string, SimPlayer>();
  private events: { id: string; event: PlayerEvent }[] = [];

  constructor(private readonly rapier: Rapier) {
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    addStaticColliders(rapier, this.world);
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
    });
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.body.dispose();
    this.players.delete(id);
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  /**
   * Store the latest movement intent. Out-of-order input is dropped, and the direction is
   * clamped to length 1 so no input can exceed run speed.
   */
  setInput(id: string, msg: InputMessage): boolean {
    const p = this.players.get(id);
    if (!p || msg.seq <= p.lastSeq) return false;
    const len = Math.hypot(msg.x, msg.z);
    const scale = len > 1 ? 1 / len : 1;
    p.input = { x: msg.x * scale, z: msg.z * scale, run: msg.run };
    p.lastSeq = msg.seq;
    // Steering by hand cancels any path the player was following.
    if (p.path && len > 1e-3) p.path = null;
    return true;
  }

  /** Follow a navmesh path. The character is steered with ordinary movement input each step. */
  setPath(id: string, points: Vec3[], target: string, run: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.path = { points, index: 0, target, run, bestRemaining: Infinity, sinceProgress: 0 };
  }

  /** Stop following a path and stand still. */
  stop(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.path = null;
    p.input = NO_INPUT;
  }

  isFollowingPath(id: string): boolean {
    return !!this.players.get(id)?.path;
  }

  /** Events since the last drain (arrivals, failed paths). */
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
    p.input = { x: dx / d, z: dz / d, run: path.run };
  }

  setCarryingBag(id: string, carrying: boolean): void {
    const p = this.players.get(id);
    if (p) p.body.carryingBag = carrying;
  }

  /** Advance one sub-step: move every character, validate its speed, then step the world. */
  step(dt: number): void {
    for (const [id, p] of this.players) {
      this.steer(id, p, dt);
      const before = p.body.position();
      p.body.step(p.input, dt);
      const next = p.body.body.nextTranslation();
      const horizontal = Math.hypot(next.x - before.x, next.z - before.z);
      const max = RUN_SPEED * (p.body.carryingBag ? BAG_SPEED_FACTOR : 1) * dt * SPEED_TOLERANCE + SPEED_EPSILON;
      if (horizontal > max) {
        // Reject the move: keep the vertical component, drop the horizontal one.
        p.body.body.setNextKinematicTranslation({ x: before.x, y: next.y, z: before.z });
        p.speedViolations++;
      }
    }
    this.world.step();
  }

  snapshot(id: string): PlayerSnapshot | null {
    const p = this.players.get(id);
    if (!p) return null;
    const moving = Math.hypot(p.input.x, p.input.z) > 1e-3;
    return { position: p.body.feet(), heading: p.body.heading, moving, running: moving && p.input.run, lastSeq: p.lastSeq };
  }

  speedViolations(id: string): number {
    return this.players.get(id)?.speedViolations ?? 0;
  }

  /** Teleport, bypassing the speed check. Server-internal only (spawns, arrests, tests). */
  teleport(id: string, to: { x: number; z: number }): void {
    this.players.get(id)?.body.teleport(to);
  }

  dispose(): void {
    for (const id of [...this.players.keys()]) this.removePlayer(id);
    this.world.free();
  }
}
