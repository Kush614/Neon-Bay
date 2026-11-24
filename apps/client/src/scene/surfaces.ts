// Photo-scanned CC0 surfaces from Poly Haven (see ASSETS.md; fetched by `pnpm fetch:cc0`).
// Each surface tiles at its real-world size: `tile` metres per texture repeat.
import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2, type Texture } from "three";

export type Surface = "plaster" | "asphalt" | "sand" | "grass" | "tiles";

const IDS: Record<Surface, { id: string; tile: number; tint?: string; normal?: number }> = {
  plaster: { id: "plastered_wall", tile: 4 },
  asphalt: { id: "clean_asphalt", tile: 6, tint: "#8c8a94" },
  sand: { id: "coast_sand_01", tile: 5, tint: "#fff1dc" },
  grass: { id: "leafy_grass", tile: 4, tint: "#d6f0c4" },
  tiles: { id: "large_grey_tiles", tile: 3, tint: "#efe6da" },
};

export const surfaceUrls = (s: Surface) => {
  const id = IDS[s].id;
  const base = `/cc0/textures/${id}_`;
  return { map: `${base}diffuse.jpg`, normalMap: `${base}nor_gl.jpg`, roughnessMap: `${base}rough.jpg` };
};

function tiled(t: Texture, rx: number, ry: number, srgb: boolean): Texture {
  const c = t.clone();
  c.wrapS = c.wrapT = RepeatWrapping;
  c.repeat.set(rx, ry);
  c.anisotropy = 8;
  if (srgb) c.colorSpace = SRGBColorSpace;
  c.needsUpdate = true;
  return c;
}

/** A material for a w x d metre plane, tiled at the surface's real-world scale. */
export function useSurface(surface: Surface, w: number, d: number): MeshStandardMaterial {
  const tex = useTexture(surfaceUrls(surface));
  return useMemo(() => {
    const s = IDS[surface];
    const rx = w / s.tile;
    const ry = d / s.tile;
    return new MeshStandardMaterial({
      map: tiled(tex.map, rx, ry, true),
      normalMap: tiled(tex.normalMap, rx, ry, false),
      normalScale: new Vector2(s.normal ?? 1, s.normal ?? 1),
      roughnessMap: tiled(tex.roughnessMap, rx, ry, false),
      color: s.tint ?? "#ffffff",
      roughness: 1,
    });
  }, [tex, surface, w, d]);
}

/** Raw shared textures (for materials that set their own repeat). */
export function useSurfaceTextures(surface: Surface) {
  return useTexture(surfaceUrls(surface));
}
