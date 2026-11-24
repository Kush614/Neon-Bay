import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { remoteBuffers, useNetStore, type RosterEntry } from "../net/connection.js";
import { Character } from "./Character.js";

const COLORS: Record<string, string> = { human: "#4fd1ff", agent: "#ffd166" };

function RemotePlayer({ entry }: { entry: RosterEntry }) {
  const ref = useRef<Group>(null);
  const last = useRef<{ x: number; z: number; t: number } | null>(null);

  useFrame((state) => {
    const g = ref.current;
    const s = remoteBuffers.get(entry.id)?.sample(performance.now());
    if (!g || !s) return;
    g.visible = true;
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.heading;
    // Bob while moving, judged from the interpolated speed.
    const prev = last.current;
    const speed = prev ? Math.hypot(s.x - prev.x, s.z - prev.z) / Math.max(1e-3, state.clock.elapsedTime - prev.t) : 0;
    last.current = { x: s.x, z: s.z, t: state.clock.elapsedTime };
    const bodyMesh = g.getObjectByName("body");
    if (bodyMesh) bodyMesh.position.y = speed > 0.5 ? Math.abs(Math.sin(state.clock.elapsedTime * (speed > 6 ? 14 : 9))) * 0.08 : 0;
  });

  return (
    <group ref={ref} visible={false}>
      <Character name={entry.name} color={COLORS[entry.kind] ?? "#cccccc"} />
    </group>
  );
}

export function RemotePlayers() {
  const roster = useNetStore((s) => s.roster);
  return (
    <>
      {roster
        .filter((r) => !r.isLocal)
        .map((r) => (
          <RemotePlayer key={r.id} entry={r} />
        ))}
    </>
  );
}
