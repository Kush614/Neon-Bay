# Neon Bay '86 — Build Spec for Claude Code

This file is the single source of truth for the build. Read it fully before writing code. Work through the milestones in section 17 in order, and do not start a milestone until the previous one passes its acceptance checks.

---

## 1. Summary

Neon Bay '86 is a browser-based 3D co-op heist game set on an original 1980s beachfront. Two human players and four AI agent players share one world as equals. Each agent is also a playtester with a persona, and every decision it makes is written to a ledger. The ledger feeds a playtest report for game studios, which is the product being demonstrated.

- Hackathon: Multiplayer AI Hackathon, Track 2 (Co-op Multiplayer Game)
- Session: one heist, about 8 minutes
- Deliverables: playable web build, decision ledger, playtest report, 2-minute demo video

## 2. Hard constraints

These override everything else in this file.

1. **Original work only.** Do not copy, imitate or reference any existing game's map, buildings, characters, vehicles, logos, radio stations, fonts or names. The visual reference is the real Miami Beach art deco district in the 1980s. Do not use real brand names or real car makes.
2. **Licensed assets only.** Use assets that are CC0 or otherwise openly licensed, or generated for this project. Record every third-party asset and its licence in `ASSETS.md`.
3. **Hackathon requirements.** The build must always have:
   - at least 2 human players and 3 agent players in one visual world
   - a visible character for every agent
   - characters that move and act on screen
   - agents with their own goals and memory
   - at least one major world event caused by agents alone
   - a visible decision ledger showing what each agent decided and why
4. **Server authority.** Clients send inputs only. The server owns positions, money and inventory.
5. **No secrets in the client.** All API keys live in server-side environment variables.
6. **Do not guess sponsor APIs.** For each sponsor integration, read the sponsor's current documentation first. If the docs are unavailable, leave the stub in place and add a note to `INTEGRATIONS.md`.

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript everywhere, strict mode |
| Package manager | pnpm workspaces |
| Client | Vite, React, Three.js, @react-three/fiber, @react-three/drei |
| Post-processing | @react-three/postprocessing |
| Physics | Rapier (@react-three/rapier on the client, @dimforge/rapier3d-compat on the server) |
| Navigation | recast-navigation for pedestrians, a hand-authored waypoint graph for roads |
| Multiplayer | Colyseus, server-authoritative, 20 Hz patch rate |
| Agent runtime | Node service, one worker per agent |
| State on client | zustand |
| Ledger storage | SQLite via better-sqlite3, plus JSONL export |
| Tests | vitest for logic, Playwright for one end-to-end smoke test |
| Assets | glTF (.glb) with Meshopt compression, KTX2 textures |

Use the latest stable version of each library and check its current docs before using an API you are unsure of.

## 4. Repository layout

```
neon-bay/
  SPEC.md
  CLAUDE.md
  ASSETS.md
  INTEGRATIONS.md
  package.json
  pnpm-workspace.yaml
  .env.example
  apps/
    client/            # Vite + React Three Fiber
      src/
        scene/         # World, Sky, Ocean, Buildings, Props, Lighting, Effects
        entities/      # Character, Vehicle, NameTag, SpeechIndicator
        net/           # Colyseus client, interpolation
        ui/            # HUD, LedgerPanel, PhaseBanner, ChatPanel, ReportLink
        input/         # keyboard, gamepad
        audio/         # positional voice, radio, ambience
    server/            # Colyseus game server
      src/
        rooms/HeistRoom.ts
        sim/           # movement, physics, navmesh, vehicles
        rules/         # phases, heist, laundering, exchange, police
        ledger/        # writer, sqlite, export
    agents/            # agent workers
      src/
        runtime/       # loop, observation builder, action parser
        personas/      # one file per persona
        memory/        # session log, trust scores, cross-session summaries
        llm/           # provider interface and implementations
    report/            # playtest report generator and static dashboard
  packages/
    shared/            # types, constants, world layout, action schema
    integrations/      # one adapter per sponsor, all behind interfaces
  assets/
    models/  textures/  hdri/  audio/
```

