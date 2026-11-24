// Rooftop billboards. Art comes from `pnpm assets` (Runware or the stub) via
// /generated/manifest.json; without it each board is a plain lit panel.
import { BILLBOARD_SPOTS, type GeneratedAssetManifest } from "@neon-bay/shared";
import { useEffect, useState } from "react";
import { SRGBColorSpace, TextureLoader, type Texture } from "three";

function useBillboardTextures(): Map<string, Texture> {
  const [textures, setTextures] = useState(new Map<string, Texture>());
  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    fetch("/generated/manifest.json")
      .then((r) => (r.ok ? (r.json() as Promise<GeneratedAssetManifest>) : null))
      .then(async (m) => {
        if (!m) return;
        const loaded = new Map<string, Texture>();
        await Promise.all(
          m.assets.map(async (a) => {
            const t = await loader.loadAsync(a.path).catch(() => null);
            if (t) {
              t.colorSpace = SRGBColorSpace;
              loaded.set(a.id, t);
            }
          }),
        );
        if (alive) setTextures(loaded);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return textures;
}

export function Billboards() {
  const textures = useBillboardTextures();
  return (
    <group>
      {BILLBOARD_SPOTS.map((b) => {
        const map = textures.get(b.assetId);
        return (
          <group key={b.assetId} position={[b.x, b.y, b.z]} rotation-y={b.rotationY}>
            <mesh>
              <planeGeometry args={[b.width, b.height]} />
              {map ? <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.8} /> : <meshStandardMaterial color="#2a1840" emissive="#ff4fa3" emissiveIntensity={0.15} />}
            </mesh>
            <mesh position={[0, 0, -0.15]}>
              <boxGeometry args={[b.width + 0.4, b.height + 0.4, 0.2]} />
              <meshStandardMaterial color="#1a1a22" />
            </mesh>
            <mesh position={[0, -b.height / 2 - 1.5, -0.3]}>
              <boxGeometry args={[0.3, 3, 0.3]} />
              <meshStandardMaterial color="#333340" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
