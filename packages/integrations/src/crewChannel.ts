// CrewChannel (SPEC.md section 16): the crew's private channel for planning and deals.
// The server mirrors crew whispers, deals and betrayals into it. Select the adapter with
// CREW_CHANNEL=band|stub; the game runs fully stubbed (the default).

export type CrewMessageKind = "whisper" | "deal" | "betrayal" | "system";

export interface CrewMessage {
  kind: CrewMessageKind;
  fromName: string;
  /** The other party, for whispers and deals. */
  toName: string | null;
  text: string;
}

export interface CrewChannel {
  /** Adapter name, for logs and INTEGRATIONS.md. */
  readonly name: string;
  /** Open the channel for one session. */
  open(sessionId: string): Promise<void>;
  post(message: CrewMessage): Promise<void>;
  close(): Promise<void>;
}

/** Records every call and logs it; never touches the network. */
export class StubCrewChannel implements CrewChannel {
  readonly name = "stub";
  readonly calls: { method: "open" | "post" | "close"; arg?: unknown }[] = [];
  constructor(private readonly log: (line: string) => void = () => {}) {}

  async open(sessionId: string): Promise<void> {
    this.calls.push({ method: "open", arg: sessionId });
    this.log(`[crew-channel:stub] open ${sessionId}`);
  }

  async post(message: CrewMessage): Promise<void> {
    this.calls.push({ method: "post", arg: message });
    this.log(`[crew-channel:stub] ${formatCrewMessage(message)}`);
  }

  async close(): Promise<void> {
    this.calls.push({ method: "close" });
  }
}

export function formatCrewMessage(m: CrewMessage): string {
  switch (m.kind) {
    case "whisper":
      return `${m.fromName} → ${m.toName}: ${m.text}`;
    case "deal":
      return `🤝 ${m.fromName} → ${m.toName}: ${m.text}`;
    case "betrayal":
      return `🗡️ ${m.fromName}: ${m.text}`;
    case "system":
      return m.text;
  }
}