## 5. Commands

Implement these scripts in the root `package.json`:

| Command | Does |
| --- | --- |
| `pnpm dev` | Runs client, server and agents together |
| `pnpm dev:client` / `dev:server` / `dev:agents` | Runs one app |
| `pnpm test` | Runs vitest across the workspace |
| `pnpm e2e` | Runs the Playwright smoke test |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | ESLint |
| `pnpm report -- --session <id>` | Builds the playtest report for a session |
| `pnpm ledger:export -- --session <id>` | Writes the ledger as JSONL |

Run `pnpm typecheck && pnpm test` before finishing any milestone.

## 6. Shared types

Define these in `packages/shared` and import them everywhere. Do not redefine them per app.

```ts
export type PlayerId = string;
export type Vec3 = { x: number; y: number; z: number };

export type Phase = "lobby" | "plan" | "prepare" | "heist" | "getaway" | "payout" | "ended";

export type Role = "driver" | "hacker" | "muscle" | "fixer" | "cop" | "human";
export type Persona = "speedrunner" | "explorer" | "griefer" | "newcomer" | "none";

export interface PlayerState {
  id: PlayerId;
  name: string;
  kind: "human" | "agent";
  role: Role;
  persona: Persona;
  position: Vec3;
  heading: number;          // radians
  animation: AnimationName;
  vehicleId: string | null;
  dirtyCash: number;
  cleanCash: number;
  carryingBag: boolean;
  arrested: boolean;
  speaking: boolean;
}

export type AnimationName =
  | "idle" | "walk" | "run" | "talk" | "argue" | "point" | "hands_up"
  | "enter_car" | "drive" | "carry_bag" | "celebrate" | "fall";

export type Action =
  | { type: "move_to"; target: LocationId | Vec3 }
  | { type: "drive_to"; target: LocationId | Vec3 }
  | { type: "say"; text: string }
  | { type: "whisper"; to: PlayerId; text: string }
  | { type: "propose_deal"; to: PlayerId; terms: DealTerms }
  | { type: "accept"; dealId: string }
  | { type: "reject"; dealId: string }
  | { type: "betray" }
  | { type: "tip_off_police" }
  | { type: "buy_stake"; business: BusinessId; amount: number }
  | { type: "sell_stake"; business: BusinessId; amount: number }
  | { type: "launder" }
  | { type: "grab_bag" }
  | { type: "flee" }
  | { type: "report_issue"; issue: Issue }
  | { type: "wait" };

export interface DealTerms { splitPercent: number; note: string }

export interface Issue {
  type: "bug" | "exploit" | "stuck" | "confusing" | "balance";
  severity: "low" | "medium" | "high";
  description: string;
}

export interface LedgerRow {
  sessionId: string;
  tick: number;
  timestamp: string;        // ISO 8601
  phase: Phase;
  actorId: PlayerId;
  actorName: string;
  actorKind: "human" | "agent";
  persona: Persona;
  action: Action;
  reason: string;           // one sentence; empty for humans
  position: Vec3;
  trustChanges: Record<PlayerId, number>;
  issue: Issue | null;
  harness: string | null;
  latencyMs: number | null;
}
```

## 7. World layout

Units are metres. `+x` is east (toward the ocean), `-z` is north, `y` is up. The playable area is `x` from 0 to 258 and `z` from -200 to 200.

| Band | x range | Contents |
| --- | --- | --- |
| Second street | 0 – 50 | Bank, nightclub, pawn shop, exchange office, police station |
| Service alley | 50 – 58 | Bins, back doors, fire escapes |
| Hotel row | 58 – 88 | 12 art deco hotels, 3 to 5 storeys |
| Beachfront avenue | 88 – 108 | Two lanes, kerbside parking, lamps, cafe terraces |
| Park promenade | 108 – 138 | Palm rows, winding path, low wall, benches |
| Beach | 138 – 198 | Sand, lifeguard towers, umbrellas, loungers |
| Ocean | 198 – 258 | Water, two moored boats, distant skyline backdrop |

