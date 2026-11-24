# Assets

Every third-party asset used in the build, with its source and licence. Assets generated for this project are listed too.

| Asset | Path | Source | Licence | Notes |
| --- | --- | --- | --- | --- |
| 3D models: sports car (3 paints), palm, people (Rico, Marisol, Dex, Opal, cop, tourist, jogger, skater, beachgoer, retiree), dog, police station, nightclub, pawn shop, exchange, 4 hotel designs, yacht, speedboat, lifeguard tower | `apps/client/public/generated/models/*.glb` | Generated for this project with Runware `3dInference` (Tripo v3.1, Meshy-6) from the prompts in `packages/shared/src/models3d.ts`; per-model engine, seed and cost in `manifest.json` | Generated output, owned by the project under Runware's terms of service | Original designs: prompts forbid logos, badges and text; no real car make. Rigged in code at load time. Regenerate with `MODEL_GENERATOR=runware pnpm models -- --force`. |
| Rooftop billboards (6) | `apps/client/public/generated/billboard_*.png` | Generated for this project with Runware (`alibaba:qwen-image@3.0`) from the prompts in `packages/shared/src/assets.ts`; per-image model, seed and cost in `manifest.json` | Generated output, owned by the project under Runware's terms of service | All brands (Harbor Cola, First Coral Trust, Velvet Static 96.6 FM, Gatorline Marine, Palmetto Video, Seaspray Telecom) are invented for Neon Bay. Regenerate with `IMAGE_GENERATOR=runware pnpm assets -- --force`. |
| Wall photo textures (bank, city facades) | `apps/client/public/generated/facade_*.png` | Generated for this project with Runware (`alibaba:qwen-image@3.0`) from the prompts in `packages/shared/src/assets.ts`; per-image model, seed and cost in `manifest.json` | Generated output, owned by the project under Runware's terms of service | All brands (Harbor Cola, First Coral Trust, Velvet Static 96.6 FM, Gatorline Marine, Palmetto Video, Seaspray Telecom) are invented for Neon Bay. Regenerate with `IMAGE_GENERATOR=runware pnpm assets -- --force`. |
| World layout and colliders | procedural | `packages/shared/src/world.ts` | Original | |
| Facades, neon, palms, ocean shader, people, lighting | procedural | `apps/client/src/scene/*`, `entities/Character.tsx` | Original | Canvas-drawn window atlas, vertex-shader palms, procedural ocean normals. |
| Sound and music | procedural | `apps/client/src/audio/sound.ts` | Original | Synthesised live in WebAudio; no audio files. |
| Sunset sky HDRI `belfast_sunset_puresky` (2k) | `apps/client/public/cc0/hdri/` | [Poly Haven](https://polyhaven.com/a/belfast_sunset_puresky) | CC0 1.0 | Background and image-based light for the optional `?tod=cycle` day-to-night mode (only fetched then). |
| Sunny midday sky HDRI `kloofendal_48d_partly_cloudy_puresky` (2k) | `apps/client/public/cc0/hdri/` | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | CC0 1.0 | Background and image-based light for the whole session. |
| PBR textures `plastered_wall`, `clean_asphalt`, `coast_sand_01`, `leafy_grass`, `large_grey_tiles` (1k: diffuse, GL normal, roughness) | `apps/client/public/cc0/textures/` | [Poly Haven](https://polyhaven.com/textures) | CC0 1.0 | Building plaster, roads, beach, park, pavements. |
| Models `street_lamp_01`, `metal_trash_can` (1k glTF) | `apps/client/public/cc0/models/` | [Poly Haven](https://polyhaven.com/models) | CC0 1.0 | Second Street lamps and bins. |

Poly Haven assets are fetched by `pnpm fetch:cc0` (`scripts/fetch-cc0.mjs`) and committed so the game runs offline.
