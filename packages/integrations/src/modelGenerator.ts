// ModelGenerator: build-time 3D model generation (SPEC.md section 16, Runware adapter).
// Select with MODEL_GENERATOR=runware|stub (stub by default). The stub produces no file, and
// the client falls back to its procedural models, so the game always runs stubbed.

export interface ModelRequest {
  engine: "tripo" | "meshy";
  prompt: string;
  faces: number;
  aPose?: boolean;
  seed?: number;
}

export interface GeneratedModel {
  /** GLB bytes, or null when the generator produces nothing (the stub). */
  bytes: Uint8Array | null;
  model: string | null;
  seed: number | null;
  costUsd: number | null;
}

export interface ModelGenerator {
  readonly name: string;
  generate(req: ModelRequest): Promise<GeneratedModel>;
}

export class StubModelGenerator implements ModelGenerator {
  readonly name = "stub";
  readonly calls: ModelRequest[] = [];
  constructor(private readonly log: (line: string) => void = () => {}) {}
  async generate(req: ModelRequest): Promise<GeneratedModel> {
    this.calls.push(req);
    this.log(`[model:stub] ${req.engine} ${req.prompt.slice(0, 60)}…`);
    return { bytes: null, model: null, seed: req.seed ?? null, costUsd: 0 };
  }
}