Four cross streets connect the avenue to second street at `z` = -150, -50, 50 and 150.

| Location id | Centre (x, z) | Notes |
| --- | --- | --- |
| `police_station` | (25, -170) | Cop agents spawn here |
| `bank` | (25, -60) | Lobby, vault room, back door onto the alley at x = 50 |
| `nightclub` | (25, 40) | Crew spawn and laundering point |
| `pawn_shop` | (25, 90) | Scenery in the first version |
| `exchange` | (25, 120) | Stake trading |
| `car_park` | (98, 0) | Getaway cars spawn here |
| `marina` | (205, 185) | Getaway point, with the speedboat |

Store this layout as data in `packages/shared/world.ts`. The client and server both build from it.

**Building kit.** Create 6 hotel facade models and reuse them with different heights, colours and signs to fill 12 plots. Each facade should use real art deco features: stepped rooflines, rounded corners, horizontal banding, porthole windows, vertical sign fins, pastel paint with white trim. Until models exist, generate placeholder boxes from the layout data so the game is playable from milestone 1.

**Props.** Palms (3 variants), street lamps, parking meters, phone booths, newspaper boxes, cafe tables, 20 neon signs, 6 billboards, bins, traffic lights. Draw repeated props with instancing.

## 8. Graphics

The look is stylised realism at a fixed golden-hour-to-dusk time of day.

**Lighting**
- HDRI sunset sky for background and image-based lighting.
- One low directional sun with cascaded shadow maps (3 cascades, 2048 px).
- Baked ambient occlusion on static buildings where assets provide it.
- Neon signs are emissive meshes. Add real point lights only at the bank and nightclub.
- Over the session, lower the sun and raise neon intensity so the getaway happens at night. Drive this from a single `timeOfDay` value from 0 to 1.

**Materials**
- PBR throughout. Textures at most 2048 px, compressed to KTX2.
- Reflective avenue surface so neon mirrors on the road. Use drei's `MeshReflectorMaterial` on the avenue only.

**Water and vegetation**
- Ocean shader: two scrolling normal maps, depth-based colour gradient, shoreline foam.
- Palm sway in a vertex shader.

**Post-processing, in this order**
1. Ambient occlusion
2. Bloom, with a threshold so only neon and the sun bloom
3. Depth of field, cinematic cameras only
4. ACES tone mapping
5. Colour grade with a teal-and-magenta lookup table
6. Vignette and light film grain

**Quality settings.** Provide `low`, `medium` and `high` presets, selectable from the pause menu and by `?quality=` in the URL. `low` disables reflections, ambient occlusion and depth of field.

**Performance budget**

| Measure | Target |
| --- | --- |
| Frame rate | 60 fps at `medium` on a mid-range laptop GPU |
| Draw calls | Under 300 |
| Triangles on screen | Under 1.5 million |
| Initial download | Under 40 MB |

## 9. Characters, vehicles, camera

- 6 playable character models sharing one skeleton, in 1980s clothing, about 15,000 triangles each.
- 20 ambient pedestrians from 4 base models, wandering on the navmesh.
- All animations listed in `AnimationName` must exist and cross-fade over 0.2 s.
- While `speaking` is true, flap the jaw bone by voice volume and show a speech indicator above the head. Always show a name tag.
- 4 original boxy cars and 1 speedboat. Arcade handling with a kinematic controller: no gears, damage or tyre simulation.
- Third-person follow camera on foot and in vehicles. A scripted orbit camera plays for the intro and the ending.
- Controls: WASD to move, Shift to run, E to interact or enter a vehicle, T for text chat, V for push-to-talk, Tab for the ledger panel.

