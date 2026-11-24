// How an agent talks to the game: a Colyseus room in production, a GameSession in the headless sim.
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, type JoinOptions } from "@neon-bay/shared";
import type { ObservedPlayer, ObservedState, ObservedVehicle } from "./observation.js";

export interface AgentTransport {
  readonly sessionId: string;
  /** The latest synced state, or null before the first state arrives. */
  state(): ObservedState | null;
  send(type: string, payload: unknown): void;
  onMessage(type: string, cb: (payload: never) => void): void;
  onLeave(cb: () => void): void;
  /** Resolves once the state contains this agent's own player. */
  ready(): Promise<void>;
  leave(): Promise<void>;
}

export type Connect = (options: JoinOptions) => Promise<AgentTransport>;

/** The room state as the SDK decodes it (MapSchema behaves like a Map). */
interface RoomState {
  phase: string;
  phaseTimeLeft: number;
  alarm: boolean;
  vaultProgress: number;
  vaultOpen: boolean;
  bagsLeft: number;
  players: Map<string, ObservedPlayer>;
  vehicles: Map<string, ObservedVehicle>;
}

export function colyseusConnect(serverUrl: string): Connect {
  return async (options) => {
    const room: Room<unknown, RoomState> = await new Client(serverUrl).joinOrCreate<RoomState>(ROOM_NAME, options);
    const state = (): ObservedState | null => {
      const s = room.state;
      if (!s?.players) return null;
      return {
        phase: s.phase,
        phaseTimeLeft: s.phaseTimeLeft,
        alarm: s.alarm,
        vault: { progress: s.vaultProgress, open: s.vaultOpen, bagsLeft: s.bagsLeft },
        players: s.players.values(),
        vehicles: s.vehicles?.values() ?? [],
      };
    };
    const hasSelf = () => !!room.state?.players?.get(room.sessionId);
    return {
      sessionId: room.sessionId,
      state,
      send: (type, payload) => room.send(type, payload),
      onMessage: (type, cb) => void room.onMessage(type, cb as (p: unknown) => void),
      onLeave: (cb) => void room.onLeave(cb),
      ready: () =>
        new Promise<void>((resolve) => {
          if (hasSelf()) return resolve();
          const done = () => {
            if (!hasSelf()) return;
            room.onStateChange.remove(done);
            resolve();
          };
          room.onStateChange(done);
        }),
      leave: async () => {
        await room.leave().catch(() => {});
      },
    };
  };
}
