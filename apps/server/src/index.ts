import { DEFAULT_SERVER_PORT } from "@neon-bay/shared";
import { createGameServer } from "./app.js";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const server = createGameServer();
await server.listen(port);
console.log(`[neon-bay] server listening on ws://localhost:${port}`);
