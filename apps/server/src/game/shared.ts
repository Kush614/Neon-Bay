// Process-wide physics and navmesh, shared by every session.
import RAPIER from "@dimforge/rapier3d-compat";
import { NavGraph } from "../sim/navmesh.js";

let rapierReady: Promise<void> | null = null;
export function initRapier(): Promise<typeof RAPIER> {
  rapierReady ??= RAPIER.init();
  return rapierReady.then(() => RAPIER);
}

// The navmesh depends only on static world data, so every session shares one.
let navReady: Promise<NavGraph> | null = null;
export function sharedNavGraph(): Promise<NavGraph> {
  navReady ??= NavGraph.build();
  return navReady;
}
