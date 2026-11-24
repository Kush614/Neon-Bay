// Rigs an A-pose character mesh in code (Runware returns static meshes): bakes it to metres with
// feet at y=0, builds a 10-bone skeleton from body proportions, and paints skin weights with
// smooth falloffs at the hips, knees, shoulders and elbows. Original technique, no rig assets.
import { toFloatGeometry } from "./dequantize.js";
import { Bone, BufferAttribute, BufferGeometry, Box3, Group, Material, Mesh, Skeleton, SkinnedMesh, Vector3, type Object3D } from "three";

export const BONES = ["root", "hips", "spine", "upLegL", "lowLegL", "upLegR", "lowLegR", "armL", "foreL", "armR", "foreR"] as const;
type BoneName = (typeof BONES)[number];
const I = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

export interface RigTemplate {
  parts: { geometry: BufferGeometry; material: Material | Material[] }[];
  joints: Record<BoneName, Vector3>;
  height: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Bake, normalise and weight. `yaw` turns the model so it faces +z. */
export function buildRig(scene: Object3D, height: number, yaw = 0): RigTemplate {
  scene.updateMatrixWorld(true);
  const raw: { geometry: BufferGeometry; material: Material | Material[] }[] = [];
  scene.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) raw.push({ geometry: toFloatGeometry(m.geometry).applyMatrix4(m.matrixWorld), material: m.material });
  });
  const box = new Box3();
  for (const p of raw) {
    p.geometry.rotateY(yaw);
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const size = box.getSize(new Vector3());
  const c = box.getCenter(new Vector3());
  const s = height / size.y;
  const h = height;
  for (const p of raw) p.geometry.translate(-c.x, -box.min.y, -c.z).scale(s, s, s);

  // Joints from typical adult proportions (fractions of height).
  const legX = 0.055 * h;
  const shoulder = (side: number) => new Vector3(side * 0.1 * h, 0.81 * h, 0);
  // Elbows: follow where the arm vertices actually are (A-pose angles vary by generation).
  const elbow = (side: number) => {
    const sh = shoulder(side);
    const sum = new Vector3();
    let n = 0;
    const v = new Vector3();
    for (const p of raw) {
      const pos = p.geometry.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (Math.sign(v.x) === side && Math.abs(v.x) > 0.15 * h && v.y > 0.42 * h && v.y < 0.85 * h) {
          sum.add(v);
          n++;
        }
      }
    }
    const dir = n ? sum.divideScalar(n).sub(sh).normalize() : new Vector3(side * 0.5, -0.85, 0).normalize();
    return sh.clone().addScaledVector(dir, 0.19 * h);
  };
  const joints: Record<BoneName, Vector3> = {
    root: new Vector3(),
    hips: new Vector3(0, 0.53 * h, 0),
    spine: new Vector3(0, 0.66 * h, 0),
    upLegL: new Vector3(legX, 0.5 * h, 0),
    lowLegL: new Vector3(legX, 0.28 * h, 0.01 * h),
    upLegR: new Vector3(-legX, 0.5 * h, 0),
    lowLegR: new Vector3(-legX, 0.28 * h, 0.01 * h),
    armL: shoulder(1),
    foreL: elbow(1),
    armR: shoulder(-1),
    foreR: elbow(-1),
  };

  const v = new Vector3();
  for (const p of raw) {
    const pos = p.geometry.attributes.position!;
    const idx = new Uint16Array(pos.count * 4);
    const wts = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const side = v.x >= 0 ? 1 : -1;
      const ax = Math.abs(v.x);
      // Arms: away from the torso, between the hands and the shoulders.
      const arm = smooth(0.105 * h, 0.14 * h, ax) * smooth(0.36 * h, 0.42 * h, v.y) * (1 - smooth(0.86 * h, 0.9 * h, v.y));
      const legRaw = 1 - smooth(0.47 * h, 0.55 * h, v.y);
      const leg = (1 - arm) * legRaw;
      const body = 1 - arm - leg;
      const w: [number, number][] = [];
      // Body: hips below the waist, spine above.
      const sp = smooth(0.6 * h, 0.7 * h, v.y);
      w.push([I.hips, body * (1 - sp)], [I.spine, body * sp]);
      if (leg > 0) {
        const low = 1 - smooth(0.25 * h, 0.31 * h, v.y);
        const L = smooth(-0.02 * h, 0.02 * h, v.x); // share across the crotch
        w.push([I.upLegL, leg * (1 - low) * L], [I.upLegR, leg * (1 - low) * (1 - L)]);
        w.push([side > 0 ? I.lowLegL : I.lowLegR, leg * low]);
      }
      if (arm > 0) {
        const sh = side > 0 ? joints.armL : joints.armR;
        const el = side > 0 ? joints.foreL : joints.foreR;
        const d = v.distanceTo(sh);
        const fore = smooth(sh.distanceTo(el) - 0.03 * h, sh.distanceTo(el) + 0.03 * h, d);
        w.push([side > 0 ? I.armL : I.armR, arm * (1 - fore)], [side > 0 ? I.foreL : I.foreR, arm * fore]);
      }
      w.sort((a, b) => b[1] - a[1]);
      const top = w.slice(0, 4);
      const sum = top.reduce((a, t) => a + t[1], 0) || 1;
      top.forEach(([b, x], k) => {
        idx[i * 4 + k] = b;
        wts[i * 4 + k] = x / sum;
      });
    }
    p.geometry.setAttribute("skinIndex", new BufferAttribute(idx, 4));
    p.geometry.setAttribute("skinWeight", new BufferAttribute(wts, 4));
  }
  return { parts: raw, joints, height: h };
}

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  hips: "root",
  spine: "hips",
  upLegL: "hips",
  lowLegL: "upLegL",
  upLegR: "hips",
  lowLegR: "upLegR",
  armL: "spine",
  foreL: "armL",
  armR: "spine",
  foreR: "armR",
};

