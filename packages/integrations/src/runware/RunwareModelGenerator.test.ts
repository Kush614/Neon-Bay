import { describe, expect, it } from "vitest";
import { RunwareModelGenerator } from "./RunwareModelGenerator.js";

describe("RunwareModelGenerator", () => {
  it("builds schema-shaped tasks for Tripo and Meshy", () => {
    const t = RunwareModelGenerator.task({ engine: "tripo", prompt: "car", faces: 99999 }, "u1");
    expect(t).toMatchObject({ taskType: "3dInference", taskUUID: "u1", model: "tripo:v3.1@0", outputFormat: "GLB", settings: { faceLimit: 20000 } });
    const m = RunwareModelGenerator.task({ engine: "meshy", prompt: "person", faces: 12000, aPose: true }, "u2");
    expect(m).toMatchObject({ model: "meshy:meshy@6", settings: { polyCount: 12000, pose: "a-pose" } });
  });

  it("polls getResponse until the GLB is ready, then downloads it", async () => {
    const bodies: unknown[] = [];
    let calls = 0;
    const fake = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).startsWith("https://files.example/")) return new Response(new Uint8Array([103, 108, 84, 70]));
      const body = JSON.parse(String(init!.body)) as { taskUUID: string }[];
      bodies.push(body);
      calls++;
      const uuid = body[0]!.taskUUID;
      if (calls < 3) return Response.json({ data: [{ taskUUID: uuid, status: "processing" }] });
      return Response.json({ data: [{ taskUUID: uuid, status: "success", cost: 0.3, seed: 7, outputs: { files: [{ uuid: "f", url: "https://files.example/m.glb" }] } }] });
    }) as typeof fetch;
    const gen = new RunwareModelGenerator({ apiKey: "k", fetch: fake, sleep: async () => {} });
    const out = await gen.generate({ engine: "tripo", prompt: "palm", faces: 8000 });
    expect(out.bytes).toEqual(new Uint8Array([103, 108, 84, 70]));
    expect(out.costUsd).toBe(0.3);
    expect((bodies[1] as { taskType: string }[])[0]!.taskType).toBe("getResponse");
  });

  it("surfaces API errors", async () => {
    const fake = (async () => Response.json({ errors: [{ code: "invalidApiKey", message: "bad key" }] }, { status: 401 })) as unknown as typeof fetch;
    await expect(new RunwareModelGenerator({ apiKey: "k", fetch: fake }).generate({ engine: "meshy", prompt: "x", faces: 500 })).rejects.toThrow(/invalidApiKey/);
  });
});
