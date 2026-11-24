// Arcade cars (SPEC.md section 9): kinematic, no gears, damage or tyre simulation.
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import {
  CAR_ACCEL,
  CAR_BRAKE,
  CAR_DRAG,
  CAR_HALF_EXTENTS,
  CAR_MAX_REVERSE,
  CAR_MAX_SPEED,
  CAR_STEER_RATE,
  ROADS,
  type CarSpec,
  type RoadNode,
} from "@neon-bay/shared";
import type { Rapier } from "@neon-bay/shared/physics";

export interface DriveInput {
  /** -1 (brake / reverse) to 1 (full throttle). */
  throttle: number;
  /** -1 (left) to 1 (right). */
  steer: number;
}

/** The world is flat, so the car's box rides above the ground like a body on wheels. */
const CLEARANCE = 0.3;
const ARRIVE_RADIUS = 4;
const WAYPOINT_RADIUS = 5;
const STUCK_SECONDS = 4;

interface AutoRoute {
  points: { x: number; z: number }[];
  index: number;
  target: string;
  bestRemaining: number;
  sinceProgress: number;
  /** Seconds left of a reverse-and-turn manoeuvre to get unstuck. */
  reversing: number;
}

/** Below this speed a short move is not treated as a collision (skin offsets dominate). */
const BUMP_MIN_SPEED = 3;
const UNSTICK_AFTER = 1.5;
const UNSTICK_SECONDS = 1.2;

export type VehicleEvent = { type: "arrived"; target: string } | { type: "route_failed"; target: string; reason: string };

export class Vehicle {
  readonly body: RAPIER_NS.RigidBody;
  readonly collider: RAPIER_NS.Collider;
  private readonly controller: RAPIER_NS.KinematicCharacterController;
  heading: number;
  speed = 0;
  driverId: string | null = null;
  input: DriveInput = { throttle: 0, steer: 0 };
  route: AutoRoute | null = null;

  constructor(
    rapier: Rapier,
    private readonly world: RAPIER_NS.World,
    readonly spec: CarSpec,
  ) {
    this.heading = spec.spawn.heading;
    this.body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spec.spawn.x, 0, spec.spawn.z));
    this.body.setRotation(yawQuat(this.heading), true);
    const halfY = CAR_HALF_EXTENTS.y - CLEARANCE / 2;
    this.collider = world.createCollider(
      rapier.ColliderDesc.cuboid(CAR_HALF_EXTENTS.x, halfY, CAR_HALF_EXTENTS.z).setTranslation(0, CLEARANCE + halfY, 0),
      this.body,
    );
    this.controller = world.createCharacterController(0.05);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
  }

  get id(): string {
    return this.spec.id;
  }

  /** Ground point under the car's centre. */
  position(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /** Autopilot along road waypoints toward `target`. */
  setRoute(points: { x: number; z: number }[], target: string): void {
    const p = this.position();
    // Skip a first node the car has already passed, so it doesn't U-turn to reach it.
    let pts = points;
    if (pts.length >= 2) {
      const [a, b] = [pts[0]!, pts[1]!];
      if ((a.x - p.x) * (b.x - a.x) + (a.z - p.z) * (b.z - a.z) < 0) pts = pts.slice(1);
    }
    this.route = { points: pts, index: 0, target, bestRemaining: Infinity, sinceProgress: 0, reversing: 0 };
  }

  clearRoute(): void {
    this.route = null;
    this.input = { throttle: 0, steer: 0 };
  }

  private autopilot(dt: number): VehicleEvent | null {
    const r = this.route;
    if (!r) return null;
    const p = this.position();
    let wp = r.points[r.index]!;
    const last = r.index === r.points.length - 1;
    while (Math.hypot(wp.x - p.x, wp.z - p.z) < (r.index === r.points.length - 1 ? ARRIVE_RADIUS : WAYPOINT_RADIUS)) {
      r.index++;
      if (r.index >= r.points.length) {
        this.clearRoute();
        return { type: "arrived", target: r.target };
      }
      wp = r.points[r.index]!;
    }
    const end = r.points[r.points.length - 1]!;
    const remaining = Math.hypot(end.x - p.x, end.z - p.z);
    const desired = Math.atan2(wp.x - p.x, wp.z - p.z);
    const diff = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
    if (remaining < r.bestRemaining - 0.5) {
      r.bestRemaining = remaining;
      r.sinceProgress = 0;
    } else {
      r.sinceProgress += dt;
      if (r.sinceProgress > STUCK_SECONDS * 3) {
        this.clearRoute();
        return { type: "route_failed", target: r.target, reason: "vehicle blocked" };
      }
      if (r.sinceProgress > UNSTICK_AFTER && r.reversing <= 0) r.reversing = UNSTICK_SECONDS;
    }
    if (r.reversing > 0) {
      // Back up while steering the opposite way, which swings the nose toward the waypoint.
      r.reversing -= dt;
      this.input = { throttle: -1, steer: diff > 0 ? 1 : -1 };
      return null;
    }
    const dist = Math.hypot(wp.x - p.x, wp.z - p.z);
    // Positive diff means the target is anticlockwise from the heading when viewed from above.
    const steer = Math.max(-1, Math.min(1, -diff * 2));
    const slow = last && dist < 15 ? 0.4 : 1;
    const throttle = Math.abs(diff) > 1.2 ? 0.25 : slow;
    this.input = { throttle, steer };
    return null;
  }

  /** One fixed step. Call before the world steps. */
  step(dt: number): VehicleEvent | null {
    const event = this.autopilot(dt);
    const { throttle, steer } = this.input;
    if (throttle > 0) this.speed += throttle * CAR_ACCEL * dt;
    else if (throttle < 0) this.speed += throttle * (this.speed > 0 ? CAR_BRAKE : CAR_ACCEL) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), CAR_DRAG * dt);
    this.speed = Math.max(-CAR_MAX_REVERSE, Math.min(CAR_MAX_SPEED, this.speed));
    // Steering authority grows with speed, and reverses when backing up.
    const authority = Math.max(-1, Math.min(1, this.speed / 6));
    // Steering right (+1) turns clockwise from above, which lowers the heading angle.
    this.heading -= steer * CAR_STEER_RATE * authority * dt;

    const want = { x: Math.sin(this.heading) * this.speed * dt, y: 0, z: Math.cos(this.heading) * this.speed * dt };
    this.body.setRotation(yawQuat(this.heading), true);
    this.controller.computeColliderMovement(this.collider, want);
    const m = this.controller.computedMovement();
    const planned = Math.hypot(want.x, want.z);
    const actual = Math.hypot(m.x, m.z);
    // Hitting something scrubs speed: arcade bump, no damage.
    if (Math.abs(this.speed) > BUMP_MIN_SPEED && actual < planned * 0.5) this.speed *= 0.5;
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y, z: t.z + m.z });
    return event;
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
    if (this.world.getRigidBody(this.body.handle)) this.world.removeRigidBody(this.body);
  }
}

