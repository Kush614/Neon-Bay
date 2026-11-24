import { useFrame, useThree } from "@react-three/fiber";
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import { Vector3, type Group } from "three";
import { spawnPoint } from "@neon-bay/shared";
import { CharacterBody, PREDICTION_QUERY, type MoveInput } from "@neon-bay/shared/physics";
import { driveAxes, installKeyboard, moveAxes } from "../input/keyboard.js";
import { connect, localServerState, sendInput, useNetStore, vehicleBuffers } from "../net/connection.js";
import { CAPTURE } from "../capture/mode.js";
import { useLocalStore } from "../store.js";
import { Character } from "./Character.js";

const CAMERA_DISTANCE = 7;
const CAMERA_HEIGHT = 1.6; // look-at height above the feet
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.1;
/** `?cam=overview` swaps the follow camera for a fixed aerial view of the whole layout (debug). */
const CAM = new URLSearchParams(window.location.search).get("cam");
/** `?cam=x,y,z,lookX,lookY,lookZ` pins the camera (debug screenshots). */
const PINNED = CAM && CAM.includes(",") ? CAM.split(",").map(Number) : null;
const OVERVIEW = CAM === "overview" || PINNED !== null;
const VIEW = PINNED && PINNED.length === 6 ? PINNED : [-60, 260, 260, 130, 0, 0];

// Reconciliation tuning.
const SNAP_DISTANCE = 4; // beyond this, jump straight to the server position
const DEADZONE_MOVING = 0.35;
const DEADZONE_IDLE = 0.02;
const CORRECTION_RATE = 0.25; // fraction of the error removed per server update
const IDLE_HEARTBEAT_MS = 1000;

/**
 * The local player. Predicts movement with the same controller the server runs, sends
 * input every physics step, and reconciles toward the authoritative position by input sequence.
 */
