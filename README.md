# Neon Bay '86

Browser-based 3D co-op heist game where AI agent players double as playtesters. `SPEC.md` is the source of truth; `CLAUDE.md` holds the working rules.

```sh
pnpm install
pnpm dev               # server on :2567, client on http://localhost:5173, and the agent service
pnpm dev:client        # client only; runs offline if no server  (?cam=overview for an aerial view, ?name=Ana to pick a name)
pnpm typecheck && pnpm test
pnpm e2e               # two-browser smoke test (starts both servers if needed)
pnpm ledger:export -- --session <id>   # no --session lists recorded sessions
pnpm sim -- --seed 1   # full headless session (stubbed models unless LLM_PROVIDER says otherwise); -v for a trace
MIN_HUMANS=1 pnpm dev:server           # let one human start the heist while testing alone (the spec's default is 2)
pnpm capture -- --frames 200 --seed 1  # synthetic labelled dataset (see below); writes data/captures/<run>/
```

## Status

| Milestone | State |
| --- | --- |
| M1 Walkable grey-box world | done |
| M2 Multiplayer | done |
| M3 First agent | done |
| M4 Ledger | done |
| M5 Full crew and rules | done |
| M6 Police, laundering, exchange, exploit | done (rules, agents and sync; client HUD for stakes and bribes still to come) |
| M7–M10 | not started |

## Synthetic capture demo (outside the spec)

An opt-in extra, not one of the SPEC milestones. It borrows the method of *Driving in the Matrix* (Johnson-Roberson et al., ICRA 2017, arXiv:1610.01983): a game engine knows what it drew, so it can label its own frames.

`pnpm capture` starts the server with the stubbed agent crew playing a live heist, opens the client headless at `?capture=1`, and renders N frames. For each frame the client picks one of six lighting and fog presets (golden hour, noon, dusk, night, overcast, sea fog) and a street, dashcam or elevated camera. It then renders an instance-ID pass, where every car and pedestrian is drawn in a flat ID colour, and reads it back to get:

- pixel-exact instance masks and tight 2D boxes from the visible pixels;
- occlusion: visible pixels divided by the pixels the object covers when rendered alone;
- truncation: how much of the projected 3D box falls outside the image;
- KITTI 3D fields: dimensions, location in camera coordinates, `rotation_y` and `alpha`.

The output is `image_2/` + `label_2/` (KITTI object format), `mask/`, `coco.json`, `stats.json` and a self-contained `index.html` viewer. The viewer shows box overlays, a mask toggle, a box-centre heatmap and a labels-per-image histogram, mirroring the paper's figures 5 and 6. Seeded client-only ambient cars and pedestrians add variety; the server never sees them. Objects under 30 visible pixels or 10 px tall are not labelled.

It runs at about 1.5 frames/s on a CPU (SwiftShader). It makes no realism claim: this is grey-box geometry, so the point is the pipeline, not a training set that transfers to real roads.

## Decisions the spec left open

- **M6 money.** Crew start with 10,000 clean cash so stakes can be bought in `prepare`; cops start with 0. `launder` converts all dirty cash at the nightclub entrance (8 m), in any phase from plan to payout. `EXPLOIT_ENABLED` defaults to on, so the griefer has something to find; set it to `false` to close it.
- **M6 exchange.** `buy_stake` and `sell_stake` amounts are cash values, traded at the exchange office. Orders fill at the price after their own impact, so a player can't pump a stake and sell it back at a profit; otherwise that would be a second, unplanned money printer. The crash happens once a session and ramps linearly over 10 s.
- **M6 police.** Arrests are only possible once the alarm sounds. A cop starts an arrest within 8 m and the server chases the target; the arrest lands after 3 s continuously within 2 m on foot, and fails past 12 m or after 12 s. Arrested players are frozen in place for 30 s and drop their bag on the ground, where anyone in the crew can pick it up. A bribe is a deal offered to a cop, worth splitPercent of the briber's total cash. The cop takes it with `accept_bribe`; it is paid at once, in kind, and that cop can no longer arrest the briber. Burke's 15,000 threshold lives in his persona, not in the rules. `tip_off_police` pays once per player. A roadblock goes on the nearest road edge for 60 s and closes that edge to `drive_to` routing. `call_backup` broadcasts the cop's position, with a 30 s cooldown.

