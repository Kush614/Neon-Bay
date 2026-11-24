import { BANDS, LOCATIONS } from "@neon-bay/shared";
import { useNetStore } from "../net/connection.js";
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
  const status = useNetStore((s) => s.status);
  const roster = useNetStore((s) => s.roster);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontSize: 14 }}>
      <div style={{ position: "absolute", top: 16, left: 16, padding: "10px 14px", background: "rgba(20,10,30,0.72)", borderLeft: "4px solid #ff4fa3", borderRadius: 4, lineHeight: 1.5 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: "#ff9bd2" }}>NEON BAY '86</div>
        <div>{band}{near.d < 25 ? ` · near ${near.label}` : ""}</div>
        <div data-testid="position" style={{ fontFamily: "ui-monospace, monospace", opacity: 0.8 }}>
          x {p.x.toFixed(1)} · z {p.z.toFixed(1)}{running ? " · running" : ""}
        </div>
      </div>
      <div data-testid="net-status" data-status={status} style={{ position: "absolute", top: 16, right: 16, padding: "10px 14px", background: "rgba(20,10,30,0.72)", borderRight: "4px solid #4fd1ff", borderRadius: 4, lineHeight: 1.5, minWidth: 160 }}>
        <div style={{ fontWeight: 700, color: status === "connected" ? "#7dffb0" : status === "offline" ? "#ffb37d" : "#ffffff" }}>
          {status === "connected" ? "Online" : status === "offline" ? "Offline (local only)" : "Connecting…"}
        </div>
        {roster.map((r) => (
          <div key={r.id} style={{ opacity: r.isLocal ? 1 : 0.85 }}>
            {r.kind === "agent" ? "◆" : "●"} {r.name}{r.isLocal ? " (you)" : ""}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, padding: "8px 12px", background: "rgba(20,10,30,0.6)", borderRadius: 4, opacity: 0.9 }}>
        WASD move · Shift run · click or drag to look · Tab ledger · Esc release mouse
      </div>
    </div>
  );
}
