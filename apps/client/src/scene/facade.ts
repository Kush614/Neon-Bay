// Procedural art-deco facades: a canvas texture of window bays, plus an emissive twin whose lit
// windows glow as night falls. Box UVs are rewritten in metres so every building gets
// real-size bays regardless of its footprint. Original work; no image assets.
import { BoxGeometry, CanvasTexture, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from "three";

export const BAY = 3.2; // metres per window bay
export const STOREY = 3.4; // matches STOREY_HEIGHT
const TILES = 4; // bays per texture edge
const PX = 128; // pixels per bay

function rand(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = PX * TILES;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, srgb: boolean): Texture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/** The Runware-generated bank wall: one tile spans 10 m and the full 12 m height. */
let bankCached: Texture | null = null;
export function bankFacade(): Texture {
  if (bankCached) return bankCached;
  const t = new TextureLoader().load("/generated/facade_bank.png");
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set((BAY * TILES) / 10, (STOREY * TILES) / 12);
  bankCached = t;
  return t;
}

export interface FacadeTextures {
  map: Texture;
  emissive: Texture;
  roughness: Texture;
  /** CC0 plaster normal (Poly Haven), repeated every 4 m on its own transform. */
  normal: Texture;
}

const PLASTER = "/cc0/textures/plastered_wall_";

let cached: FacadeTextures | null = null;

/** White stucco with blue-glass windows (tinted by the material colour), lit windows and roughness. */
export function facadeTextures(): FacadeTextures {
  if (cached) return cached;
  const [base, baseCtx] = canvas();
  const [layer, b] = canvas(); // windows and ledges, transparent elsewhere
  const [glow, g] = canvas();
  const [rough, r] = canvas();
  const rnd = rand(86);
  g.fillStyle = "#000";
  g.fillRect(0, 0, PX * TILES, PX * TILES);
  r.fillStyle = "#d8d8d8"; // stucco: rough
  r.fillRect(0, 0, PX * TILES, PX * TILES);
  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      const x = tx * PX;
      const y = ty * PX;
      // Art-deco eyebrow ledge under each storey.
      b.fillStyle = "#d9d2c4";
      b.fillRect(x, y + PX - 14, PX, 10);
      b.fillStyle = "#ffffff";
      b.fillRect(x, y + PX - 16, PX, 3);
      // Window: frame, glass, mullion.
      const wx = x + 26;
      const wy = y + 22;
      const ww = PX - 52;
      const wh = PX - 52;
      b.fillStyle = "#e7e2d6";
      b.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      const grad = b.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grad.addColorStop(0, "#3c5a78");
      grad.addColorStop(0.55, "#22324a");
      grad.addColorStop(1, "#4f7ea0");
      b.fillStyle = grad;
      b.fillRect(wx, wy, ww, wh);
      b.fillStyle = "#cfc8b8";
      b.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      r.fillStyle = "#1e1e1e"; // glass: glossy
      r.fillRect(wx, wy, ww, wh);
      // About 40% of windows are lit at night: warm lamps, some cool TV light.
      const roll = rnd();
      if (roll < 0.4) {
        g.fillStyle = roll < 0.06 ? "#7fe6ff" : roll < 0.12 ? "#ff9ad5" : "#ffc98a";
        g.globalAlpha = 0.55 + rnd() * 0.45;
        g.fillRect(wx, wy, ww, wh);
        g.globalAlpha = 1;
      }
    }
  }
  // Plain stucco until the photo plaster loads, then plaster under the window layer.
  baseCtx.fillStyle = "#f4f1ea";
  baseCtx.fillRect(0, 0, PX * TILES, PX * TILES);
  baseCtx.drawImage(layer, 0, 0);
  const map = texture(base, true);
  const glowTex = texture(glow, true);
  const roughTex = texture(rough, false);
  // Preferred: the Runware-generated photo wall (a 4 x 4 window grid, like this atlas). Its dark
  // glass becomes the night-window mask. Fallback: CC0 plaster under the canvas windows.
  const photo = new Image();
  photo.onload = () => {
    const N = PX * TILES;
    baseCtx.drawImage(photo, 0, 0, N, N);
    const px = baseCtx.getImageData(0, 0, N, N);
    const gl = g.getImageData(0, 0, N, N);
    const ro = r.getImageData(0, 0, N, N);
    const cell = N / TILES;
    const lit: string[] = [];
    for (let i = 0; i < TILES * TILES; i++) {
      const roll = rnd();
      lit.push(roll < 0.42 ? (roll < 0.06 ? "#7fe6ff" : roll < 0.12 ? "#ff9ad5" : "#ffc98a") : "");
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = (y * N + x) * 4;
        const lum = (0.2126 * px.data[k]! + 0.7152 * px.data[k + 1]! + 0.0722 * px.data[k + 2]!) / 255;
        const glass = lum < 0.42;
        const c = lit[Math.floor(y / cell) * TILES + Math.floor(x / cell)]!;
        const col = glass && c ? parseInt(c.slice(1), 16) : 0;
        gl.data[k] = (col >> 16) & 255;
        gl.data[k + 1] = (col >> 8) & 255;
        gl.data[k + 2] = col & 255;
        gl.data[k + 3] = 255;
        const rv = glass ? 30 : 215;
        ro.data[k] = ro.data[k + 1] = ro.data[k + 2] = rv;
        ro.data[k + 3] = 255;
      }
    }
    g.putImageData(gl, 0, 0);
    r.putImageData(ro, 0, 0);
    map.needsUpdate = glowTex.needsUpdate = roughTex.needsUpdate = true;
  };
  photo.onerror = () => {
    const img = new Image();
    img.onload = () => {
      const metres = 4; // the plaster scan covers about 4 m
      const px = (metres / BAY) * PX;
      for (let yy = 0; yy < PX * TILES; yy += px) for (let xx = 0; xx < PX * TILES; xx += px) baseCtx.drawImage(img, xx, yy, px, px);
      baseCtx.fillStyle = "rgba(255,250,240,0.35)"; // lift it toward painted stucco
      baseCtx.fillRect(0, 0, PX * TILES, PX * TILES);
      baseCtx.drawImage(layer, 0, 0);
      map.needsUpdate = true;
    };
    img.src = `${PLASTER}diffuse.jpg`;
  };
  photo.src = "/generated/facade_city.png";
  const normal = new TextureLoader().load(`${PLASTER}nor_gl.jpg`);
  normal.wrapS = normal.wrapT = RepeatWrapping;
  normal.repeat.set((BAY * TILES) / 4, (STOREY * TILES) / 4);
  cached = { map, emissive: glowTex, roughness: roughTex, normal };
  return cached;
}

/** A box whose side UVs are metres / (bays per texture), so windows keep their real size. */
export function facadeBox(w: number, h: number, d: number): BoxGeometry {
  const geo = new BoxGeometry(w, h, d);
  const pos = geo.attributes.position!;
  const nrm = geo.attributes.normal!;
  const uv = geo.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + w / 2;
    const y = pos.getY(i) + h / 2;
    const z = pos.getZ(i) + d / 2;
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, 0.004, 0.996); // roofs: plain stucco texel, no windows
    else uv.setXY(i, (nx > 0.5 ? z : x) / (BAY * TILES), y / (STOREY * TILES));
  }
  uv.needsUpdate = true;
  return geo;
}
