// Pedestrian navmesh built from the same world layout as the physics colliders.
import { init as initRecast, NavMeshQuery, type NavMesh } from "recast-navigation";
import { generateTiledNavMesh } from "recast-navigation/generators";
import { CHARACTER_RADIUS, GROUND_Y, staticColliders, type Box, type Vec3 } from "@neon-bay/shared";

const CELL_SIZE = 0.3;
const CELL_HEIGHT = 0.2;
const AGENT_HEIGHT = 1.8;
const AGENT_CLIMB = 0.35;

/** Append a box's 12 triangles (counter-clockwise, outward-facing) to the geometry arrays. */
function pushBox(b: Box, positions: number[], indices: number[]) {
  const base = positions.length / 3;
  const { center: c, half: h } = b;
  for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) positions.push(c.x + dx * h.x, c.y + dy * h.y, c.z + dz * h.z);
  // Vertex index = (dx>0)*4 + (dy>0)*2 + (dz>0)
  const quads = [
    [2, 3, 7, 6], // top (+y)
    [0, 4, 5, 1], // bottom (-y)
    [4, 6, 7, 5], // +x
    [0, 1, 3, 2], // -x
    [1, 5, 7, 3], // +z
    [0, 2, 6, 4], // -z
  ] as const;
  for (const [a, b2, c2, d] of quads) indices.push(base + a, base + b2, base + c2, base + a, base + c2, base + d);
}

export class NavGraph {
  private constructor(
    readonly navMesh: NavMesh,
    private readonly query: NavMeshQuery,
  ) {}

  static async build(): Promise<NavGraph> {
    await initRecast();
    const positions: number[] = [];
    const indices: number[] = [];
    for (const b of staticColliders()) pushBox(b, positions, indices);
    const result = generateTiledNavMesh(positions, indices, {
      cs: CELL_SIZE,
      ch: CELL_HEIGHT,
      tileSize: 64,
      walkableRadius: Math.ceil(CHARACTER_RADIUS / CELL_SIZE),
      walkableHeight: Math.ceil(AGENT_HEIGHT / CELL_HEIGHT),
      walkableClimb: Math.floor(AGENT_CLIMB / CELL_HEIGHT),
      walkableSlopeAngle: 45,
      maxEdgeLen: 12 / CELL_SIZE,
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    });
    if (!result.success) throw new Error(`navmesh generation failed: ${result.error}`);
    return new NavGraph(result.navMesh, new NavMeshQuery(result.navMesh));
  }

  /** Nearest navmesh point on the ground, or null if none is close. */
  closestPoint(p: { x: number; z: number }): Vec3 | null {
    const r = this.query.findClosestPoint({ x: p.x, y: GROUND_Y, z: p.z }, { halfExtents: { x: 4, y: 1, z: 4 } });
    return r.success && r.point ? { x: r.point.x, y: r.point.y, z: r.point.z } : null;
  }

  /** Straight path of waypoints from `from` to `to` on the ground, or null if unreachable. */
  path(from: { x: number; z: number }, to: { x: number; z: number }): Vec3[] | null {
    const start = this.closestPoint(from);
    const end = this.closestPoint(to);
    if (!start || !end) return null;
    const r = this.query.computePath(start, end, { halfExtents: { x: 2, y: 1, z: 2 } });
    if (!r.success || r.path.length === 0) return null;
    const last = r.path[r.path.length - 1]!;
    // A partial path stops short of the goal: treat it as unreachable.
    if (Math.hypot(last.x - end.x, last.z - end.z) > 1) return null;
    return r.path.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }

  dispose(): void {
    this.query.destroy();
    this.navMesh.destroy();
  }
}
