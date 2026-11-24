// An original 1980s wedge sports coupe (no real make): an extruded side profile with cut wheel
// arches and beveled edges, a glass greenhouse, clear-coated paint, five-spoke chrome wheels,
// pop-up headlight pods, a full-width tail-light bar and a rear wing. Front faces +z.
// About 9k triangles per car.
import { useMemo } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const WHEEL_Z = 1.42;
const WHEEL_R = 0.34;
const WHEEL_Y = 0.34;
const ARCH_R = 0.44;
const BODY_W = 1.72; // plus 2 x bevel = 2.0 m, the collider width

function extrudeSide(shape: Shape, width: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 });
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2); // shape x -> car z (front +z), extrusion -> car x
  g.computeVertexNormals();
  return g;
}

/** Body below the beltline: nose wedge, long deck, Kamm tail, two wheel arches. */
function bodyShape(): Shape {
  const s = new Shape();
  s.moveTo(2.12, 0.36);
  s.lineTo(2.2, 0.5); // front bumper
  s.quadraticCurveTo(2.22, 0.62, 2.0, 0.66); // sharp wedge nose
  s.lineTo(0.85, 0.84); // hood
  s.lineTo(-1.75, 0.93); // beltline
  s.quadraticCurveTo(-2.18, 0.94, -2.2, 0.82); // rear deck lip
  s.lineTo(-2.2, 0.42); // tail
  s.quadraticCurveTo(-2.2, 0.36, -2.1, 0.36);
  // Underside with arches (going front-ward).
  s.lineTo(-WHEEL_Z - ARCH_R, 0.36);
  s.absarc(-WHEEL_Z, WHEEL_Y, ARCH_R, Math.PI, 0, true);
  s.lineTo(WHEEL_Z - ARCH_R, 0.36);
  s.absarc(WHEEL_Z, WHEEL_Y, ARCH_R, Math.PI, 0, true);
  s.lineTo(2.12, 0.36);
  return s;
}

/** Greenhouse: raked windscreen, short roof, fastback rear glass. */
function cabinShape(): Shape {
  const s = new Shape();
  s.moveTo(0.8, 0.83);
  s.lineTo(-0.05, 1.2);
  s.lineTo(-0.85, 1.21);
  s.lineTo(-1.7, 0.94);
  s.lineTo(0.8, 0.83);
  return s;
}

function wheelGeometries() {
  const tyre = new TorusGeometry(WHEEL_R - 0.08, 0.09, 10, 24);
  tyre.scale(1, 1, 1.35);
  const rimParts: BufferGeometry[] = [new CylinderGeometry(WHEEL_R - 0.11, WHEEL_R - 0.11, 0.2, 20).rotateX(Math.PI / 2)];
  for (let i = 0; i < 5; i++) {
    const spoke = new BoxGeometry(0.05, WHEEL_R - 0.12, 0.04);
    spoke.translate(0, (WHEEL_R - 0.12) / 2, 0.11);
    spoke.rotateZ((i / 5) * Math.PI * 2);
    rimParts.push(spoke);
  }
  const hub = new CylinderGeometry(0.06, 0.06, 0.06, 10).rotateX(Math.PI / 2).translate(0, 0, 0.12);
  rimParts.push(hub);
  const rim = mergeGeometries(rimParts.map((g) => g.toNonIndexed()))!;
  const disc = new CylinderGeometry(0.2, 0.2, 0.03, 18).rotateX(Math.PI / 2);
  // Wheels spin in the car's x axis: rotate so the axle is x.
  for (const g of [tyre, rim, disc]) g.rotateY(Math.PI / 2);
  return { tyre, rim, disc };
}