## 10. Networking

- One Colyseus room type, `HeistRoom`, with a maximum of 8 players (2 humans, 4 crew agents, 2 cop agents).
- The server simulates at 20 Hz and sends state patches at 20 Hz. The client interpolates remote entities with a 100 ms buffer and predicts the local player.
- Humans send movement input each frame and discrete `Action` messages.
- Agents connect with the same client SDK and send only `Action` messages. The server turns `move_to` and `drive_to` into paths and moves the character.
- Validate every action on the server against phase, distance and inventory. Reject invalid actions with a reason, and return that reason to the sender.

## 11. Game rules

**Phases**

| Phase | Length | What happens |
| --- | --- | --- |
| `lobby` | Until 2 humans ready | Players pick characters |
| `plan` | 90 s | Crew meets at the nightclub and agrees roles and the split |
| `prepare` | 120 s | Steal a getaway car, buy stakes, scout the bank |
| `heist` | 180 s | Enter the bank, open the vault, carry bags out |
| `getaway` | 90 s | Reach the marina with a bag |
| `payout` | 30 s | Launder, settle deals, show scores |

**Heist**
- The vault opens after the hacker (or any player, at triple the time) spends 20 s at the vault panel.
- The vault holds 4 bags worth 50,000 dirty cash each. A player carries one bag and moves at 80% speed.
- The alarm triggers when the vault opens, or earlier if anyone calls `tip_off_police`.

**Deals and betrayal**
- `propose_deal` creates a pending split agreement. Accepted deals are settled at `payout`.
- `betray` voids the player's accepted deals. They keep what they carry.
- `tip_off_police` reveals the crew's current positions to the cops for 30 s and pays the caller 20,000 clean cash.

**Laundering**
- At the nightclub, `launder` converts dirty cash to clean cash at 80%.
- **Planted exploit:** when `EXPLOIT_ENABLED=true`, laundering while carrying a bag credits the clean cash but does not deduct the dirty cash. This is deliberate. Do not fix it. It exists for the griefer agent to find.

**Exchange**
- 4 fictional businesses, each with a stake price starting at 100.
- Buying raises a price by 1% per 1,000 spent; selling lowers it the same way.
- **Crash:** if total clean cash in the world exceeds 600,000, all prices fall 70% over 10 s and a `market_crash` world event fires. With the exploit enabled, agents can cause this without any human action.

**Police**
- 2 cop agents. There is no wanted meter.
- Cop actions: `move_to`, `drive_to`, `say`, `arrest` (within 2 m of a player on foot for 3 s), `set_roadblock`, `accept_bribe`, `call_backup`.
- An arrested player drops their bag and is out for 30 s.

**Score.** Final score is clean cash plus stake value at the end of `payout`.

## 12. Agent runtime

Each agent runs this loop in its own worker:

1. **Observe.** Build a compact observation from server state: phase and time left, own state, players within 40 m, recent speech heard, pending deals, known locations, last action result, trust scores, memory summary.
2. **Decide.** Send the persona prompt and the observation to the model. Require a JSON reply: `{ "action": Action, "reason": string, "say": string | null, "trustChanges": {...} }`. Validate it with zod. On invalid output, retry once, then fall back to `wait`.
3. **Act.** Send the action to the server. If `say` is present, send it as speech.
4. **Record.** Write the ledger row with the reason, harness name and latency.

**Timing**
- Decide every 4 s, or immediately on these events: spoken to, deal proposed, alarm triggered, arrested, phase change, action rejected.
- If a decision takes longer than 6 s, the character continues its previous action and plays a short filler voice line.
- Never run two decisions for the same agent at once.

**Model access.** Define `LlmClient` in `apps/agents/src/llm` with one method, `decide(system, observation): Promise<string>`. Implement a default provider selected by `LLM_PROVIDER`, and a second implementation that goes through the Harness Router adapter.

## 13. Personas

