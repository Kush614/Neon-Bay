// NewsFeed (SPEC.md section 16): headlines for the in-game radio.
// Select with NEWS_FEED=telem|stub (stub by default); the game runs fully stubbed.

export interface Headline {
  text: string;
  source: string | null;
  publishedAt: string | null;
}

export interface NewsFeed {
  readonly name: string;
  /** A handful of headlines for one game session. Never throws into the game: callers catch. */
  headlines(sessionId: string): Promise<Headline[]>;
}

/** Invented local headlines; never touches the network. */
export const STUB_HEADLINES: readonly string[] = [
  "Neon Bay pier reopens after storm repairs; marina traffic back to normal",
  "First Coral Trust posts record deposits as tourist season peaks",
  "Velvet Static 96.6 FM hosts a midnight synth marathon on the beach",
  "Harbor police add two cruisers to the Second Street patrol",
  "Exchange office reports brisk trading in Palmetto Video stock",
  "King tide expected along the beach strip this weekend",
];

export class StubNewsFeed implements NewsFeed {
  readonly name = "stub";
  readonly calls: string[] = [];
  async headlines(sessionId: string): Promise<Headline[]> {
    this.calls.push(sessionId);
    return STUB_HEADLINES.map((text) => ({ text, source: null, publishedAt: null }));
  }
}