let shared: ReturnType<typeof build> | null = null;
function build() {
  const body = extrudeSide(bodyShape(), BODY_W, 0.14);
  const cabin = extrudeSide(cabinShape(), BODY_W - 0.42, 0.1);
  const roof = new BoxGeometry(1.36, 0.05, 0.82);
  roof.translate(0, 1.245, -0.45);
  const wing = mergeGeometries([
    new BoxGeometry(1.8, 0.05, 0.32).translate(0, 1.13, -2.02),
    new BoxGeometry(0.06, 0.2, 0.12).translate(-0.7, 1.02, -2.0),
    new BoxGeometry(0.06, 0.2, 0.12).translate(0.7, 1.02, -2.0),
  ])!;
  const trim = mergeGeometries([
    new BoxGeometry(2.03, 0.1, 3.2).translate(0, 0.46, 0), // black rubbing strip
    new BoxGeometry(1.9, 0.14, 0.16).translate(0, 0.42, 2.2), // front bumper lip
    new BoxGeometry(1.95, 0.16, 0.14).translate(0, 0.44, -2.24), // rear bumper
    new BoxGeometry(0.09, 0.07, 0.16).translate(-0.98, 0.98, 0.55), // mirrors
    new BoxGeometry(0.09, 0.07, 0.16).translate(0.98, 0.98, 0.55),
  ])!;
  const headPods = mergeGeometries([new BoxGeometry(0.46, 0.06, 0.24).translate(-0.6, 0.79, 1.5), new BoxGeometry(0.46, 0.06, 0.24).translate(0.6, 0.79, 1.5)])!;
  const headLamps = mergeGeometries([new BoxGeometry(0.42, 0.06, 0.03).translate(-0.6, 0.59, 2.205), new BoxGeometry(0.42, 0.06, 0.03).translate(0.6, 0.59, 2.205)])!;
  const tail = new BoxGeometry(1.85, 0.12, 0.03).translate(0, 0.74, -2.215);
  const plate = new BoxGeometry(0.5, 0.13, 0.02).translate(0, 0.56, -2.23);
  return { body, cabin, roof, wing, trim, headPods, headLamps, tail, plate, ...wheelGeometries() };
}

const MATS = {
  glass: new MeshPhysicalMaterial({ color: "#0c1622", metalness: 0.1, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 }),
  trim: new MeshStandardMaterial({ color: "#121216", roughness: 0.6 }),
  tyre: new MeshStandardMaterial({ color: "#151517", roughness: 0.95 }),
  chrome: new MeshStandardMaterial({ color: "#e6e9ef", metalness: 1, roughness: 0.12 }),
  disc: new MeshStandardMaterial({ color: "#6b6b70", metalness: 0.8, roughness: 0.4 }),
  head: new MeshStandardMaterial({ color: "#fff8e0", emissive: "#fff2c4", emissiveIntensity: 2.2, toneMapped: false }),
  tail: new MeshStandardMaterial({ color: "#400008", emissive: "#ff1030", emissiveIntensity: 2.4, toneMapped: false }),
  plate: new MeshStandardMaterial({ color: "#f4f1e8", roughness: 0.5 }),
};

const paints = new Map<string, MeshPhysicalMaterial>();
function paint(color: string): MeshPhysicalMaterial {
  let m = paints.get(color);
  if (!m) {
    m = new MeshPhysicalMaterial({ color: new Color(color), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
    paints.set(color, m);
  }
  return m;
}

export function SportsCar({ color }: { color: string }) {
  const g = useMemo(() => (shared ??= build()), []);
  const body = paint(color);
  const wheels: [number, number][] = [
    [-0.86, WHEEL_Z],
    [0.86, WHEEL_Z],
    [-0.86, -WHEEL_Z],
    [0.86, -WHEEL_Z],
  ];
  return (
    <group>
      <mesh geometry={g.body} material={body} castShadow receiveShadow />
      <mesh geometry={g.cabin} material={MATS.glass} castShadow />
      <mesh geometry={g.roof} material={body} castShadow />
      <mesh geometry={g.wing} material={body} castShadow />
      <mesh geometry={g.headPods} material={body} />
      <mesh geometry={g.trim} material={MATS.trim} castShadow />
      <mesh geometry={g.headLamps} material={MATS.head} />
      <mesh geometry={g.tail} material={MATS.tail} />
      <mesh geometry={g.plate} material={MATS.plate} />
      {wheels.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, WHEEL_Y, z]}>
          <mesh geometry={g.tyre} material={MATS.tyre} castShadow />
          <mesh geometry={g.rim} material={MATS.chrome} scale={[x < 0 ? -1 : 1, 1, 1]} />
          <mesh geometry={g.disc} material={MATS.disc} />
        </group>
      ))}
      {/* Neon underglow, the one 80s indulgence. */}
      <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.3, 4.6]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
