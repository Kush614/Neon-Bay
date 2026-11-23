# Neon Bay '86

Browser-based 3D co-op heist game with AI agent players that double as playtesters. The full spec is in `SPEC.md`. Read it before any work, and follow its milestones in order.

## Commands

- `pnpm dev` — run client, server and agents
- `pnpm typecheck && pnpm test` — run before finishing any task
- `pnpm e2e` — Playwright smoke test
- `pnpm sim -- --seed 1` — headless full session
- `pnpm report -- --session <id>` — build the playtest report

## Rules

- TypeScript strict mode. Shared types live in `packages/shared`; never redefine them per app.
- The server is authoritative. Clients and agents send inputs and actions only.
- API keys stay in server-side env vars. Never import them into `apps/client`.
- Every sponsor integration sits behind an interface in `packages/integrations` with a stub. The game must run fully stubbed. Read the sponsor's current docs before implementing; do not guess an API.
- Automated tests use `StubLlmClient` and never call a real model.
- The laundering exploit in SPEC.md section 11 is deliberate. Do not fix it.
- Original work only: no assets, names, maps or designs from any existing game, and no real brands or car makes. Log third-party assets in `ASSETS.md`.
- If the spec is ambiguous or conflicts with a library's current API, ask before proceeding.
