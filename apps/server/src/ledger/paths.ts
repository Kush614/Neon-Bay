import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo-level data directory; override with NEON_BAY_DATA_DIR (tests use a temp dir). */
export function dataDir(): string {
  const dir = process.env.NEON_BAY_DATA_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../../data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ledgerDbPath(): string {
  return join(dataDir(), "neon-bay.sqlite");
}

export function ledgerJsonlPath(sessionId: string): string {
  const dir = join(dataDir(), "ledger");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId}.jsonl`);
}
