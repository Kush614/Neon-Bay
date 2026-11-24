// Post-processing in the spec's order (SPEC.md section 8): ambient occlusion, bloom (threshold
// so only neon and the sun bloom), ACES tone mapping, a teal-and-magenta colour grade (a lookup
// table generated in code), vignette and light film grain. Depth of field is for cinematic
// cameras only, which the game does not have yet.
import { Bloom, EffectComposer, LUT, N8AO, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, LookupTexture, ToneMappingMode } from "postprocessing";
import { useMemo } from "react";
import { QUALITY } from "./quality.js";

/** Neutral 32^3 LUT pushed teal in the shadows and magenta-warm in the highlights. */
function tealMagentaLut(): LookupTexture {
  const lut = LookupTexture.createNeutral(32);
  const data = lut.image.data as Float32Array | Uint8Array;
  const scale = data instanceof Uint8Array ? 255 : 1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / scale;
    const g = data[i + 1]! / scale;
    const b = data[i + 2]! / scale;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadow = 1 - Math.min(lum * 2, 1);
    const high = Math.max(lum * 2 - 1, 0);
    const out = [r - shadow * 0.04 + high * 0.05, g + shadow * 0.02 - high * 0.015, b + shadow * 0.06 + high * 0.03];
    // A touch more saturation.
    const avg = (out[0]! + out[1]! + out[2]!) / 3;
    for (let k = 0; k < 3; k++) data[i + k] = Math.min(Math.max(avg + (out[k]! - avg) * 1.12, 0), 1) * scale;
  }
  lut.needsUpdate = true;
  return lut;
}

export function Effects() {
  const lut = useMemo(tealMagentaLut, []);
  if (!QUALITY.postprocessing) return null;
  return (
    <EffectComposer multisampling={QUALITY.quality === "high" ? 4 : 0}>
      <N8AO aoRadius={2.5} intensity={QUALITY.ambientOcclusion ? 2.2 : 0} distanceFalloff={1} quality={QUALITY.quality === "high" ? "high" : "low"} halfRes />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.6} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <LUT lut={lut} />
      <Vignette offset={0.3} darkness={0.55} />
      <Noise premultiply opacity={0.08} blendFunction={BlendFunction.SOFT_LIGHT} />
    </EffectComposer>
  );
}
