// The capture camera. For each frame it picks conditions and a viewpoint, renders the RGB
// image, then renders an instance-ID pass (every labelled object in a flat ID colour) to get
// pixel-exact masks, tight 2D boxes, occlusion and truncation, plus KITTI-style 3D labels.
// No human labelling: the engine knows what it drew.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import {
  Box3,
  Color,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Object3D,
} from "three";
import { CAR_HALF_EXTENTS, staticColliders, type CaptureApi, type CaptureFrame, type CaptureObject, type LabelClass } from "@neon-bay/shared";
import { CAPTURE_SEED, mulberry32, PRESETS, useConditions, type CaptureLabel } from "./mode.js";

/** Objects with fewer visible pixels than this, or a box shorter than MIN_BOX_HEIGHT, are not labelled. */
const MIN_PIXELS = 30;
const MIN_BOX_HEIGHT = 10;
const ID_LAYER = 7;

declare global {
  interface Window {
    __neonBayCapture?: CaptureApi;
  }
}

const DIMS: Record<LabelClass, [number, number, number]> = {
  Car: [CAR_HALF_EXTENTS.y * 2, CAR_HALF_EXTENTS.x * 2, CAR_HALF_EXTENTS.z * 2],
  Pedestrian: [1.8, 0.8, 0.8],
};

const VERT = /* glsl */ `
#include <common>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
}`;
const FRAG = /* glsl */ `
uniform vec3 idColor;
void main() { gl_FragColor = vec4(idColor, 1.0); }`;

