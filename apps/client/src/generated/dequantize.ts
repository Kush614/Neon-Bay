// glTF-Transform's meshopt step stores positions/normals as normalized integers
// (KHR_mesh_quantization). Baking a transform into such an attribute clamps it to [-1, 1], so
// convert to float first.
import { BufferAttribute, type BufferGeometry } from "three";

export function toFloatGeometry(geo: BufferGeometry): BufferGeometry {
  const g = geo.clone();
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (attr.array instanceof Float32Array && !attr.normalized) continue;
    const out = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
    g.setAttribute(name, new BufferAttribute(out, attr.itemSize));
  }
  return g;
}
