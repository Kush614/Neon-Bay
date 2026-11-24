// ImageGenerator (SPEC.md section 16): build-time generation of signs, billboards,
// textures and portraits. Select with IMAGE_GENERATOR=runware|stub (stub by default).
import { deflateSync } from "node:zlib";

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mime: "image/png";
  model: string | null;
  seed: number | null;
  costUsd: number | null;
}

export interface ImageGenerator {
  readonly name: string;
  generate(req: ImageRequest): Promise<GeneratedImage>;
}

/** Writes a flat placeholder PNG coloured from the prompt; never touches the network. */
export class StubImageGenerator implements ImageGenerator {
  readonly name = "stub";
  readonly calls: ImageRequest[] = [];
  constructor(private readonly log: (line: string) => void = () => {}) {}

  async generate(req: ImageRequest): Promise<GeneratedImage> {
    this.calls.push(req);
    this.log(`[image:stub] ${req.width}x${req.height} ${req.prompt.slice(0, 60)}…`);
    let h = 2166136261;
    for (const c of req.prompt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rgb: [number, number, number] = [(h >>> 16) & 255, (h >>> 8) & 255, h & 255];
    return { bytes: solidPng(Math.min(req.width, 64), Math.min(req.height, 64), rgb), mime: "image/png", model: null, seed: req.seed ?? null, costUsd: 0 };
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Minimal valid RGB PNG of one colour. */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}
