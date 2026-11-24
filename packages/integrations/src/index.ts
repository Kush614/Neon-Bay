import { BandCrewChannel } from "./band/BandCrewChannel.js";
import { StubCrewChannel, type CrewChannel } from "./crewChannel.js";
import { StubImageGenerator, type ImageGenerator } from "./imageGenerator.js";
import { StubNewsFeed, type NewsFeed } from "./newsFeed.js";
import { BruinLedgerSink, BruinReportSource } from "./bruin/warehouse.js";
import { StubLedgerSink, StubReportSource, type LedgerSink, type ReportSource } from "./ledgerSink.js";
import { TelemNewsFeed } from "./telem/TelemNewsFeed.js";
import { RunwareImageGenerator } from "./runware/RunwareImageGenerator.js";
import { RunwareModelGenerator } from "./runware/RunwareModelGenerator.js";
import { StubModelGenerator, type ModelGenerator } from "./modelGenerator.js";

export { BandCrewChannel, BandError, type BandCrewChannelOptions } from "./band/BandCrewChannel.js";
export { formatCrewMessage, StubCrewChannel, type CrewChannel, type CrewMessage, type CrewMessageKind } from "./crewChannel.js";

/**
 * CREW_CHANNEL=band uses BAND with BAND_API_KEY (an agent-scoped key) and optional
 * BAND_REST_URL. Anything else, or a missing key, gives the stub.
 */
export function createCrewChannel(env: Record<string, string | undefined> = process.env, log?: (line: string) => void): CrewChannel {
  if (env.CREW_CHANNEL === "band") {
    if (env.BAND_API_KEY) return new BandCrewChannel({ apiKey: env.BAND_API_KEY, ...(env.BAND_REST_URL ? { baseUrl: env.BAND_REST_URL } : {}), ...(log ? { log } : {}) });
    (log ?? console.warn)("[crew-channel] CREW_CHANNEL=band but BAND_API_KEY is not set; using the stub");
  }
  return new StubCrewChannel(log);
}

export { solidPng, StubImageGenerator, type GeneratedImage, type ImageGenerator, type ImageRequest } from "./imageGenerator.js";
export { RUNWARE_DEFAULT_MODEL, RunwareError, RunwareImageGenerator, type RunwareOptions } from "./runware/RunwareImageGenerator.js";

/** IMAGE_GENERATOR=runware uses Runware with RUNWARE_API_KEY (and optional RUNWARE_MODEL); otherwise the stub. */
export function createImageGenerator(env: Record<string, string | undefined> = process.env, log?: (line: string) => void): ImageGenerator {
  if (env.IMAGE_GENERATOR === "runware") {
    if (env.RUNWARE_API_KEY) return new RunwareImageGenerator({ apiKey: env.RUNWARE_API_KEY, ...(env.RUNWARE_MODEL ? { model: env.RUNWARE_MODEL } : {}) });
    (log ?? console.warn)("[image] IMAGE_GENERATOR=runware but RUNWARE_API_KEY is not set; using the stub");
  }
  return new StubImageGenerator(log);
}

export { StubModelGenerator, type GeneratedModel, type ModelGenerator, type ModelRequest } from "./modelGenerator.js";
export { RUNWARE_3D_MODELS, RunwareModelGenerator } from "./runware/RunwareModelGenerator.js";

export function createModelGenerator(env: Record<string, string | undefined> = process.env, log?: (line: string) => void): ModelGenerator {
  if (env.MODEL_GENERATOR === "runware") {
    if (env.RUNWARE_API_KEY) return new RunwareModelGenerator({ apiKey: env.RUNWARE_API_KEY });
    (log ?? console.warn)("[model] MODEL_GENERATOR=runware but RUNWARE_API_KEY is not set; using the stub");
  }
  return new StubModelGenerator(log);
}

export { STUB_HEADLINES, StubNewsFeed, type Headline, type NewsFeed } from "./newsFeed.js";
export { cleanHeadline, TELEM_DEFAULT_QUERIES, TelemError, TelemNewsFeed, type TelemNewsFeedOptions } from "./telem/TelemNewsFeed.js";

/** NEWS_FEED=telem uses Telem search with TELEM_API_KEY (TELEM_BASE_URL optional); otherwise the stub. */
export function createNewsFeed(env: Record<string, string | undefined> = process.env, log?: (line: string) => void): NewsFeed {
  if (env.NEWS_FEED === "telem") {
    if (env.TELEM_API_KEY) return new TelemNewsFeed({ apiKey: env.TELEM_API_KEY, ...(env.TELEM_BASE_URL ? { baseUrl: env.TELEM_BASE_URL } : {}) });
    (log ?? console.warn)("[news] NEWS_FEED=telem but TELEM_API_KEY is not set; using the stub");
  }
  return new StubNewsFeed();
}

export { REPORT_TABLES, StubLedgerSink, StubReportSource, type LedgerSink, type ReportSource, type ReportTable } from "./ledgerSink.js";
export { BruinLedgerSink, BruinReportSource, flatten, RAW_LEDGER_DDL } from "./bruin/warehouse.js";

/**
 * LEDGER_SINK=bruin writes to the Bruin pipeline's warehouse: BRUIN_WAREHOUSE (default
 * "data/warehouse.duckdb" under the repo root; "md:neon_bay" for MotherDuck, which also needs
 * MOTHERDUCK_TOKEN). Anything else gives the stub.
 */
export function warehousePath(env: Record<string, string | undefined>, repoRoot: string): string {
  const w = env.BRUIN_WAREHOUSE || "data/warehouse.duckdb";
  return w.startsWith("md:") || w.startsWith("/") ? w : `${repoRoot.replace(/\/$/, "")}/${w}`;
}

export function createLedgerSink(env: Record<string, string | undefined>, repoRoot: string, log?: (line: string) => void): LedgerSink {
  if (env.LEDGER_SINK === "bruin") {
    const path = warehousePath(env, repoRoot);
    if (!path.startsWith("md:") || env.MOTHERDUCK_TOKEN) return new BruinLedgerSink(path);
    (log ?? console.warn)("[ledger-sink] BRUIN_WAREHOUSE is MotherDuck but MOTHERDUCK_TOKEN is not set; using the stub");
  }
  return new StubLedgerSink();
}

export function createReportSource(env: Record<string, string | undefined>, repoRoot: string): ReportSource {
  return env.LEDGER_SINK === "bruin" ? new BruinReportSource(warehousePath(env, repoRoot)) : new StubReportSource();
}
