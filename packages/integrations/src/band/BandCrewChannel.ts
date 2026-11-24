// BAND (https://app.band.ai) implementation of CrewChannel.
// Endpoints and shapes come from Band's REST client (band_rest 0.0.57, agent API):
//   GET  /api/v1/agent/me                          -> { data: { id, handle, owner_uuid, ... } }
//   POST /api/v1/agent/chats {chat:{title}}        -> { data: { id, ... } }  (agent owns the room)
//   POST /api/v1/agent/chats/:id/participants {participant:{participant_id, role}}
//   POST /api/v1/agent/chats/:id/messages {message:{content, mentions:[{id, handle, name}]}}
// Auth is an agent-scoped key in the X-API-Key header. Band requires every message to
// @mention someone, so each session room adds the agent's owner and mentions them.
import { formatCrewMessage, type CrewChannel, type CrewMessage } from "../crewChannel.js";

export interface BandCrewChannelOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

interface Owner {
  id: string;
  handle: string;
}

export class BandError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Band ${path} failed with HTTP ${status}`);
  }
}

export class BandCrewChannel implements CrewChannel {
  readonly name = "band";
  private readonly base: string;
  private readonly fetch: typeof fetch;
  private readonly log: (line: string) => void;
  private chatId: string | null = null;
  private owner: Owner | null = null;
  /** Posts go out one at a time, in order, without blocking the game. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly opts: BandCrewChannelOptions) {
    this.base = (opts.baseUrl ?? "https://app.band.ai").replace(/\/$/, "");
    this.fetch = opts.fetch ?? fetch;
    this.log = opts.log ?? ((line) => console.log(line));
  }

  get roomId(): string | null {
    return this.chatId;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(`${this.base}/api/v1${path}`, {
      method,
      headers: { "X-API-Key": this.opts.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Never log response bodies: they can echo identifiers we don't need in logs.
    if (!res.ok) throw new BandError(res.status, path);
    const json = (await res.json()) as { data?: T } & T;
    return (json.data ?? json) as T;
  }

  async open(sessionId: string): Promise<void> {
    const me = await this.call<{ id: string; handle: string; owner_uuid: string }>("GET", "/agent/me");
    // The owner's handle is the first segment of the agent's handle ("owner/agent").
    this.owner = { id: me.owner_uuid, handle: me.handle.split("/")[0] ?? me.handle };
    const chat = await this.call<{ id: string }>("POST", "/agent/chats", { chat: { title: `Neon Bay '86 crew · ${sessionId}` } });
    this.chatId = chat.id;
    await this.call("POST", `/agent/chats/${chat.id}/participants`, { participant: { participant_id: this.owner.id, role: "member" } });
    this.log(`[crew-channel:band] room ${chat.id} open for session ${sessionId}`);
    await this.send(`Crew channel open for session ${sessionId}. Whispers, deals and betrayals show up here.`);
  }

  private async send(text: string): Promise<void> {
    if (!this.chatId || !this.owner) throw new Error("BandCrewChannel.open() must succeed before posting");
    const o = this.owner;
    await this.call("POST", `/agent/chats/${this.chatId}/messages`, {
      message: { content: `@${o.handle} ${text}`, mentions: [{ id: o.id, handle: o.handle, name: o.handle }] },
    });
  }

  post(message: CrewMessage): Promise<void> {
    this.queue = this.queue.then(() => this.send(formatCrewMessage(message))).catch((e: unknown) => {
      this.log(`[crew-channel:band] post failed: ${e instanceof Error ? e.message : String(e)}`);
    });
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue;
  }
}
