import { BandCrewChannel } from "./band/BandCrewChannel.js";
import { StubCrewChannel, type CrewChannel } from "./crewChannel.js";
import { StubImageGenerator, type ImageGenerator } from "./imageGenerator.js";
import { RunwareImageGenerator } from "./runware/RunwareImageGenerator.js";

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