function idMaterial(index: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { idColor: { value: new Color((index & 255) / 255, ((index >> 8) & 255) / 255, 0) } },
  });
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function visibleInHierarchy(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

const buildings = staticColliders().filter((b) => b.kind === "building");
function insideBuilding(p: Vector3): boolean {
  return buildings.some((b) => Math.abs(p.x - b.center.x) < b.half.x + 0.5 && Math.abs(p.z - b.center.z) < b.half.z + 0.5 && p.y < b.center.y + b.half.y + 0.5);
}

/** Palette for the preview mask (the real IDs are in the label files). */
function maskColor(i: number): [number, number, number] {
  const h = (i * 0.61803398875) % 1;
  const c = new Color().setHSL(h, 0.85, 0.55);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

export function CaptureRig() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    const cam = camera as PerspectiveCamera;

    function labelledRoots(): { root: Object3D; label: CaptureLabel }[] {
      const out: { root: Object3D; label: CaptureLabel }[] = [];
      scene.traverse((o) => {
        const l = o.userData.captureLabel as CaptureLabel | undefined;
        if (l && visibleInHierarchy(o)) out.push({ root: o, label: l });
      });
      return out;
    }

    function chooseCamera(rng: () => number, roots: { root: Object3D; label: CaptureLabel }[]) {
      const fov = 50 + rng() * 25;
      const r = rng();
      const mode = r < 0.5 ? "street" : r < 0.75 ? "dashcam" : "elevated";
      const pos = new Vector3();
      const target = new Vector3();
      const cars = roots.filter((x) => x.label.cls === "Car");
      if (mode === "dashcam" && cars.length) {
        const car = cars[Math.floor(rng() * cars.length)]!;
        const h = car.label.heading ?? 0;
        car.root.getWorldPosition(pos);
        pos.add(new Vector3(Math.sin(h) * 2.4, 1.25, Math.cos(h) * 2.4));
        target.copy(pos).add(new Vector3(Math.sin(h) * 25, -1, Math.cos(h) * 25));
        return { mode, pos, target, fov };
      }
      for (let attempt = 0; attempt < 20; attempt++) {
        const subject = roots[Math.floor(rng() * roots.length)];
        if (!subject) break;
        subject.root.getWorldPosition(target);
        target.y += 0.9;
        const elevated = mode === "elevated";
        const dist = elevated ? 15 + rng() * 25 : 7 + rng() * 20;
        const ang = rng() * Math.PI * 2;
        pos.set(target.x + Math.cos(ang) * dist, elevated ? 8 + rng() * 14 : 1.3 + rng() * 0.9, target.z + Math.sin(ang) * dist);
        if (pos.x < 0.5 || pos.x > 230 || Math.abs(pos.z) > 199 || insideBuilding(pos)) continue;
        target.x += (rng() - 0.5) * 4;
        target.z += (rng() - 0.5) * 4;
        return { mode, pos, target, fov };
      }
      pos.set(4, 1.7, 0);
      target.set(4, 1.2, 40);
      return { mode: "fallback", pos, target, fov };
    }

    async function frame(index: number): Promise<CaptureFrame> {
      const rng = mulberry32(CAPTURE_SEED * 1_000_003 + index * 7919);
      const conditions = PRESETS[Math.floor(rng() * PRESETS.length)]!;
      useConditions.getState().set(conditions);
      await nextFrame();
      await nextFrame();
      const started = performance.now();

      const roots = labelledRoots();
      const view = chooseCamera(rng, roots);
      cam.fov = view.fov;
      cam.position.copy(view.pos);
      cam.lookAt(view.target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);

      const w = gl.domElement.width;
      const h = gl.domElement.height;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();

      // 1. The RGB image, exactly as the game renders it.
      gl.setRenderTarget(null);
      gl.render(scene, cam);
      const rgb = gl.domElement.toDataURL("image/png");

      // 2. Instance-ID pass: labelled meshes in their ID colour, everything else black, no fog or sky.
      const swapped = new Map<Mesh, Material | Material[]>();
      const meshOwner = new Map<Mesh, number>();
      const black = idMaterial(0);
      const mats: ShaderMaterial[] = [black];
      roots.forEach(({ root }, k) => {
        const m = idMaterial(k + 1);
        mats.push(m);
        root.traverse((o) => {
          if ((o as Mesh).isMesh) meshOwner.set(o as Mesh, k + 1);
        });
      });
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        swapped.set(mesh, mesh.material);
        const owner = meshOwner.get(mesh);
        mesh.material = owner ? mats[owner]! : black;
      });
      const background = scene.background;
      const fog = scene.fog;
      const shadows = gl.shadowMap.enabled;
      scene.background = new Color(0, 0, 0);
      scene.fog = null;
      gl.shadowMap.enabled = false;
      const rt = new WebGLRenderTarget(w, h);
      const ids = new Uint8Array(w * h * 4);
      const one = new Uint8Array(w * h * 4);
      try {
        gl.setRenderTarget(rt);
        gl.setClearColor(0x000000, 1);
        gl.clear();
        gl.render(scene, cam);
        gl.readRenderTargetPixels(rt, 0, 0, w, h, ids);

        // Visible pixels and tight boxes per instance (rows come bottom-up from readPixels).
        const n = roots.length;
        const count = new Uint32Array(n + 1);
        const minX = new Int32Array(n + 1).fill(w);
        const minY = new Int32Array(n + 1).fill(h);
        const maxX = new Int32Array(n + 1).fill(-1);
        const maxY = new Int32Array(n + 1).fill(-1);
        for (let y = 0; y < h; y++) {
          const iy = h - 1 - y;
          for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const id = ids[o]! + (ids[o + 1]! << 8);
            if (!id || id > n) continue;
            count[id]!++;
            if (x < minX[id]!) minX[id] = x;
            if (x > maxX[id]!) maxX[id] = x;
            if (iy < minY[id]!) minY[id] = iy;
            if (iy > maxY[id]!) maxY[id] = iy;
          }
        }

        // 3. Unoccluded pixel count per visible instance, by rendering it alone on its own layer.
        const full = new Uint32Array(n + 1);
        const savedMask = cam.layers.mask;
        for (let k = 1; k <= n; k++) {
          if (count[k]! < MIN_PIXELS) continue;
          const meshes = [...meshOwner].filter(([, owner]) => owner === k).map(([m]) => m);
          meshes.forEach((m) => m.layers.enable(ID_LAYER));
          cam.layers.set(ID_LAYER);
          gl.clear();
          gl.render(scene, cam);
          gl.readRenderTargetPixels(rt, 0, 0, w, h, one);
          let c = 0;
          for (let o = 0; o < one.length; o += 4) if (one[o]! + (one[o + 1]! << 8) === k) c++;
          full[k] = Math.max(c, count[k]!);
          meshes.forEach((m) => m.layers.disable(ID_LAYER));
          cam.layers.mask = savedMask;
        }

        // 4. Labels.
        const objects: CaptureObject[] = [];
        const toCam = cam.matrixWorldInverse;
        roots.forEach(({ root, label }, i) => {
          const k = i + 1;
          if (count[k]! < MIN_PIXELS || maxY[k]! - minY[k]! + 1 < MIN_BOX_HEIGHT) return;
          const p = root.getWorldPosition(new Vector3()).applyMatrix4(toCam);
          const location: [number, number, number] = [p.x, -p.y, -p.z];
          const heading = label.heading ?? 0;
          const d = new Vector3(Math.sin(heading), 0, Math.cos(heading)).transformDirection(toCam);
          const rotationY = -Math.atan2(-d.z, d.x);
          const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
          // Truncation: how much of the projected 3D box falls outside the image.
          const box = new Box3().setFromObject(root);
          let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
          for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
            // Corners behind the camera are pulled onto the near plane before projecting.
            const c = new Vector3(cx, cy, cz).applyMatrix4(toCam);
            if (c.z > -cam.near) c.z = -cam.near;
            const v = c.applyMatrix4(cam.projectionMatrix);
            const sx = ((v.x + 1) / 2) * w;
            const sy = ((1 - v.y) / 2) * h;
            px0 = Math.min(px0, sx); px1 = Math.max(px1, sx); py0 = Math.min(py0, sy); py1 = Math.max(py1, sy);
          }
          const area = Math.max(1, (px1 - px0) * (py1 - py0));
          const inside = Math.max(0, Math.min(px1, w) - Math.max(px0, 0)) * Math.max(0, Math.min(py1, h) - Math.max(py0, 0));
          objects.push({
            id: label.id,
            cls: label.cls,
            bbox: [minX[k]!, minY[k]!, maxX[k]! + 1, maxY[k]! + 1],
            visiblePixels: count[k]!,
            fullPixels: full[k]!,
            occlusion: Math.round((1 - count[k]! / full[k]!) * 1000) / 1000,
            truncation: Math.round(Math.min(1, Math.max(0, 1 - inside / area)) * 1000) / 1000,
            distance: Math.round(p.length() * 100) / 100,
            location: location.map((x) => Math.round(x * 100) / 100) as [number, number, number],
            dimensions: DIMS[label.cls],
            rotationY: Math.round(wrap(rotationY) * 1000) / 1000,
            alpha: Math.round(wrap(rotationY - Math.atan2(location[0], location[2])) * 1000) / 1000,
          });
        });

        // 5. A colour preview of the instance mask for the viewer.
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        const img = ctx.createImageData(w, h);
        const palette = roots.map((_, i) => maskColor(i + 1));
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const id = ids[o]! + (ids[o + 1]! << 8);
            const t = ((h - 1 - y) * w + x) * 4;
            const c = id && id <= n && count[id]! >= MIN_PIXELS ? palette[id - 1]! : ([12, 8, 20] as const);
            img.data[t] = c[0];
            img.data[t + 1] = c[1];
            img.data[t + 2] = c[2];
            img.data[t + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);

        return {
          index,
          conditions: conditions.name,
          camera: { mode: view.mode, position: view.pos.toArray() as [number, number, number], target: view.target.toArray() as [number, number, number], fov: view.fov },
          width: w,
          height: h,
          rgb,
          mask: canvas.toDataURL("image/png"),
          objects,
          renderMs: Math.round(performance.now() - started),
        };
      } finally {
        for (const [mesh, m] of swapped) mesh.material = m;
        for (const m of mats) m.dispose();
        scene.background = background;
        scene.fog = fog;
        gl.shadowMap.enabled = shadows;
        gl.setRenderTarget(null);
        rt.dispose();
      }
    }

    window.__neonBayCapture = { frame, labelledCount: () => labelledRoots().length };
    return () => {
      delete window.__neonBayCapture;
    };
  }, [gl, scene, camera]);

  return null;
}