function yawQuat(heading: number) {
  return { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
}

// ---------------------------------------------------------------------------
// Road graph routing.

const nodeById = new Map(ROADS.nodes.map((n) => [n.id, n]));
const adjacency = new Map<string, string[]>();
for (const [a, b] of ROADS.edges) {
  (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
}

export function nearestRoadNode(p: { x: number; z: number }): RoadNode {
  let best = ROADS.nodes[0]!;
  let d = Infinity;
  for (const n of ROADS.nodes) {
    const nd = Math.hypot(n.x - p.x, n.z - p.z);
    if (nd < d) {
      d = nd;
      best = n;
    }
  }
  return best;
}

/** A* over the road graph from the node nearest `from` to the node nearest `to`. */
export function roadRoute(from: { x: number; z: number }, to: { x: number; z: number }): RoadNode[] {
  const start = nearestRoadNode(from);
  const goal = nearestRoadNode(to);
  const h = (n: RoadNode) => Math.hypot(n.x - goal.x, n.z - goal.z);
  const g = new Map<string, number>([[start.id, 0]]);
  const came = new Map<string, string>();
  const open = new Set([start.id]);
  while (open.size) {
    let cur = "";
    let best = Infinity;
    for (const id of open) {
      const f = g.get(id)! + h(nodeById.get(id)!);
      if (f < best) {
        best = f;
        cur = id;
      }
    }
    if (cur === goal.id) break;
    open.delete(cur);
    const cn = nodeById.get(cur)!;
    for (const nb of adjacency.get(cur) ?? []) {
      const nn = nodeById.get(nb)!;
      const cost = g.get(cur)! + Math.hypot(nn.x - cn.x, nn.z - cn.z);
      if (cost < (g.get(nb) ?? Infinity)) {
        g.set(nb, cost);
        came.set(nb, cur);
        open.add(nb);
      }
    }
  }
  const path: RoadNode[] = [goal];
  let k = goal.id;
  while (came.has(k)) {
    k = came.get(k)!;
    path.unshift(nodeById.get(k)!);
  }
  return path[0]!.id === start.id ? path : [goal];
}
