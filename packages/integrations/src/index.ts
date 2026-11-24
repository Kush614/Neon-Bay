import { BandCrewChannel } from "./band/BandCrewChannel.js";
import { StubCrewChannel, type CrewChannel } from "./crewChannel.js";

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