- **TypeScript 6.0, not 7.** `typescript-eslint` 8.74 supports TypeScript below 6.1, so 7.x would break `pnpm lint`.
- **Rapier pinned to 0.19.2.** That is the version `@react-three/rapier` 2.2 bundles; the server will use the same so prediction and authority run identical physics. Movement lives in `packages/shared/src/physics.ts` and takes the Rapier module as an argument.
- **Layout detail inside section 7.** Second Street is a road strip at x 0–8 with location buildings at x 8–50 (so the bank's back wall meets the alley at x = 50). Cross streets are 12 m wide. Each building footprint contains its spec centre but stops short of the cross streets, and each location has an `entrance` point outside its door for spawns and pathing. The marina sits on a pier (x 190–214, z 178–192) that crosses the shoreline; invisible sea walls and pier rails keep players out of the water.
- **Businesses.** The four fictional exchange businesses are Citrus Grove Juices, Palmetto Video Rental, Seaspray Telecom and Coquina Realty Trust.
- **Netcode.** Clients send a zod-validated `input` message (world-space direction, run flag, sequence number) each physics step while moving, on change, and as a 1 s heartbeat when idle. The server holds the latest input and simulates at 20 Hz with 3 sub-steps of 1/60 s, matching the client's prediction step. Input longer than 1 is clamped, and any per-step horizontal move faster than run speed (or 80% of it with a bag) is reverted and counted. Invalid messages get a `rejected` reply with the reason instead of a disconnect. The client reconciles by comparing the server position with its own prediction at the same input sequence, correcting gradually and snapping beyond 4 m. Colyseus 0.18's built-in `defineInput`/prediction framework was not used.
- **Colyseus dependency pinning.** `express` and `@colyseus/better-call` are root dev dependencies on purpose. Without them pnpm resolves two peer-variants of `@colyseus/core` (one through `colyseus`, one through `@colyseus/ws-transport`), the transport looks up rooms in a matchmaker that never created them, and every join fails with "seat reservation expired". Do not remove them.
- **Agents.** `apps/agents` spawns one `worker_threads` worker per persona (`AGENTS=rico` selects which). Each worker joins through `@colyseus/sdk` like a human client and sends only `action` messages. `move_to` becomes a recast navmesh path on the server, built from the same box data as the colliders, and the server steers the agent's body with ordinary movement input, so agents obey the same physics and speed checks as humans. `LLM_PROVIDER=stub` (the default) plays each persona's deterministic stub policy; `LLM_PROVIDER=anthropic` uses Claude (`claude-opus-5-5`, `LLM_MODEL`/`LLM_EFFORT` override) at low effort to fit the 4 s cadence, with the persona prompt cached and the API's server-side refusal fallback on.
- **Ledger rows.** Agents send each action as `{ action, meta }`, where `meta` carries the reason, trust changes, harness, latency and a past-session flag. The server owns tick, phase and position, so it writes the row: one per action received, including `wait` and rejected actions. SQLite also stores the outcome (`ok`, `result`) and the past-session flag beside the spec's `LedgerRow`; the JSONL file holds exactly `LedgerRow`. Humans' rows always have an empty reason and no harness. Data lives in `data/` (override with `NEON_BAY_DATA_DIR`; tests use a temp dir).
- **Speech.** `say` reaches players within 30 m and `whisper` reaches only its recipient. Both were added in M4, because a model reply with `say` would otherwise be rejected, and a rejection triggers an immediate re-decide.
- **GameSession.** All rules live in `apps/server/src/game/GameSession.ts`, which has no networking. `HeistRoom` drives it in real time and copies it into the Colyseus schema; `pnpm sim` drives it with in-process agents on a virtual clock (a 510 s session runs in about 2 s). Agents talk to either through one `AgentTransport` interface.
- **Lobby.** Humans send `ready`; the lobby ends when `MIN_HUMANS` (default 2, per the spec) are ready. The headless sim uses 0. Players can walk around in the lobby.
- **Bank interior.** The bank is a hollow shell with a front door on Second Street, a back door onto the alley, and a partition with a door into the vault room. The vault panel sits at (44, −76) and counts anyone within 2.5 m. The navmesh covers the interior.
- **Deals.** `splitPercent` is the share of the proposer's dirty cash that goes to the recipient when deals settle at the start of `payout`. Only the recipient can accept or reject. Deals are sent only to their two parties, never broadcast.
- **Bags.** A bag is banked as 50,000 dirty cash the moment its carrier is within 7 m of the marina, during `heist` or `getaway`. A bag still carried when the session ends is lost; a bag carried by a player who disconnects goes back in the vault. Laundering arrives in M6, so M5 scores (clean cash plus stakes) are all 0.
- **Vehicles.** Spec actions have no enter/exit, so `drive_to` gets into the nearest free car within 4 m, and `move_to` from a car gets out first. Humans press E (`use_vehicle` message) and drive with W/S/A/D, sent as `throttle`/`steer` on the input message. Cars are kinematic arcade boxes with a road-graph autopilot that brakes into its stops; the client renders them interpolated (no prediction while driving) with kinematic colliders, so walking prediction still bumps into them.
- **Cars at the car park** sit in a row the pedestrian navmesh treats as blocked, and path following sidesteps when it stalls against a car or another player.
