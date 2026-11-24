// Fake fetch only: automated tests never call Runware.
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createImageGenerator, solidPng, StubImageGenerator } from "../index.js";
import { RunwareImageGenerator } from "./RunwareImageGenerator.js";

const PNG = new Uint8Array([137, 80, 78, 71]);

function fakeRunware(reply: (task: Record<string, unknown>) => { status?: number; body: unknown }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.startsWith("https://im.runware.ai/")) return new Response(PNG);
    const [task] = JSON.parse(init!.body as string) as Record<string, unknown>[];
    const r = reply(task!);
    return Response.json(r.body, { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetch: f };
}

describe("RunwareImageGenerator", () => {
  it("sends one imageInference task with bearer auth and downloads the image", async () => {
    const rw = fakeRunware((t) => ({ body: { data: [{ taskType: "imageInference", taskUUID: t.taskUUID, imageURL: "https://im.runware.ai/image/x.png", seed: 7, cost: 0.003 }] } }));
    const gen = new RunwareImageGenerator({ apiKey: "rw-key", fetch: rw.fetch });
    const img = await gen.generate({ prompt: "neon sign", width: 1024, height: 512 });
    expect(img).toMatchObject({ seed: 7, costUsd: 0.003, model: "alibaba:qwen-image@3.0" });
    expect(Array.from(img.bytes)).toEqual(Array.from(PNG));
    const req = rw.calls[0]!;
    expect(req.url).toBe("https://api.runware.ai/v1");
    expect(new Headers(req.init!.headers).get("Authorization")).toBe("Bearer rw-key");
    const [task] = JSON.parse(req.init!.body as string);
    expect(task).toMatchObject({ taskType: "imageInference", positivePrompt: "neon sign", width: 1024, height: 512, numberResults: 1, outputFormat: "PNG", includeCost: true });
  });

  it("surfaces Runware's error code and message", async () => {
    const rw = fakeRunware(() => ({ status: 400, body: { errors: [{ code: "invalidWidth", message: "bad width", parameter: "width" }] } }));
    await expect(new RunwareImageGenerator({ apiKey: "k", fetch: rw.fetch }).generate({ prompt: "p", width: 7, height: 7 })).rejects.toThrow(/invalidWidth bad width \(width\)/);
  });

  it("selects Runware only with IMAGE_GENERATOR=runware and a key", () => {
    expect(createImageGenerator({}).name).toBe("stub");
    expect(createImageGenerator({ IMAGE_GENERATOR: "runware" }, () => {}).name).toBe("stub");
    expect(createImageGenerator({ IMAGE_GENERATOR: "runware", RUNWARE_API_KEY: "k" }).name).toBe("runware");
  });

  it("the stub writes a valid PNG", async () => {
    const img = await new StubImageGenerator().generate({ prompt: "x", width: 1024, height: 512 });
    expect(Array.from(img.bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const png = Buffer.from(solidPng(2, 1, [1, 2, 3]));
    const idat = png.subarray(png.indexOf("IDAT") + 4, png.indexOf("IEND") - 8);
    expect(Array.from(inflateSync(idat))).toEqual([0, 1, 2, 3, 1, 2, 3]);
  });
});