export interface RigInstance {
  object: Object3D;
  bones: Record<BoneName, Bone>;
}

/** A new skinned character sharing the template's geometry and materials. */
export function instantiate(t: RigTemplate): RigInstance {
  const bones = {} as Record<BoneName, Bone>;
  for (const name of BONES) {
    const b = new Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of BONES) {
    const parent = PARENT[name];
    const p = parent ? t.joints[parent] : new Vector3();
    bones[name].position.copy(t.joints[name]).sub(p);
    if (parent) bones[parent].add(bones[name]);
  }
  const skeleton = new Skeleton(BONES.map((n) => bones[n]));
  const root = bones.root;
  bones.hips.userData.baseY = bones.hips.position.y;
  const group = new Group();
  group.add(root);
  group.updateMatrixWorld(true);
  for (const part of t.parts) {
    const mesh = new SkinnedMesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skeleton);
    group.add(mesh);
  }
  return { object: group, bones };
}

/** Walk cycle: `phase` advances with distance; `stride` 0..1.2 scales the swing. */
export function poseWalk(b: Record<BoneName, Bone>, phase: number, stride: number, t: number): void {
  const s = Math.sin(phase) * 0.55 * stride;
  b.upLegL.rotation.x = s;
  b.upLegR.rotation.x = -s;
  b.lowLegL.rotation.x = Math.max(0, -Math.sin(phase - 0.6)) * 0.9 * stride;
  b.lowLegR.rotation.x = Math.max(0, Math.sin(phase - 0.6)) * 0.9 * stride;
  b.armL.rotation.x = -s * 0.8;
  b.armR.rotation.x = s * 0.8;
  b.foreL.rotation.x = -0.25 * stride;
  b.foreR.rotation.x = -0.25 * stride;
  b.hips.position.y = b.hips.userData.baseY + Math.abs(Math.cos(phase)) * 0.03 * stride + Math.sin(t * 1.4) * 0.004;
  b.spine.rotation.x = 0.06 * stride;
  b.spine.rotation.y = Math.sin(phase) * 0.06 * stride;
}
