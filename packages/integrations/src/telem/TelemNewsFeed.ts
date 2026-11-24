// Telem (https://docs.telem.ai) implementation of NewsFeed.
// From the API reference: POST https://router.telem.ai/v1/search, "Authorization: Bearer tlm_…",
// body { user_input: [{ query, goal?, context? }], search: { num_results, tier, auto_routing,
// published_after }, session_id? }. The response has session_id and preprocessor_runs[]
// with output_payload.results[] ({ rank, url, title, publish_date }) and a per-run error.
// Verified live 2026-11-23. All searches for one game share a Telem session, so the console
// shows them together as one trajectory.
import type { Headline, NewsFeed } from "../newsFeed.js";

export interface TelemNewsFeedOptions {
  apiKey: string;
  baseUrl?: string;
  queries?: string[];
  /** Keep results published in the last N days. */
  days?: number;
  max?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

export const TELEM_DEFAULT_QUERIES = ["Florida coast news this week", "Miami waterfront business news"];

interface TelemResult {
  title?: string | null;
  url?: string | null;
  publish_date?: string | null;
}

interface TelemSearchResponse {
  session_id?: string;
  preprocessor_runs?: { preprocessor_name?: string; error?: unknown; output_payload?: { results?: TelemResult[] } | null }[];
}

export class TelemError extends Error {}

/** Drop the trailing " | Outlet" or " - Outlet" that many titles carry. */
export function cleanHeadline(title: string): string {
  return title
    .replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The outlet's host name, or null for unknown and redirect URLs. */
function sourceOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "google.com" ? null : host;
  } catch {
    return null;
  }
}

export class TelemNewsFeed implements NewsFeed {
  readonly name = "telem";
  private readonly base: string;
  private readonly fetch: typeof fetch;
  /** Telem session per game session. */
  readonly sessions = new Map<string, string>();

  constructor(private readonly opts: TelemNewsFeedOptions) {
    this.base = (opts.baseUrl ?? "https://router.telem.ai").replace(/\/$/, "");
    this.fetch = opts.fetch ?? fetch;
  }

  async headlines(sessionId: string): Promise<Headline[]> {
    const now = this.opts.now?.() ?? new Date();
    const after = new Date(now.getTime() - (this.opts.days ?? 7) * 86_400_000).toISOString().slice(0, 10);
    const queries = this.opts.queries ?? TELEM_DEFAULT_QUERIES;
    const telemSession = this.sessions.get(sessionId);
    const body = {
      user_input: queries.map((query) => ({ query, goal: "headlines for the Neon Bay '86 in-game radio", context: `game session ${sessionId}` })),
      search: { num_results: 5, tier: "minimalist", auto_routing: "accuracy", published_after: after },
      ...(telemSession ? { session_id: telemSession } : {}),
    };
    const res = await this.fetch(`${this.base}/v1/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => ({}))) as { detail?: unknown }).detail;
      throw new TelemError(`Telem search HTTP ${res.status}${typeof detail === "string" ? `: ${detail}` : ""}`);
    }
    const json = (await res.json()) as TelemSearchResponse;
    if (json.session_id) this.sessions.set(sessionId, json.session_id);
    const seen = new Set<string>();
    const out: Headline[] = [];
    for (const run of json.preprocessor_runs ?? []) {
      if (run.error) continue;
      for (const r of run.output_payload?.results ?? []) {
        if (!r.title) continue;
        const text = cleanHeadline(r.title);
        const key = text.toLowerCase();
        if (text.length < 12 || seen.has(key)) continue;
        seen.add(key);
        out.push({ text, source: sourceOf(r.url), publishedAt: r.publish_date ?? null });
      }
    }
    return out.slice(0, this.opts.max ?? 12);
  }
}
