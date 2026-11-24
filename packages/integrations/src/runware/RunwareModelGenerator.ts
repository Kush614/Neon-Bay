// Runware 3D generation (https://runware.ai/docs/models/tripo-v3-1 and /meshy-6, schema.json
// read 2026-11-23). taskType "3dInference" on POST https://api.runware.ai/v1, Bearer auth,
// deliveryMethod "async": the first call acknowledges the task; poll with
// { taskType: "getResponse", taskUUID } until a data item has outputs.files[].url (GLB).
// Errors arrive as { errors: [{ code, message, parameter }] } or a data item with status "error".
import { randomUUID } from "node:crypto";
import type { GeneratedModel, ModelGenerator, ModelRequest } from "../modelGenerator.js";
import { RunwareError } from "./RunwareImageGenerator.js";

export const RUNWARE_3D_MODELS = { tripo: "tripo:v3.1@0", meshy: "meshy:meshy@6" } as const;

interface Item {
  taskUUID?: string;
  status?: string;
  cost?: number;
  seed?: number;
  outputs?: { files?: { url?: string }[] };
}
interface Reply {
  data?: Item[];
  errors?: { code?: string; message?: string; parameter?: string }[];
}

export interface RunwareModelOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class RunwareModelGenerator implements ModelGenerator {
  readonly name = "runware";
  private readonly base: string;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: RunwareModelOptions) {
    this.base = opts.baseUrl ?? "https://api.runware.ai/v1";
    this.fetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** The task body for one request, exactly as the model schemas define it. */
  static task(req: ModelRequest, taskUUID: string): Record<string, unknown> {
    const model = RUNWARE_3D_MODELS[req.engine];
    const settings =
      req.engine === "tripo"
        ? { faceLimit: Math.min(20000, Math.max(500, req.faces)), texture: true, pbr: true, textureQuality: "detailed", geometryQuality: "detailed" }
        : { polyCount: Math.min(300000, Math.max(100, req.faces)), pose: req.aPose ? "a-pose" : "none", texture: true, pbr: true, topology: "triangle", symmetry: "auto" };
    return {
      taskType: "3dInference",
      taskUUID,
      model,
      positivePrompt: req.prompt,
      outputType: "URL",
      outputFormat: "GLB",
      deliveryMethod: "async",
      includeCost: true,
      numberResults: 1,
      settings,
      ...(req.seed !== undefined && req.engine === "tripo" ? { seed: req.seed } : {}),
    };
  }

  private async post(tasks: unknown[]): Promise<Reply> {
    const res = await this.fetch(this.base, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(tasks),
    });
    const json = (await res.json().catch(() => ({}))) as Reply;
    const err = json.errors?.[0];
    if (!res.ok || err) throw new RunwareError(`Runware HTTP ${res.status}${err ? `: ${err.code ?? ""} ${err.message ?? ""}${err.parameter ? ` (${err.parameter})` : ""}` : ""}`);
    return json;
  }

  async generate(req: ModelRequest): Promise<GeneratedModel> {
    const taskUUID = randomUUID();
    let reply = await this.post([RunwareModelGenerator.task(req, taskUUID)]);
    const deadline = Date.now() + (this.opts.timeoutMs ?? 15 * 60_000);
    for (;;) {
      const item = reply.data?.find((d) => d.taskUUID === taskUUID && (d.outputs?.files?.length || d.status === "error"));
      if (item?.status === "error") throw new RunwareError(`Runware 3D task failed: ${JSON.stringify(item)}`);
      const url = item?.outputs?.files?.find((f) => f.url)?.url;
      if (item && url) {
        const file = await this.fetch(url);
        if (!file.ok) throw new RunwareError(`Runware model download HTTP ${file.status}`);
        return { bytes: new Uint8Array(await file.arrayBuffer()), model: RUNWARE_3D_MODELS[req.engine], seed: item.seed ?? null, costUsd: item.cost ?? null };
      }
      if (Date.now() > deadline) throw new RunwareError(`Runware 3D task ${taskUUID} timed out`);
      await this.sleep(this.opts.pollMs ?? 5000);
      reply = await this.post([{ taskType: "getResponse", taskUUID }]);
    }
  }
}
