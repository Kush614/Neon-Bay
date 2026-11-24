# Sponsor integrations

Status of each adapter in `packages/integrations`. Every adapter must have a stub, and the game must run with all of them stubbed.

| Adapter | Interface | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| Bruin | `LedgerSink`, `ReportSource` | 1 | not started | Planned for M8. |
| BAND | `CrewChannel` | 1 | working | `packages/integrations/src/band`. `CREW_CHANNEL=band` + `BAND_API_KEY` (agent-scoped key of the NeonBayCrew agent). Each session opens a private Band room with the agent's owner; the server mirrors crew whispers, deals and betrayals (never bribes or cop traffic). Endpoints taken from Band's REST client (band_rest 0.0.57, `/api/v1/agent/...`); verified live on 2026-11-23 with `pnpm sim`. Stub is the default and is used by all tests. |
| Harness Router | `LlmClient` | 1 | dropped | Dropped by the project owner on 2026-11-23. The free tier needs a Bring Your Own Key provider key before any task runs (402 `no_key`). Agents use `LLM_PROVIDER` (stub or anthropic) instead. The probe harness was deleted and the key removed. |
| Runware | `ImageGenerator` | 1 | working | `packages/integrations/src/runware`. Build-time only: `IMAGE_GENERATOR=runware pnpm assets` + `RUNWARE_API_KEY` renders the specs in `packages/shared/src/assets.ts` to `apps/client/public/generated/` with a `manifest.json`; existing images are kept unless `--force`. REST `POST https://api.runware.ai/v1`, bearer auth, `imageInference` task, per Runware's docs; verified live 2026-11-23. Model `alibaba:qwen-image@3.0` (about $0.03 per 1024x512) because the docs' civitai example garbled lettering. The stub writes flat placeholder PNGs; all tests use fake fetch. |
| Finch | `SkillLoader` | 2 | not started | Planned for M10. |
| Telem AI | `NewsFeed`, `TraceSink` | 2 | not started | `TELEM_API_KEY` is in `.env`; adapter not written yet. |
| Glasser | `MarketData` | 2 | not started | Planned for M10. |
| Casuro | `QaLead` | 2 | not started | Planned for M10. |
| Teamily AI | `GroupChat` | 3 | not started | Planned for M10. |
| Lingcode | none (external) | 3 | not started | External studio portal. |
| AdaL | none (external) | 3 | not started | External video editing. |