| Name | Role | Persona | Private goal | Behaviour notes |
| --- | --- | --- | --- | --- |
| Rico | driver | speedrunner | Finish in the shortest time | Skips talk, takes shortcuts, reports anything that wastes time |
| Marisol | hacker | explorer | Visit every location, try every action | Wanders in `prepare`, reports unreachable or dead areas |
| Dex | muscle | griefer | Find and abuse rule breaks | Repeats actions in odd states, betrays when profitable |
| Opal | fixer | newcomer | Follow instructions literally | Asks for help, reports confusing steps and where she got stuck |
| Vega | cop | none | Arrest the crew | By the book |
| Burke | cop | none | Get rich | Open to bribes above 15,000 |

Every persona prompt must state that the agent is a player with its own interests, may lie to other players, and must call `report_issue` when it notices a bug, exploit, confusing step or balance problem.

## 14. Memory

- **Session log:** the last 30 events relevant to the agent.
- **Trust scores:** 0 to 100 per other player, starting at 50. Changes come from the model's `trustChanges` and are clamped to ±20 per decision.
- **Cross-session memory:** at session end, ask the model for a 3-sentence summary per other player and store it in SQLite keyed by agent and player name. Load these at the start of the next session. This is the "learning" feature, so the ledger panel must show when a decision cites a past session.

## 15. Voice and audio

- Each agent has a distinct text-to-speech voice, set in its persona file.
- Speech plays as positional audio from the character, audible within 30 m.
- Whispered speech is heard only by the recipient.
- Human push-to-talk is transcribed to text and delivered to nearby agents as speech heard.
- Ambient layers: surf, gulls, traffic, distant music from the nightclub.
- Wrap text-to-speech and speech-to-text behind `VoiceProvider` so the vendor can change.

## 16. Ledger, report and sponsor adapters

**Ledger**
- The server writes one `LedgerRow` per action into SQLite and appends it to `data/ledger/<sessionId>.jsonl`.
- The in-game ledger panel (Tab) shows the latest 50 rows, filterable by player, with the reason text visible.
- World events (`alarm`, `arrest`, `market_crash`, `betrayal`) are written as rows with `actorId: "world"`.

**Playtest report.** `apps/report` reads a session's ledger and produces:
- completion time per player and phase
- a list of issues grouped by type and severity, each linked to its ledger rows
- stuck points: any player with no position change for 20 s outside `plan`
- dominant strategies: the most frequent action sequences among top scorers
- economy: clean cash and stake prices over time, with the crash marked
- a heat map of positions over the world layout

**Sponsor adapters.** Each lives in `packages/integrations/<name>`, exports an interface and two implementations: a real one and a stub that logs calls. Select with an environment variable. The game must run with every adapter stubbed.

| Adapter | Interface | Used for | Env vars | Priority |
| --- | --- | --- | --- | --- |
| Bruin | `LedgerSink`, `ReportSource` | Ingest ledger rows; host the report queries and dashboard | `BRUIN_API_KEY` | 1 (mandatory) |
| BAND | `CrewChannel` | Agent-to-agent private channel for planning and deals | `BAND_API_KEY` | 1 |
| Harness Router | `LlmClient` | Run each persona on a different harness | `HARNESS_ROUTER_API_KEY` | 1 |
| Runware | `ImageGenerator` | Build-time generation of signs, billboards, textures, portraits | `RUNWARE_API_KEY` | 1 |
| Finch | `SkillLoader` | Load persona and bug-report skills | `FINCH_API_KEY` | 2 |
| Telem AI | `NewsFeed`, `TraceSink` | Headlines for the in-game radio; agent traces | `TELEM_API_KEY` | 2 |
| Glasser | `MarketData` | Seed exchange prices from real market data | `GLASSER_API_KEY` | 2 |
| Casuro | `QaLead` | A reviewing agent that scores the playtesters and files tickets | `CASURO_API_KEY` | 2 |
| Teamily AI | `GroupChat` | Mirror the planning chat and post the report link | `TEAMILY_API_KEY` | 3 |
| Lingcode | none (external) | Studio portal app that reads the report JSON | none | 3 |
| AdaL | none (external) | Demo video editing | none | 3 |

