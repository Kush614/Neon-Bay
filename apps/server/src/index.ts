import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load the repo-root .env (API keys stay server-side) when it exists; real env vars win.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
import { DEFAULT_SERVER_PORT } from "@neon-bay/shared";
import { createGameServer } from "./app.js";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const server = createGameServer();
await server.listen(port);
console.log(`[neon-bay] server listening on ws://localhost:${port}`);
