import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense } from "react";
import { LocalPlayer } from "./entities/LocalPlayer.js";
import { RemotePlayers } from "./entities/RemotePlayers.js";
import { Vehicles } from "./entities/Vehicles.js";
import { Lighting } from "./scene/Lighting.js";
import { DuskLighting, TimeOfDayDriver } from "./scene/DuskLighting.js";
import { Effects } from "./scene/Effects.js";
import { NeonDriver } from "./scene/Props.js";
import { QUALITY } from "./scene/quality.js";
import { DynamicProps } from "./physics/DynamicProps.js";

const NPCS = new URLSearchParams(location.search).get("npcs") !== "0";
import { World } from "./scene/World.js";
import { Billboards } from "./scene/Billboards.js";
import { AmbientTraffic } from "./capture/AmbientTraffic.js";
import { CaptureRig } from "./capture/CaptureRig.js";
import { CAPTURE } from "./capture/mode.js";
import { Controls } from "./ui/Controls.js";
import { HUD } from "./ui/HUD.js";
import { LedgerPanel } from "./ui/LedgerPanel.js";
import { HelpBot } from "./ui/HelpBot.js";

export function App() {
  return (
    <>
      <Canvas
        shadows="soft"
        dpr={QUALITY.dpr}
        flat={!CAPTURE && QUALITY.postprocessing}
        camera={{ fov: 60, near: 0.1, far: 1200, position: [0, 8, 40] }}
        gl={{ antialias: !QUALITY.postprocessing || CAPTURE, preserveDrawingBuffer: CAPTURE, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          {/* Characters and cars are kinematic (their controllers apply gravity); world gravity
              only moves the client-only dynamic props. */}
          <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]} interpolate={false}>
            {CAPTURE ? <Lighting /> : <DuskLighting />}
            <TimeOfDayDriver />
            <NeonDriver />
            <World />
            <Billboards />
            <LocalPlayer />
            <RemotePlayers />
            <Vehicles />
            <DynamicProps />
            {CAPTURE ? <AmbientTraffic /> : NPCS && <AmbientTraffic game />}
            {CAPTURE && <CaptureRig />}
          </Physics>
          {!CAPTURE && <Effects />}
        </Suspense>
      </Canvas>
      {!CAPTURE && <HUD />}
      {!CAPTURE && <Controls />}
      {!CAPTURE && <LedgerPanel />}
      {!CAPTURE && <HelpBot />}
    </>
  );
}
