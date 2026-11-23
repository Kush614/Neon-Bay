import { useFrame, useThree } from "@react-three/fiber";
import { useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import { Vector3, type Group } from "three";
import { LOCATIONS } from "@neon-bay/shared";
import { CharacterBody, type MoveInput } from "@neon-bay/shared/physics";
import { installKeyboard, moveAxes } from "../input/keyboard.js";
import { useLocalStore } from "../store.js";
import { Character } from "./Character.js";

const CAMERA_DISTANCE = 7;
const CAMERA_HEIGHT = 1.6; // look-at height above the feet
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.1;
/** `?cam=overview` swaps the follow camera for a fixed aerial view of the whole layout (debug). */
const OVERVIEW = new URLSearchParams(window.location.search).get("cam") === "overview";

/** The local player on foot with a third-person follow camera. M2 moves authority to the server. */
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

  useEffect(() => installKeyboard(), []);

  useEffect(() => {
    const c = new CharacterBody(rapier, world, LOCATIONS.nightclub.entrance);
    c.heading = Math.atan2(-Math.sin(yaw.current), -Math.cos(yaw.current));
    body.current = c;
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
    const { forward, right, run } = moveAxes();
    // Camera-relative axes on the ground plane.
    const fx = -Math.sin(yaw.current);
    const fz = -Math.cos(yaw.current);
    const rx = Math.cos(yaw.current);
    const rz = -Math.sin(yaw.current);
    const input: MoveInput = { x: fx * forward + rx * right, z: fz * forward + rz * right, run };
    c.step(input, 1 / 60);
  });

  useFrame((state, dt) => {
    const c = body.current;
    const m = model.current;
    if (!c || !m) return;
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
      camera.position.set(-60, 260, 260);
      camera.lookAt(130, 0, 0);
    } else {
      followCamera(feet, dt);
    }

    if (state.clock.elapsedTime - lastStore.current > 0.1) {
      lastStore.current = state.clock.elapsedTime;
      useLocalStore.getState().setPosition(feet, run && moving);
    }
  });

  function followCamera(feet: { x: number; y: number; z: number }, dt: number) {
    const target = lookAt.current.set(feet.x, feet.y + CAMERA_HEIGHT, feet.z);
    const cp = Math.cos(pitch.current);
    const desired = new Vector3(
      target.x + Math.sin(yaw.current) * CAMERA_DISTANCE * cp,
      target.y + Math.sin(pitch.current) * CAMERA_DISTANCE,
      target.z + Math.cos(yaw.current) * CAMERA_DISTANCE * cp,
    );
    desired.y = Math.max(desired.y, 0.5);
    camera.position.lerp(desired, Math.min(1, dt * 10));
    camera.lookAt(target);
  }

  return <Character ref={model} name="You" color="#ff4fa3" />;
}
