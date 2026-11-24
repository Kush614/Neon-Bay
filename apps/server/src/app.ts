import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME } from "@neon-bay/shared";
import { HeistRoom } from "./rooms/HeistRoom.js";

/** Build the game server. Used by the entry point and by in-process integration tests. */
export function createGameServer() {
  return defineServer({
    rooms: {
      [ROOM_NAME]: defineRoom(HeistRoom),
    },
  });
}
