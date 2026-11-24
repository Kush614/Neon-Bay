# Neon Bay '86

Browser-based 3D co-op heist game where AI agent players double as playtesters. `SPEC.md` is the source of truth; `CLAUDE.md` holds the working rules.

```sh
pnpm install
pnpm dev               # server on :2567, client on http://localhost:5173, and the agent service
pnpm dev:client        # client only; runs offline if no server  (?cam=overview for an aerial view, ?name=Ana to pick a name)
pnpm typecheck && pnpm test
pnpm e2e               # two-browser smoke test (starts both servers if needed)
```

## Status

| Milestone | State |
| --- | --- |
| M1 Walkable grey-box world | done |
| M2 Multiplayer | done |
| M3 First agent | done |
| M4–M10 | not started |

## Decisions the spec left open

- **TypeScript 6.0, not 7.** `typescript-eslint` 8.74 supports TypeScript below 6.1, so 7.x would break `pnpm lint`.
- **Rapier pinned to 0.19.2.** That is the version `@react-three/rapier` 2.2 bundles; the server will use the same so prediction and authority run identical physics. Movement lives in `packages/shared/src/physics.ts` and takes the Rapier module as an argument.
- **Layout detail inside section 7.** Second Street is a road strip at x 0–8 with location buildings at x 8–50 (so the bank's back wall meets the alley at x = 50). Cross streets are 12 m wide. Each building footprint contains its spec centre but stops short of the cross streets, and each location has an `entrance` point outside its door for spawns and pathing. The marina sits on a pier (x 190–214, z 178–192) that crosses the shoreline; invisible sea walls and pier rails keep players out of the water.
- **Businesses.** The four fictional exchange businesses are Citrus Grove Juices, Palmetto Video Rental, Seaspray Telecom and Coquina Realty Trust.
- **Netcode.** Clients send a zod-validated `input` message (world-space direction, run flag, sequence number) each physics step while moving, on change, and as a 1 s heartbeat when idle. The server holds the latest input and simulates at 20 Hz with 3 sub-steps of 1/60 s, matching the client's prediction step. Input longer than 1 is clamped, and any per-step horizontal move faster than run speed (or 80% of it with a bag) is reverted and counted. Invalid messages get a `rejected` reply with the reason instead of a disconnect. The client reconciles by comparing the server position with its own prediction at the same input sequence, correcting gradually and snapping beyond 4 m. Colyseus 0.18's built-in `defineInput`/prediction framework was not used.
- **Colyseus dependency pinning.** `express` and `@colyseus/better-call` are root dev dependencies on purpose. Without them pnpm resolves two peer-variants of `@colyseus/core` (one through `colyseus`, one through `@colyseus/ws-transport`), the transport looks up rooms in a matchmaker that never created them, and every join fails with "seat reservation expired". Do not remove them.
- **Agents.** `apps/agents` spawns one `worker_threads` worker per persona (`AGENTS=rico` selects which). Each worker joins through `@colyseus/sdk` like a human client and sends only `action` messages. `move_to` becomes a recast navmesh path on the server, built from the same box data as the colliders, and the server steers the agent's body with ordinary movement input, so agents obey the same physics and speed checks as humans. `LLM_PROVIDER=stub` (the default) replays each persona's `stubScript`; real providers arrive with M5.
