import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense } from "react";
import { LocalPlayer } from "./entities/LocalPlayer.js";
import { RemotePlayers } from "./entities/RemotePlayers.js";
import { Lighting } from "./scene/Lighting.js";
import { World } from "./scene/World.js";
import { HUD } from "./ui/HUD.js";
import { LedgerPanel } from "./ui/LedgerPanel.js";

export function App() {
  return (
    <>
      <Canvas shadows="percentage" camera={{ fov: 60, near: 0.1, far: 1200, position: [0, 8, 40] }} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          {/* Gravity is applied by the character controller, not the world. */}
          <Physics timeStep={1 / 60} gravity={[0, 0, 0]} interpolate={false}>
            <Lighting />
            <World />
            <LocalPlayer />
            <RemotePlayers />
          </Physics>
        </Suspense>
      </Canvas>
      <HUD />
      <LedgerPanel />
    </>
  );
}
