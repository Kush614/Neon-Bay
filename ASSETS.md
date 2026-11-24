# Assets

Every third-party asset used in the build, with its source and licence. Assets generated for this project are listed too.

| Asset | Path | Source | Licence | Notes |
| --- | --- | --- | --- | --- |
| Rooftop billboards (6) | `apps/client/public/generated/billboard_*.png` | Generated for this project with Runware (`alibaba:qwen-image@3.0`) from the prompts in `packages/shared/src/assets.ts`; per-image model, seed and cost in `manifest.json` | Generated output, owned by the project under Runware's terms of service | All brands (Harbor Cola, First Coral Trust, Velvet Static 96.6 FM, Gatorline Marine, Palmetto Video, Seaspray Telecom) are invented for Neon Bay. Regenerate with `IMAGE_GENERATOR=runware pnpm assets -- --force`. |
| Grey-box world | procedural | `packages/shared/src/world.ts` | Original | Placeholder boxes from M1. |
