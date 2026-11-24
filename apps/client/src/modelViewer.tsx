// /models.html: every Runware-generated model in one turntable scene, people walking in circles
// so the code rig is visible. A dev and demo aid; the game itself never loads this page.
import { Environment, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { GeneratedModelEntry } from "@neon-bay/shared";
import { StrictMode, Suspense, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Group } from "three";
import { useGeneratedModels } from "./generated/manifest.js";
import { RiggedPerson } from "./generated/GeneratedPeople.js";
import { GeneratedCar, GeneratedPalms } from "./generated/GeneratedProps.js";

const params = new URLSearchParams(location.search);
const walk = params.get("walk") !== "0";
const PALM_AT: [number, number][] = [[0, 0]];

function Walker({ entry, x }: { entry: GeneratedModelEntry; x: number }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current || !walk) return;
    const t = clock.elapsedTime * 0.9 + x;
    g.current.position.set(x + Math.cos(t) * 1.2, 0, 4 + Math.sin(t) * 1.2);
    g.current.rotation.y = -t; // face along the circle
  });
  return (
    <group ref={g} position={[x, 0, 4]}>
      <RiggedPerson url={entry.file} height={entry.heightMetres} />
      <Html position={[0, entry.heightMetres + 0.3, 0]} center style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {entry.id}
      </Html>
    </group>
  );
}

function Scene() {
  const models = useGeneratedModels();
  if (!models) return null;
  const all = [...models.values()];
  const people = all.filter((m) => m.kind === "character");
  const cars = all.filter((m) => m.kind === "car");
  const palm = models.get("palm");
  return (
    <>
      {people.map((m, i) => (
        <Suspense key={m.id} fallback={null}>
          <Walker entry={m} x={(i - (people.length - 1) / 2) * 3} />
        </Suspense>
      ))}
      {cars.map((m, i) => (
        <group key={m.id} position={[(i - (cars.length - 1) / 2) * 5.5, 0, -3]}>
          <Suspense fallback={null}>
            <GeneratedCar entry={m} />
          </Suspense>
          <Html position={[0, 2, 0]} center style={{ fontSize: 12 }}>
            {m.id} (front →z)
          </Html>
        </group>
      ))}
      {palm && (
        <group position={[0, 0, -12]}>
          <Suspense fallback={null}>
            <GeneratedPalms entry={palm} count={1} at={PALM_AT} />
          </Suspense>
        </group>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas shadows camera={{ position: [0, 4, 14], fov: 50 }}>
      <Environment files="/cc0/hdri/belfast_sunset_puresky_2k.hdr" background />
      <directionalLight position={[8, 12, 6]} intensity={2} castShadow />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4a4650" />
      </mesh>
      <Scene />
      <OrbitControls target={[0, 1, 0]} />
    </Canvas>
  </StrictMode>,
);
