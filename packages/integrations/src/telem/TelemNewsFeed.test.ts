// Fake fetch only: automated tests never call Telem.
import { describe, expect, it } from "vitest";
import { cleanHeadline, createNewsFeed, StubNewsFeed, TelemNewsFeed } from "../index.js";

function fakeTelem(status = 200) {
  const bodies: Record<string, unknown>[] = [];
  const auth: (string | null)[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    auth.push(new Headers(init.headers).get("Authorization"));
    if (status !== 200) return Response.json({ detail: "Invalid API key" }, { status });
    return Response.json({
      session_id: "tsess-1",
      status: "succeeded",
      preprocessor_runs: [
        { preprocessor_name: "exa", error: null, output_payload: { results: [
          { rank: 1, title: "King tide floods the beach road | Coast Weekly", url: "https://www.coastweekly.test/a", publish_date: "2026-11-23T10:00:00Z" },
          { rank: 2, title: null, url: "https://x.test/b" },
        ] } },
        { preprocessor_name: "brave", error: null, output_payload: { results: [{ rank: 1, title: "King tide floods the beach road - Other Outlet", url: "https://www.google.com/url?q=1" }] } },
        { preprocessor_name: "tavily", error: { message: "down" }, output_payload: null },
      ],
    });
  }) as unknown as typeof fetch;
  return { bodies, auth, fetch: f };
}

describe("TelemNewsFeed", () => {
  it("searches recent news with bearer auth and returns clean, de-duplicated headlines", async () => {
    const t = fakeTelem();
    const feed = new TelemNewsFeed({ apiKey: "tlm_x", fetch: t.fetch, queries: ["coast news"], now: () => new Date("2026-11-23T12:00:00Z") });
    const h = await feed.headlines("game-1");
    expect(h).toEqual([{ text: "King tide floods the beach road", source: "coastweekly.test", publishedAt: "2026-11-23T10:00:00Z" }]);
    expect(t.auth[0]).toBe("Bearer tlm_x");
    expect(t.bodies[0]).toMatchObject({
      user_input: [{ query: "coast news", context: "game session game-1" }],
      search: { num_results: 5, tier: "minimalist", auto_routing: "accuracy", published_after: "2026-11-16" },
    });
    expect(t.bodies[0]).not.toHaveProperty("session_id");
    await feed.headlines("game-1");
    expect(t.bodies[1]).toMatchObject({ session_id: "tsess-1" });
  });

  it("reports Telem's error detail", async () => {
    await expect(new TelemNewsFeed({ apiKey: "bad", fetch: fakeTelem(401).fetch }).headlines("g")).rejects.toThrow(/HTTP 401: Invalid API key/);
  });

  it("strips outlet suffixes only", () => {
    expect(cleanHeadline("Flood Watch in effect for parts of Central Florida - WESH")).toBe("Flood Watch in effect for parts of Central Florida");
    expect(cleanHeadline("Storm to slam the East Coast | Fox Weather")).toBe("Storm to slam the East Coast");
    expect(cleanHeadline("Thought flooding was over? 'King tide' is back")).toBe("Thought flooding was over? 'King tide' is back");
  });

  it("selects Telem only with NEWS_FEED=telem and a key", () => {
    expect(createNewsFeed({}).name).toBe("stub");
    expect(createNewsFeed({ NEWS_FEED: "telem" }, () => {}).name).toBe("stub");
    expect(createNewsFeed({ NEWS_FEED: "telem", TELEM_API_KEY: "k" }).name).toBe("telem");
    expect(new StubNewsFeed().name).toBe("stub");
  });
});
