# Neon Bay '86

Browser-based 3D co-op heist game where AI agent players double as playtesters. `SPEC.md` is the source of truth; `CLAUDE.md` holds the working rules.

```sh
pnpm install
pnpm dev:client        # http://localhost:5173  (add ?cam=overview for an aerial debug view)
pnpm typecheck && pnpm test
```

## Status

| Milestone | State |
| --- | --- |
| M1 Walkable grey-box world | done |
| M2–M10 | not started |

## Decisions the spec left open

- **TypeScript 6.0, not 7.** `typescript-eslint` 8.74 supports TypeScript below 6.1, so 7.x would break `pnpm lint`.
- **Rapier pinned to 0.19.2.** That is the version `@react-three/rapier` 2.2 bundles; the server will use the same so prediction and authority run identical physics. Movement lives in `packages/shared/src/physics.ts` and takes the Rapier module as an argument.
- **Layout detail inside section 7.** Second Street is a road strip at x 0–8 with location buildings at x 8–50 (so the bank's back wall meets the alley at x = 50). Cross streets are 12 m wide. Each building footprint contains its spec centre but stops short of the cross streets, and each location has an `entrance` point outside its door for spawns and pathing. The marina sits on a pier (x 190–214, z 178–192) that crosses the shoreline; invisible sea walls and pier rails keep players out of the water.
- **Businesses.** The four fictional exchange businesses are Citrus Grove Juices, Palmetto Video Rental, Seaspray Telecom and Coquina Realty Trust.
