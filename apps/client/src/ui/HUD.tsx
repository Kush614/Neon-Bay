import { BANDS, CAR_ENTER_RADIUS, LOCATIONS, MIN_HUMANS_TO_START, POINTS_OF_INTEREST, VAULT_RADIUS } from "@neon-bay/shared";
import { useEffect, useState } from "react";
import { useNetStore, vehicleBuffers, type GameInfo, type RosterEntry } from "../net/connection.js";
import { useLocalStore } from "../store.js";

function nearestLocation(x: number, z: number) {
  let best = { label: "", d: Infinity };
  for (const loc of Object.values(LOCATIONS)) {
    const d = Math.hypot(loc.entrance.x - x, loc.entrance.z - z);
    if (d < best.d) best = { label: loc.label, d };
  }
  return best;
}

const PHASE_HINT: Record<string, string> = {
  lobby: "Press R when you're ready. The heist starts when two humans are ready.",
  plan: "Meet the crew at the nightclub. Agree roles and the split.",
  prepare: "Steal a car at the car park, scout the bank.",
  heist: "Get to the vault panel inside the bank. Grab a bag once it opens (G).",
  getaway: "Carry your bag to the marina pier.",
  payout: "Deals settle. Scores are coming.",
  ended: "The session is over.",
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function PhaseBanner({ game, roster }: { game: GameInfo; roster: RosterEntry[] }) {
  const humans = roster.filter((r) => r.kind === "human");
  const ready = humans.filter((r) => r.ready).length;
  const timed = game.phase !== "lobby" && game.phase !== "ended";
  return (
    <div
      data-testid="phase"
      data-phase={game.phase}
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 18px",
        background: game.alarm ? "rgba(120,10,30,0.8)" : "rgba(20,10,30,0.72)",
        borderBottom: `3px solid ${game.alarm ? "#ff3355" : "#ffd166"}`,
        borderRadius: 4,
        textAlign: "center",
        minWidth: 280,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>
        {game.phase.toUpperCase()}
        {timed ? ` · ${clock(game.timeLeft)}` : ""}
        {game.alarm ? " · ALARM" : ""}
      </div>
      {game.phase === "lobby" && (
        <div>
          {ready}/{Math.max(MIN_HUMANS_TO_START, humans.length)} humans ready
        </div>
      )}
      {(game.phase === "heist" || game.phase === "getaway") && (
        <div style={{ fontSize: 13 }}>
          Vault {game.vaultOpen ? "OPEN" : `${game.vaultPercent}%`} · {game.bagsLeft} bags inside · {game.bagsBanked} banked
        </div>
      )}
      <div style={{ fontSize: 12, opacity: 0.8 }}>{PHASE_HINT[game.phase] ?? ""}</div>
    </div>
  );
}

/** Context hint for where you stand: at a car, at the vault, or driving. */
function useNearHint(p: { x: number; z: number }, me: RosterEntry | undefined, game: GameInfo): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  if (!me) return null;
  if (me.inVehicle) return "W/S throttle · A/D steer · E get out";
  const v = POINTS_OF_INTEREST.vault_panel;
  if (Math.hypot(p.x - v.x, p.z - v.z) <= VAULT_RADIUS) return game.vaultOpen ? "G grab a bag" : "At the vault panel: stay here to open it";
  for (const buf of vehicleBuffers.values()) {
    const s = buf.latest();
    if (s && Math.hypot(s.x - p.x, s.z - p.z) - 1 <= CAR_ENTER_RADIUS) return "E get in the car";
  }
  return null;
}

function Feed() {
  const feed = useNetStore((s) => s.feed);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const recent = feed.filter((f) => now - f.at < 12_000);
  return (
    <div style={{ position: "absolute", bottom: 56, left: 16, maxWidth: 520, display: "flex", flexDirection: "column", gap: 4 }}>
      {recent.map((f, i) => (
        <div key={`${f.at}-${i}`} style={{ padding: "4px 10px", background: "rgba(20,10,30,0.6)", borderRadius: 3, fontSize: 13 }}>
          {f.text}
        </div>
      ))}
    </div>
  );
}

export function HUD() {
  const p = useLocalStore((s) => s.position);
  const running = useLocalStore((s) => s.running);
  const band = BANDS.find((b) => p.x >= b.minX && p.x < b.maxX)?.label ?? "Pier";
  const near = nearestLocation(p.x, p.z);
  const status = useNetStore((s) => s.status);
  const roster = useNetStore((s) => s.roster);
  const game = useNetStore((s) => s.game);
  const me = roster.find((r) => r.isLocal);
  const hint = useNearHint(p, me, game);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontSize: 14 }}>
      <div style={{ position: "absolute", top: 16, left: 16, padding: "10px 14px", background: "rgba(20,10,30,0.72)", borderLeft: "4px solid #ff4fa3", borderRadius: 4, lineHeight: 1.5 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: "#ff9bd2" }}>NEON BAY '86</div>
        <div>{band}{near.d < 25 ? ` · near ${near.label}` : ""}</div>
        <div data-testid="position" style={{ fontFamily: "ui-monospace, monospace", opacity: 0.8 }}>
          x {p.x.toFixed(1)} · z {p.z.toFixed(1)}{running ? " · running" : ""}
        </div>
        {me && (
          <div>
            {money(me.cleanCash)} clean · {money(me.dirtyCash)} dirty{me.carryingBag ? " · carrying a bag" : ""}
          </div>
        )}
      </div>
      <PhaseBanner game={game} roster={roster} />
      {hint && (
        <div style={{ position: "absolute", bottom: 120, left: "50%", transform: "translateX(-50%)", padding: "6px 14px", background: "rgba(20,10,30,0.75)", borderRadius: 4, fontWeight: 700 }}>
          {hint}
        </div>
      )}
      <Feed />
      <div data-testid="net-status" data-status={status} style={{ position: "absolute", top: 16, right: 16, padding: "10px 14px", background: "rgba(20,10,30,0.72)", borderRight: "4px solid #4fd1ff", borderRadius: 4, lineHeight: 1.5, minWidth: 160 }}>
        <div style={{ fontWeight: 700, color: status === "connected" ? "#7dffb0" : status === "offline" ? "#ffb37d" : "#ffffff" }}>
          {status === "connected" ? "Online" : status === "offline" ? "Offline (local only)" : "Connecting…"}
        </div>
        {roster.map((r) => (
          <div key={r.id} style={{ opacity: r.isLocal ? 1 : 0.85 }}>
            {r.kind === "agent" ? "◆" : "●"} {r.name}
            {r.isLocal ? " (you)" : ""}
            {game.phase === "lobby" && r.kind === "human" ? (r.ready ? " · ready" : " · not ready") : ""}
            {r.inVehicle ? " · driving" : ""}
            {r.carryingBag ? " · bag" : ""}
            {game.phase === "ended" ? ` · ${money(r.score)}` : ""}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, padding: "8px 12px", background: "rgba(20,10,30,0.6)", borderRadius: 4, opacity: 0.9 }}>
        WASD move · Shift run · E car · G grab bag · Y/N answer deal · R ready · Tab ledger · Esc release mouse
      </div>
    </div>
  );
}
