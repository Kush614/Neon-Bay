import { Sky } from "@react-three/drei";
import { direction, useConditions } from "../capture/mode.js";

/** Grey-box lighting. Golden hour by default; capture mode swaps presets. M9 replaces this with the HDRI rig. */
export function Lighting() {
  const c = useConditions((s) => s.c);
  const sky = direction(c.skyElevation, c.skyAzimuth, 160);
  const light = direction(c.lightElevation, c.lightAzimuth, 160);
  return (
    <>
      <Sky sunPosition={sky} turbidity={c.turbidity} rayleigh={c.rayleigh} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <hemisphereLight args={[c.hemiSky, c.hemiGround, c.hemiIntensity]} />
      <ambientLight intensity={c.ambientIntensity} color="#b9a6d6" />
      <directionalLight
        position={light}
        intensity={c.lightIntensity}
        color={c.lightColor}
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
      <fog attach="fog" args={[c.fogColor, c.fogNear, c.fogFar]} />
    </>
  );
}
