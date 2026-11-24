// Runware (https://runware.ai/docs/models-api) implementation of ImageGenerator.
// From the docs: POST https://api.runware.ai/v1 with a JSON array of tasks, auth
// "Authorization: Bearer <key>". Success is { data: [{ taskUUID, imageUUID, imageURL, seed, cost }] }
// (cost only with includeCost); failure is { errors: [{ code, message, parameter, taskUUID }] }.
// Verified live on 2026-11-23 (see RUNWARE_DEFAULT_MODEL).
import { randomUUID } from "node:crypto";
import type { GeneratedImage, ImageGenerator, ImageRequest } from "../imageGenerator.js";

// Qwen-Image renders legible billboard lettering; the docs' civitai example (anime-tuned)
// garbled every headline. About $0.03 per 1024x512 image on 2026-11-23.
export const RUNWARE_DEFAULT_MODEL = "alibaba:qwen-image@3.0";

export interface RunwareOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface RunwareResult {
  taskUUID: string;
  imageURL?: string;
  seed?: number;
  cost?: number;
}

interface RunwareTaskError {
  code?: string;
  message?: string;
  parameter?: string;
}

export class RunwareError extends Error {}

export class RunwareImageGenerator implements ImageGenerator {
  readonly name = "runware";
  private readonly model: string;
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly opts: RunwareOptions) {
    this.model = opts.model ?? RUNWARE_DEFAULT_MODEL;
    this.base = opts.baseUrl ?? "https://api.runware.ai/v1";
    this.fetch = opts.fetch ?? fetch;
  }

  async generate(req: ImageRequest): Promise<GeneratedImage> {
    const taskUUID = randomUUID();
    const task = {
      taskType: "imageInference",
      taskUUID,
      positivePrompt: req.prompt,
      width: req.width,
      height: req.height,
      model: this.model,
      numberResults: 1,
      outputFormat: "PNG",
      includeCost: true,
      ...(req.seed === undefined ? {} : { seed: req.seed }),
    };
    const res = await this.fetch(this.base, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify([task]),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: RunwareResult[]; errors?: RunwareTaskError[] };
    const err = json.errors?.[0];
    if (!res.ok || err) throw new RunwareError(`Runware HTTP ${res.status}${err ? `: ${err.code ?? ""} ${err.message ?? ""}${err.parameter ? ` (${err.parameter})` : ""}` : ""}`);
    const result = json.data?.find((d) => d.taskUUID === taskUUID) ?? json.data?.[0];
    if (!result?.imageURL) throw new RunwareError("Runware returned no imageURL");
    const img = await this.fetch(result.imageURL);
    if (!img.ok) throw new RunwareError(`Runware image download HTTP ${img.status}`);
    return { bytes: new Uint8Array(await img.arrayBuffer()), mime: "image/png", model: this.model, seed: result.seed ?? null, costUsd: result.cost ?? null };
  }
}
