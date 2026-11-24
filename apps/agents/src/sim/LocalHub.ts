// In-process transport: agents talk to a GameSession directly, with no network.
import { MSG, ReadyMessageSchema, type JoinOptions } from "@neon-bay/shared";
import type { GameSession, SessionOutput } from "@neon-bay/server/headless";
import type { ObservedState } from "../runtime/observation.js";
import type { AgentTransport, Connect } from "../runtime/transport.js";

type Handler = (payload: never) => void;

export class LocalHub {
  private session: GameSession | null = null;
  private readonly handlers = new Map<string, Map<string, Handler[]>>();
  private nextId = 1;

  /** Pass this as the session's output so messages reach the agents. */
  readonly output: SessionOutput = {
    toPlayer: (id, type, payload) => this.deliver(id, type, payload),
    broadcast: (type, payload) => {
      for (const id of this.handlers.keys()) this.deliver(id, type, payload);
    },
  };

  attach(session: GameSession): void {
    this.session = session;
  }

  // Deliver after the current call stack, as a network would, so agents never re-enter a tick.
  private deliver(id: string, type: string, payload: unknown): void {
    const list = this.handlers.get(id)?.get(type);
    if (!list) return;
    queueMicrotask(() => {
      for (const h of list) h(payload as never);
    });
  }

  private state(): ObservedState | null {
    const s = this.session;
    if (!s) return null;
    const g = s.state;
    return {
      phase: g.phase,
      phaseTimeLeft: g.phaseTimeLeft,
      alarm: g.alarm,
      vault: { ...g.vault },
      players: [...g.players.keys()].flatMap((id) => {
        const v = s.playerView(id);
        return v ? [{ ...v, vehicleId: v.vehicleId ?? "" }] : [];
      }),
      vehicles: s.sim.vehicleSnapshots().map((v) => ({ id: v.id, label: s.sim.vehicles.get(v.id)!.spec.label, position: v.position, speed: v.speed, driverId: v.driverId ?? "" })),
    };
  }

  readonly connect: Connect = async (options: JoinOptions) => {
    const session = this.session;
    if (!session) throw new Error("LocalHub has no session attached");
    const id = `local-${this.nextId++}`;
    this.handlers.set(id, new Map());
    session.addPlayer(id, options);
    const leaveCbs: (() => void)[] = [];
    const transport: AgentTransport = {
      sessionId: id,
      state: () => this.state(),
      send: (type, payload) => {
        if (type === MSG.action) {
          const res = session.submit(id, payload);
          this.deliver(id, MSG.actionResult, res);
        } else if (type === MSG.input) {
          const rej = session.input(id, payload);
          if (rej) this.deliver(id, MSG.rejected, rej);
        } else if (type === MSG.ready) {
          const r = ReadyMessageSchema.safeParse(payload);
          if (r.success) session.setReady(id, r.data.ready);
        }
      },
      onMessage: (type, cb) => {
        const m = this.handlers.get(id)!;
        m.set(type, [...(m.get(type) ?? []), cb]);
      },
      onLeave: (cb) => void leaveCbs.push(cb),
      ready: async () => {},
      leave: async () => {
        this.handlers.delete(id);
        session.removePlayer(id);
      },
    };
    return transport;
  };
}
