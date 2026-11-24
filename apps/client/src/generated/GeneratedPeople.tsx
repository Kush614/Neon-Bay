// A Runware-generated character, rigged in code (autoRig.ts) and walking at the speed it moves.
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, Vector3, type Group } from "three";
import { buildRig, instantiate, poseWalk, type RigTemplate } from "./autoRig.js";

const templates = new Map<string, RigTemplate>();

export function RiggedPerson({ url, height, yaw = 0 }: { url: string; height: number; yaw?: number }) {
  const gltf = useGLTF(url);
  const rig = useMemo(() => {
    let t = templates.get(url);
    if (!t) {
      t = buildRig(gltf.scene, height, yaw);
      templates.set(url, t);
    }
    return instantiate(t);
  }, [gltf, url, height, yaw]);
  const holder = useRef<Group>(null);
  const st = useRef({ last: new Vector3(), now: new Vector3(), init: false, phase: 0, speed: 0 });
  useFrame((state, dt) => {
    const g = holder.current;
    if (!g || dt <= 0) return;
    const s = st.current;
    g.getWorldPosition(s.now);
    if (!s.init) {
      s.last.copy(s.now);
      s.init = true;
    }
    const v = Math.hypot(s.now.x - s.last.x, s.now.z - s.last.z) / dt;
    s.last.copy(s.now);
    s.speed = MathUtils.damp(s.speed, Math.min(v, 9), 10, dt);
    const stride = Math.min(s.speed / 3.2, 1.2);
    if (stride > 0.05) s.phase += dt * (3.6 + s.speed * 1.5);
    poseWalk(rig.bones, s.phase, stride, state.clock.elapsedTime);
  });
  return (
    <group ref={holder}>
      <primitive object={rig.object} />
    </group>
  );
}
