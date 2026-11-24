import { defineRoom, defineServer } from "colyseus";
import { DEFAULT_SERVER_PORT, ROOM_NAME } from "@neon-bay/shared";
import { HeistRoom } from "./rooms/HeistRoom.js";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(HeistRoom),
  },
});

await server.listen(port);
console.log(`[neon-bay] server listening on ws://localhost:${port}`);
