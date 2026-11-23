import { Sky } from "@react-three/drei";

/** Grey-box lighting: a low golden-hour sun with shadows. M9 replaces this with the HDRI rig. */
export function Lighting() {
  const sun: [number, number, number] = [-120, 60, 80];
  return (
    <>
      <Sky sunPosition={sun} turbidity={6} rayleigh={2.5} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <hemisphereLight args={["#ffe2c8", "#6a5a7a", 1.4]} />
      <ambientLight intensity={0.35} color="#b9a6d6" />
      <directionalLight
        position={sun}
        intensity={2.2}
        color="#ffc690"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-camera-far={600}
        shadow-bias={-0.0005}
        target-position={[130, 0, 0]}
      />
      <fog attach="fog" args={["#e8a98a", 250, 900]} />
    </>
  );
}
