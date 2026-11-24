// Uses a fake fetch: automated tests never call BAND.
import { describe, expect, it } from "vitest";
import { createCrewChannel, StubCrewChannel } from "../index.js";
import { BandCrewChannel } from "./BandCrewChannel.js";

function fakeBand(failOn?: string) {
  const calls: { method: string; path: string; body: unknown; key: string | null }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(init.body as string) : null, key: new Headers(init.headers).get("X-API-Key") });
    if (failOn && path.endsWith(failOn)) return new Response("{}", { status: 500 });
    if (path === "/api/v1/agent/me") return Response.json({ data: { id: "agent-1", handle: "owner1/neonbaycrew", owner_uuid: "user-1" } });
    if (path === "/api/v1/agent/chats") return Response.json({ data: { id: "room-1" } }, { status: 201 });
    return Response.json({ data: { success: true } }, { status: 201 });
  }) as unknown as typeof fetch;
  return { calls, fetch: f };
}

describe("BandCrewChannel", () => {
  it("opens a room with the owner and posts messages that @mention them", async () => {
    const band = fakeBand();
    const ch = new BandCrewChannel({ apiKey: "agent-key", baseUrl: "https://band.test", fetch: band.fetch, log: () => {} });
    await ch.open("sess-1");
    await ch.post({ kind: "deal", fromName: "Dex", toName: "Opal", text: "30% of my take" });
    await ch.close();
    expect(band.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/v1/agent/me",
      "POST /api/v1/agent/chats",
      "POST /api/v1/agent/chats/room-1/participants",
      "POST /api/v1/agent/chats/room-1/messages",
      "POST /api/v1/agent/chats/room-1/messages",
    ]);
    expect(band.calls.every((c) => c.key === "agent-key")).toBe(true);
    expect(band.calls[2]!.body).toEqual({ participant: { participant_id: "user-1", role: "member" } });
    expect(band.calls[4]!.body).toEqual({
      message: { content: "@owner1 🤝 Dex → Opal: 30% of my take", mentions: [{ id: "user-1", handle: "owner1", name: "owner1" }] },
    });
  });

  it("a failed post is logged and never throws into the game", async () => {
    const band = fakeBand("/messages");
    const lines: string[] = [];
    const ch = new BandCrewChannel({ apiKey: "k", fetch: band.fetch, log: (l) => lines.push(l) });
    await expect(ch.open("s")).rejects.toThrow(/HTTP 500/);
    await expect(ch.post({ kind: "whisper", fromName: "A", toName: "B", text: "hi" })).resolves.toBeUndefined();
    expect(lines.some((l) => /post failed/.test(l))).toBe(true);
  });

  it("selects BAND only with CREW_CHANNEL=band and a key", () => {
    expect(createCrewChannel({}).name).toBe("stub");
    expect(createCrewChannel({ CREW_CHANNEL: "band" }, () => {}).name).toBe("stub");
    expect(createCrewChannel({ CREW_CHANNEL: "band", BAND_API_KEY: "k" }).name).toBe("band");
    expect(new StubCrewChannel().name).toBe("stub");
  });
});
