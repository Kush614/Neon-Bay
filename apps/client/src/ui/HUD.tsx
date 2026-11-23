import { BANDS, LOCATIONS } from "@neon-bay/shared";
import { useLocalStore } from "../store.js";

function nearestLocation(x: number, z: number) {
  let best = { label: "", d: Infinity };
  for (const loc of Object.values(LOCATIONS)) {
    const d = Math.hypot(loc.entrance.x - x, loc.entrance.z - z);
    if (d < best.d) best = { label: loc.label, d };
  }
  return best;
}

export function HUD() {
  const p = useLocalStore((s) => s.position);
  const running = useLocalStore((s) => s.running);
  const band = BANDS.find((b) => p.x >= b.minX && p.x < b.maxX)?.label ?? "Pier";
  const near = nearestLocation(p.x, p.z);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontSize: 14 }}>
      <div style={{ position: "absolute", top: 16, left: 16, padding: "10px 14px", background: "rgba(20,10,30,0.72)", borderLeft: "4px solid #ff4fa3", borderRadius: 4, lineHeight: 1.5 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: "#ff9bd2" }}>NEON BAY '86</div>
        <div>{band}{near.d < 25 ? ` · near ${near.label}` : ""}</div>
        <div data-testid="position" style={{ fontFamily: "ui-monospace, monospace", opacity: 0.8 }}>
          x {p.x.toFixed(1)} · z {p.z.toFixed(1)}{running ? " · running" : ""}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, padding: "8px 12px", background: "rgba(20,10,30,0.6)", borderRadius: 4, opacity: 0.9 }}>
        WASD move · Shift run · click or drag to look · Esc release mouse
      </div>
    </div>
  );
}