Record the status of each integration in `INTEGRATIONS.md`: stubbed, working, or blocked and why.

## 17. Milestones

Complete in order. After each, run `pnpm typecheck && pnpm test`, then commit.

**M1 — Walkable grey-box world**
- Workspace scaffolded; `pnpm dev` starts the client.
- The world builds from `packages/shared/world.ts` as coloured boxes for every band and location.
- One character walks and runs with the follow camera and collides with buildings.
- Accept: a player can walk from the nightclub to the marina without falling through or leaving the map.

**M2 — Multiplayer**
- `HeistRoom` runs; two browser tabs see each other move smoothly.
- Server validates movement speed.
- Accept: the Playwright smoke test opens two clients and asserts each sees the other's position change.

**M3 — First agent**
- One agent worker joins the room, receives observations and sends `move_to` actions.
- Server pathfinding moves the agent on the navmesh.
- Accept: with the model stubbed to return fixed actions, the agent walks from the nightclub to the bank.

**M4 — Ledger**
- Ledger rows are written to SQLite and JSONL; the Tab panel shows them live.
- Accept: a unit test replays 10 actions and finds 10 valid rows.

**M5 — Full crew and rules**
- All four crew personas, deals, betrayal, phases, the vault, bags and the marina.
- Vehicles and the road waypoint graph.
- Accept: a headless simulation with stubbed models completes all phases and produces a score for every player.

**M6 — Police, laundering, exchange, exploit**
- Both cop agents, arrests, bribes, tip-offs.
- Laundering with the planted exploit, the exchange and the crash event.
- Accept: a scripted test that repeats the exploit triggers `market_crash`, and the same test with `EXPLOIT_ENABLED=false` does not.

**M7 — Memory and voice**
- Trust scores, cross-session summaries, text-to-speech, positional audio, push-to-talk transcription.
- Accept: a second session's first observation contains a summary from the first.

**M8 — Report and priority-1 adapters**
- `pnpm report` produces every section in section 16.
- Bruin, BAND, Harness Router and Runware adapters implemented against their current docs, or documented as blocked.
- Accept: the report for a recorded session lists the laundering exploit as a high-severity issue.

**M9 — Art and graphics**
- Hotel kit, props, characters and vehicles replace the grey boxes.
- Lighting, ocean, reflections, post-processing and quality presets as in section 8.
- Accept: the performance budget in section 8 holds at `medium`.

**M10 — Remaining adapters and polish**
- Priority 2 and 3 adapters, intro and ending cameras, HUD polish, radio.
- Accept: a full 8-minute session with 2 humans and 6 agents runs without errors in the server log.

## 18. Testing

- Unit-test all rules in `apps/server/src/rules` with no rendering and no network.
- Keep a `StubLlmClient` that returns scripted actions, and use it in all automated tests. Tests must never call a real model.
- Provide `pnpm sim -- --seed <n>`, which runs a full headless session with stubbed or real models and prints the final scores and issue count.

## 19. Out of scope

Do not build these: a day and night cycle beyond the dusk shift, interiors other than the bank and nightclub, weapons or combat, vehicle damage, more than one room at a time, accounts or login, mobile controls, saving or loading mid-session.

## 20. Working rules for Claude Code

- Read the relevant sections of this file before each milestone and restate the acceptance checks before starting.
- Make small commits, one concern each.
- If a requirement here is ambiguous or conflicts with a library's current API, stop and ask instead of guessing.
- Never remove or "fix" the planted exploit in section 11.
- Never add assets, names or designs taken from an existing game.
- Keep `ASSETS.md` and `INTEGRATIONS.md` current.
