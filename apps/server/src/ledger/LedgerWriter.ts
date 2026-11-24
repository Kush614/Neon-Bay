// Writes one ledger row per action to SQLite and appends it to data/ledger/<sessionId>.jsonl.
import { appendFileSync } from "node:fs";
import { LedgerRowSchema, type LedgerEntry } from "@neon-bay/shared";
import { ledgerJsonlPath } from "./paths.js";
import { insertEntry, openDb, type Db } from "./sqlite.js";

/** Extra destinations for ledger rows (e.g. the Bruin adapter in M8). */
export interface LedgerSink {
  write(entry: LedgerEntry): void | Promise<void>;
}

export class LedgerWriter {
  private readonly db: Db;
  private readonly jsonlPath: string;
  private readonly recent: LedgerEntry[] = [];

  constructor(
    readonly sessionId: string,
    private readonly sinks: LedgerSink[] = [],
    db?: Db,
  ) {
    this.db = db ?? openDb();
    this.jsonlPath = ledgerJsonlPath(sessionId);
  }

  /** Validate and persist one entry. Throws if the row does not match LedgerRow. */
  write(entry: LedgerEntry): LedgerEntry {
    const row = LedgerRowSchema.parse(entry.row);
    const clean: LedgerEntry = { ...entry, row };
    insertEntry(this.db, clean);
    appendFileSync(this.jsonlPath, JSON.stringify(row) + "\n");
    this.recent.push(clean);
    if (this.recent.length > 200) this.recent.shift();
    for (const s of this.sinks) {
      Promise.resolve(s.write(clean)).catch((e) => console.warn("[ledger] sink failed:", e));
    }
    return clean;
  }

  latest(n: number): LedgerEntry[] {
    return this.recent.slice(-n);
  }

  close(): void {
    this.db.close();
  }
}
