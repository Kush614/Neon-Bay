import { burke, vega } from "./cops.js";
import { dex } from "./dex.js";
import { marisol } from "./marisol.js";
import { opal } from "./opal.js";
import { rico } from "./rico.js";
import type { PersonaDef } from "./types.js";

/** The crew and the two cops (SPEC.md section 13). */
export const PERSONAS: Record<string, PersonaDef> = { rico, marisol, dex, opal, vega, burke };
export type { PersonaDef } from "./types.js";
export { systemPrompt } from "./types.js";
