// Ocean shader (SPEC.md section 8): two scrolling procedural normal layers, a shore-to-deep
// colour gradient and foam along the sea wall. The sky colour and neon tint follow timeOfDay.
import { useFrame } from "@react-three/fiber";
import { WATER_Y } from "@neon-bay/shared";
import { useMemo } from "react";
import { Color, ShaderMaterial, Vector3 } from "three";
import { sunDirection } from "./DuskLighting.js";
import { ramp, tod } from "./timeOfDay.js";

const SHORE_X = 198;

const vertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSky;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uShore;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float waves(vec2 p) {
    return noise(p * 0.08 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6
         + noise(p * 0.21 - vec2(uTime * 0.07, -uTime * 0.04)) * 0.3
         + noise(p * 0.6 + vec2(uTime * 0.15, 0.0)) * 0.1;
  }
  void main() {
    vec2 p = vWorld.xz;
    float e = 0.6;
    float h = waves(p);
    vec3 n = normalize(vec3(waves(p - vec2(e, 0.0)) - waves(p + vec2(e, 0.0)), 0.35, waves(p - vec2(0.0, e)) - waves(p + vec2(0.0, e))));
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    float depth = clamp((vWorld.x - uShore) / 60.0, 0.0, 1.0);
    vec3 water = mix(uShallow, uDeep, depth);
    vec3 col = mix(water, uSky, fresnel * 0.85);
    vec3 halfV = normalize(uSunDir + view);
    col += uSunColor * pow(max(dot(n, halfV), 0.0), 180.0) * 2.5;
    float shore = 1.0 - smoothstep(0.0, 6.0, vWorld.x - uShore);
    float foam = smoothstep(0.55, 0.75, noise(p * 0.5 + vec2(uTime * 0.4, 0.0)) * shore + shore * 0.35);
    col = mix(col, vec3(0.95, 0.97, 1.0), foam * 0.8);
    col += h * 0.04;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function Ocean() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        fog: true,
        uniforms: {
          uTime: { value: 0 },
          uSky: { value: new Color() },
          uShallow: { value: new Color("#2fa3a8") },
          uDeep: { value: new Color("#0c3d5c") },
          uSunDir: { value: new Vector3() },
          uSunColor: { value: new Color() },
          uShore: { value: SHORE_X },
          fogColor: { value: new Color() },
          fogNear: { value: 1 },
          fogFar: { value: 1000 },
        },
      }),
    [],
  );
  useFrame((_, dt) => {
    const t = tod.value;
    const u = material.uniforms;
    u.uTime!.value += dt;
    (u.uSky!.value as Color).copy(ramp(t, ["#f6b893", "#b45f8f", "#141233"], "#a9d2f5"));
    (u.uShallow!.value as Color).copy(ramp(t, ["#2fa3a8", "#2b7f94", "#0f3046"], "#3cc8c8"));
    (u.uDeep!.value as Color).copy(ramp(t, ["#0c3d5c", "#0b2c4a", "#050f22"], "#0b5a8a"));
    (u.uSunDir!.value as Vector3).copy(sunDirection(t)).normalize();
    (u.uSunColor!.value as Color).copy(ramp(t, ["#ffd2a0", "#ff7a4a", "#2a2a55"], "#fffaf0"));
  });
  return (
    <mesh position={[700, WATER_Y, 0]} rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[1004, 2400, 1, 1]} />
    </mesh>
  );
}