export function LocalPlayer() {
  const { rapier, world } = useRapier();
  const { camera, gl } = useThree();
  const body = useRef<CharacterBody | null>(null);
  const model = useRef<Group>(null);
  // Start looking south down Second Street, toward the cross street that leads to the beach.
  const yaw = useRef(Math.PI + 0.25);
  const pitch = useRef(0.3);
  const lastStore = useRef(0);
  const lookAt = useRef(new Vector3());

  const seq = useRef(0);
  const lastSent = useRef<{ input: MoveInput; at: number } | null>(null);
  const history = useRef(new Map<number, { x: number; z: number }>());
  const lastReconciled = useRef(0);
  const spawned = useRef(false);
  const currentInput = useRef<MoveInput>({ x: 0, z: 0, run: false });
  const wasDriving = useRef(false);
  const lastDrive = useRef<{ throttle: number; steer: number; at: number } | null>(null);

  useEffect(() => installKeyboard(), []);
  useEffect(() => {
    void connect();
  }, []);

  useEffect(() => {
    const c = new CharacterBody(rapier, world, spawnPoint("nightclub", 0), PREDICTION_QUERY);
    c.heading = Math.atan2(-Math.sin(yaw.current), -Math.cos(yaw.current));
    body.current = c;
    spawned.current = false;
    return () => {
      c.dispose();
      body.current = null;
    };
  }, [rapier, world]);

  // Mouse look: click to lock the pointer; drag also works without the lock.
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el && !dragging) return;
      yaw.current -= e.movementX * 0.0035;
      pitch.current = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch.current + e.movementY * 0.0025));
    };
    const onDown = () => {
      dragging = true;
      el.requestPointerLock?.()?.catch?.(() => {});
    };
    const onUp = () => (dragging = false);
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
    };
  }, [gl]);

  useBeforePhysicsStep(() => {
    const c = body.current;
    if (!c) return;
    const driving = !!localServerState.player?.vehicleId;
    if (driving !== wasDriving.current) {
      wasDriving.current = driving;
      // In a car the server moves us; our capsule must not block the car's collider.
      c.collider.setEnabled(!driving);
      if (!driving && localServerState.player) {
        c.teleport(localServerState.player.position);
        history.current.clear();
      }
    }
    if (driving) {
      if (useNetStore.getState().status !== "connected") return;
      const { throttle, steer } = driveAxes();
      const now = performance.now();
      const prev = lastDrive.current;
      const changed = !prev || prev.throttle !== throttle || prev.steer !== steer;
      if (changed || throttle !== 0 || steer !== 0 || now - (prev?.at ?? 0) > IDLE_HEARTBEAT_MS) {
        seq.current++;
        sendInput({ seq: seq.current, x: 0, z: 0, run: false, throttle, steer });
        lastDrive.current = { throttle, steer, at: now };
      }
      return;
    }
    const { forward, right, run } = moveAxes();
    // Camera-relative axes on the ground plane, normalised so diagonals are not faster.
    const fx = -Math.sin(yaw.current);
    const fz = -Math.cos(yaw.current);
    const rx = Math.cos(yaw.current);
    const rz = -Math.sin(yaw.current);
    let x = fx * forward + rx * right;
    let z = fz * forward + rz * right;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const input: MoveInput = { x, z, run };
    currentInput.current = input;
    c.step(input, 1 / 60);

    if (useNetStore.getState().status !== "connected") return;
    const now = performance.now();
    const prev = lastSent.current;
    const moving = len > 1e-3;
    const changed = !prev || prev.input.x !== x || prev.input.z !== z || prev.input.run !== run;
    if (moving || changed || now - (prev?.at ?? 0) > IDLE_HEARTBEAT_MS) {
      seq.current++;
      sendInput({ seq: seq.current, x, z, run });
      lastSent.current = { input, at: now };
    }
  });

  // Record where prediction put us after the input with the current sequence number.
  useAfterPhysicsStep(() => {
    const c = body.current;
    if (!c) return;
    const f = c.feet();
    history.current.set(seq.current, { x: f.x, z: f.z });
    for (const k of history.current.keys()) {
      if (k < seq.current - 300) history.current.delete(k);
      else break;
    }
  });

  function reconcile() {
    const c = body.current;
    const server = localServerState.player;
    if (!c || !server || localServerState.receivedAt === lastReconciled.current) return;
    if (server.vehicleId) return; // the car is authoritative; nothing to reconcile
    lastReconciled.current = localServerState.receivedAt;
    const feet = c.feet();

    if (!spawned.current) {
      // First authoritative state: start where the server spawned us.
      spawned.current = true;
      c.teleport(server.position);
      history.current.clear();
      return;
    }

    const predicted = history.current.get(server.lastInputSeq) ?? feet;
    const ex = server.position.x - predicted.x;
    const ez = server.position.z - predicted.z;
    const err = Math.hypot(ex, ez);
    if (err > SNAP_DISTANCE) {
      c.teleport(server.position);
      history.current.clear();
      return;
    }
    const moving = Math.hypot(currentInput.current.x, currentInput.current.z) > 1e-3 || server.animation !== "idle";
    if (err < (moving ? DEADZONE_MOVING : DEADZONE_IDLE)) return;
    const k = moving ? CORRECTION_RATE * 0.5 : CORRECTION_RATE;
    const cx = ex * k;
    const cz = ez * k;
    c.teleport({ x: feet.x + cx, z: feet.z + cz });
    // Shift history too, so the same error is not corrected twice.
    for (const h of history.current.values()) {
      h.x += cx;
      h.z += cz;
    }
  }

  useFrame((state, dt) => {
    const c = body.current;
    const m = model.current;
    if (!c || !m) return;
    reconcile();
    const carId = localServerState.player?.vehicleId;
    const car = carId ? vehicleBuffers.get(carId)?.sample(performance.now()) : undefined;
    m.visible = !car && !CAPTURE;
    if (CAPTURE) return; // the capture rig owns the camera
    if (car) {
      // Swing the camera in behind the car.
      let dy = car.heading + Math.PI - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * Math.min(1, dt * 2.5);
      if (OVERVIEW) {
        camera.position.set(VIEW[0]!, VIEW[1]!, VIEW[2]!);
        camera.lookAt(VIEW[3]!, VIEW[4]!, VIEW[5]!);
      } else followCamera({ x: car.x, y: car.y + 0.4, z: car.z }, dt, 9);
      if (state.clock.elapsedTime - lastStore.current > 0.1) {
        lastStore.current = state.clock.elapsedTime;
        useLocalStore.getState().setPosition({ x: car.x, y: car.y, z: car.z }, false);
      }
      return;
    }
    const feet = c.feet();
    m.position.set(feet.x, feet.y, feet.z);
    // Turn smoothly toward the movement heading.
    let d = c.heading - m.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.rotation.y += d * Math.min(1, dt * 12);

    const { forward, right, run } = moveAxes();
    const moving = forward !== 0 || right !== 0;
    const bodyMesh = m.getObjectByName("body");
    if (bodyMesh) bodyMesh.position.y = moving ? Math.abs(Math.sin(state.clock.elapsedTime * (run ? 14 : 9))) * (run ? 0.12 : 0.06) : 0;

    if (OVERVIEW) {
      camera.position.set(VIEW[0]!, VIEW[1]!, VIEW[2]!);
      camera.lookAt(VIEW[3]!, VIEW[4]!, VIEW[5]!);
    } else {
      followCamera(feet, dt);
    }

    if (state.clock.elapsedTime - lastStore.current > 0.1) {
      lastStore.current = state.clock.elapsedTime;
      useLocalStore.getState().setPosition(feet, run && moving);
    }
  });

  function followCamera(feet: { x: number; y: number; z: number }, dt: number, distance = CAMERA_DISTANCE) {
    const target = lookAt.current.set(feet.x, feet.y + CAMERA_HEIGHT, feet.z);
    const cp = Math.cos(pitch.current);
    const desired = new Vector3(
      target.x + Math.sin(yaw.current) * distance * cp,
      target.y + Math.sin(pitch.current) * distance,
      target.z + Math.cos(yaw.current) * distance * cp,
    );
    desired.y = Math.max(desired.y, 0.5);
    camera.position.lerp(desired, Math.min(1, dt * 10));
    camera.lookAt(target);
  }

  const name = useNetStore((s) => s.roster.find((r) => r.isLocal)?.name ?? "You");
  const bag = useNetStore((s) => s.roster.find((r) => r.isLocal)?.carryingBag ?? false);
  return <Character ref={model} name={name} color="#ff4fa3" bag={bag} />;
}
