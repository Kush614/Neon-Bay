import { dex } from "./dex.js";
import { marisol } from "./marisol.js";
import { opal } from "./opal.js";
import { rico } from "./rico.js";
import type { PersonaDef } from "./types.js";

/** The crew. Cops arrive in M6. */
export const PERSONAS: Record<string, PersonaDef> = { rico, marisol, dex, opal };
export type { PersonaDef } from "./types.js";
export { systemPrompt } from "./types.js";
