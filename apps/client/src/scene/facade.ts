// Procedural art-deco facades: a canvas texture of window bays, plus an emissive twin whose lit
// windows glow as night falls. Box UVs are rewritten in metres so every building gets
// real-size bays regardless of its footprint. Original work; no image assets.
import { BoxGeometry, CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

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

export interface FacadeTextures {
  map: Texture;
  emissive: Texture;
  roughness: Texture;
}

let cached: FacadeTextures | null = null;

/** White stucco with blue-glass windows (tinted by the material colour), lit windows and roughness. */
export function facadeTextures(): FacadeTextures {
  if (cached) return cached;
  const [base, b] = canvas();
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
      // Stucco with a faint speckle.
      b.fillStyle = "#f4f1ea";
      b.fillRect(x, y, PX, PX);
      for (let i = 0; i < 40; i++) {
        b.fillStyle = `rgba(120,110,100,${0.03 + rnd() * 0.04})`;
        b.fillRect(x + rnd() * PX, y + rnd() * PX, 2, 2);
      }
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
  cached = { map: texture(base, true), emissive: texture(glow, true), roughness: texture(rough, false) };
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
