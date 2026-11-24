// Character movement shared by the client (prediction) and server (authority).
// Takes a Rapier module instance so it works with @react-three/rapier and rapier3d-compat alike.
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import {
  BAG_SPEED_FACTOR,
  CHARACTER_CENTER_Y,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
  GRAVITY,
  MAX_FALL_SPEED,
  RUN_SPEED,
  WALK_SPEED,
} from "./constants.js";
import { staticColliders, type StaticBox } from "./world.js";

export type Rapier = typeof RAPIER_NS;
type World = RAPIER_NS.World;

/** One frame of player movement intent, in world space. */
export interface MoveInput {
  /** Desired direction on the ground plane; normalised if longer than 1. */
  x: number;
  z: number;
  run: boolean;
}

export const NO_INPUT: MoveInput = { x: 0, z: 0, run: false };

/**
 * Rapier interaction groups (high 16 bits: memberships, low 16 bits: filter).
 * Everything the server simulates keeps Rapier's default (all groups). Client-only cosmetic
 * bodies (knockable props, ambient traffic) are members of COSMETIC only, and the client's
 * movement prediction queries with PREDICTION_QUERY, which skips them. So cosmetic physics can
 * never make the predicted player drift from the server's authoritative one.
 */
export const GROUP_GAMEPLAY = 0x0001;
export const GROUP_COSMETIC = 0x0002;
export const interactionGroups = (memberships: number, filter: number): number => ((memberships & 0xffff) << 16) | (filter & 0xffff);
export const COSMETIC_GROUPS = interactionGroups(GROUP_COSMETIC, 0xffff);
export const PREDICTION_QUERY = interactionGroups(GROUP_GAMEPLAY, 0xffff & ~GROUP_COSMETIC);

/** Remove colliders made by addStaticColliders, skipping any the current world no longer owns. */
export function removeColliders(world: World, colliders: RAPIER_NS.Collider[]): void {
  for (const c of colliders) {
    if (world.getCollider(c.handle)) world.removeCollider(c, false);
  }
}

/** Add every static collider from the world layout. Returns the colliders so callers can remove them. */
export function addStaticColliders(rapier: Rapier, world: World, boxes: StaticBox[] = staticColliders()): RAPIER_NS.Collider[] {
  return boxes.map((b) =>
    world.createCollider(
      rapier.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setTranslation(b.center.x, b.center.y, b.center.z),
    ),
  );
}

export function planarSpeed(input: MoveInput, carryingBag: boolean): number {
  const len = Math.hypot(input.x, input.z);
  if (len < 1e-3) return 0;
  const base = input.run ? RUN_SPEED : WALK_SPEED;
  return base * Math.min(1, len) * (carryingBag ? BAG_SPEED_FACTOR : 1);
}

export class CharacterBody {
  readonly body: RAPIER_NS.RigidBody;
  readonly collider: RAPIER_NS.Collider;
  private readonly controller: RAPIER_NS.KinematicCharacterController;
  private verticalVelocity = 0;
  heading = 0;
  grounded = false;
  carryingBag = false;

  constructor(
    rapier: Rapier,
    private readonly world: World,
    spawn: { x: number; z: number },
    /** Collision query filter for movement; the client passes PREDICTION_QUERY. */
    private readonly queryGroups?: number,
  ) {
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, CHARACTER_CENTER_Y + 0.05, spawn.z),
    );
    this.collider = world.createCollider(rapier.ColliderDesc.capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS), this.body);
    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(0.35, 0.2, false);
    this.controller.enableSnapToGround(0.4);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  }

  /** Move by one step of `dt` seconds. Call before the world steps. */
  step(input: MoveInput, dt: number): void {
    const len = Math.hypot(input.x, input.z);
    const speed = planarSpeed(input, this.carryingBag);
    const dx = len > 1e-3 ? (input.x / len) * speed * dt : 0;
    const dz = len > 1e-3 ? (input.z / len) * speed * dt : 0;
    if (len > 1e-3) this.heading = Math.atan2(input.x, input.z);

    this.verticalVelocity = Math.max(-MAX_FALL_SPEED, this.verticalVelocity + GRAVITY * dt);
    const dy = this.verticalVelocity * dt;

    this.controller.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz }, undefined, this.queryGroups);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded) this.verticalVelocity = 0;

    const p = this.body.translation();
    this.body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
  }

  /** Move instantly so the feet are at (x, z), keeping the current height. Bypasses collision. */
  teleport(to: { x: number; z: number }): void {
    const t = this.body.translation();
    this.body.setTranslation({ x: to.x, y: t.y, z: to.z }, true);
    this.body.setNextKinematicTranslation({ x: to.x, y: t.y, z: to.z });
  }

  /** Centre of the capsule. */
  position(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /** Position of the feet, which is what game state reports. */
  feet(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y - CHARACTER_CENTER_Y, z: t.z };
  }

  /**
   * Remove the body and controller. Safe to call after the world was freed and replaced
   * (as @react-three/rapier does on unmount): only handles the current world still owns are removed.
   */
  dispose(): void {
    this.world.removeCharacterController(this.controller);
    if (this.world.getRigidBody(this.body.handle)) this.world.removeRigidBody(this.body);
  }
}
