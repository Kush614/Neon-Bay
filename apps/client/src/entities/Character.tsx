import { forwardRef } from "react";
import type { Group } from "three";
import type { CaptureLabel } from "../capture/mode.js";
import { NameTag } from "./NameTag.js";

/** Grey-box character: capsule body, head and a nose that shows facing. Feet at the group origin. */
export const Character = forwardRef<Group, { name: string; color: string; bag?: boolean; label?: CaptureLabel; showName?: boolean }>(function Character(
  { name, color, bag = false, label, showName = true },
  ref,
) {
  return (
    <group ref={ref} userData={label ? { captureLabel: label } : {}}>
      <group name="body">
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.4, 1.0, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.65, 0]} castShadow>
          <sphereGeometry args={[0.26, 16, 12]} />
          <meshStandardMaterial color="#e9b48a" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.62, 0.26]}>
          <boxGeometry args={[0.1, 0.08, 0.14]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {bag && (
          <mesh position={[0, 1.05, -0.5]} castShadow>
            <boxGeometry args={[0.6, 0.6, 0.35]} />
            <meshStandardMaterial color="#3d6b3a" roughness={0.9} />
          </mesh>
        )}
      </group>
      {showName && <NameTag name={name} color={color} />}
    </group>
  );
});
