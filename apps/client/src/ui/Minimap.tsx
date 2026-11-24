// Navigation map: a corner minimap, and a full labelled map on M. Shows bands, roads, buildings,
// players (you, crew, cops, humans), cars, and the current objective with a guide line.
import { BANDS, CROSS_STREETS, HOTEL_PLOTS, LOCATIONS, POINTS_OF_INTEREST, SECOND_STREET_ROAD, WORLD_BOUNDS, type LocationId, type Rect } from "@neon-bay/shared";
import { useEffect, useRef, useState } from "react";
import { localServerState, remoteBuffers, useNetStore, vehicleBuffers } from "../net/connection.js";
import { useLocalStore } from "../store.js";

const MIN_X = WORLD_BOUNDS.minX;
const MAX_X = 214; // end of the pier
const MIN_Z = WORLD_BOUNDS.minZ;
const MAX_Z = WORLD_BOUNDS.maxZ;

interface Objective {
  label: string;
  x: number;
  z: number;
}

function objective(phase: string, carrying: boolean): Objective | null {
  const at = (id: LocationId, label: string): Objective => ({ label, x: LOCATIONS[id].entrance.x, z: LOCATIONS[id].entrance.z });
  if (carrying) return at("marina", "Bank the bag at the marina");
  switch (phase) {
    case "lobby":
    case "plan":
      return at("nightclub", "Meet the crew at the nightclub");
    case "prepare":
      return at("car_park", "Steal a car at the car park");
    case "heist":
      return { label: "Crack the vault panel", x: POINTS_OF_INTEREST.vault_panel.x, z: POINTS_OF_INTEREST.vault_panel.z };
    case "getaway":
      return at("marina", "Get to the marina pier");
    default:
      return null;
  }
}

function draw(c: HTMLCanvasElement, big: boolean, t: number) {
  const ctx = c.getContext("2d")!;
  const W = c.width;
  const H = c.height;
  const sx = W / (MAX_X - MIN_X);
  const sz = H / (MAX_Z - MIN_Z);
  const X = (x: number) => (x - MIN_X) * sx;
  const Z = (z: number) => (z - MIN_Z) * sz;
  const rect = (r: Rect, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * sx, (r.maxZ - r.minZ) * sz);
  };
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0f2a3a";
  ctx.fillRect(0, 0, W, H);
  for (const b of BANDS) rect({ minX: b.minX, maxX: Math.min(b.maxX, MAX_X), minZ: MIN_Z, maxZ: MAX_Z }, b.id === "ocean" ? "#13465e" : b.color);
  ctx.globalAlpha = 0.9;
  rect(SECOND_STREET_ROAD, "#2a2830");
  for (const r of CROSS_STREETS) rect(r, "#2a2830");
  ctx.globalAlpha = 1;
  for (const p of HOTEL_PLOTS) rect(p.footprint, "#d9c9b8");
  for (const l of Object.values(LOCATIONS)) {
    rect(l.footprint, l.color);
    if (big) {
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000a";
      const lx = Math.min(Math.max(X((l.footprint.minX + l.footprint.maxX) / 2), 50), W - 50);
      const lz = Z((l.footprint.minZ + l.footprint.maxZ) / 2);
      ctx.fillRect(lx - 48, lz - 9, 96, 16);
      ctx.fillStyle = "#fff";
      ctx.fillText(l.label, lx, lz + 3);
    }
  }
  const net = useNetStore.getState();
  const me = net.roster.find((r) => r.isLocal);
  const local = useLocalStore.getState().position;
  // Objective: pulsing ring and a guide line from you.
  const obj = objective(net.game.phase, me?.carryingBag ?? false);
  if (obj) {
    const pulse = 5 + Math.sin(t / 250) * 2 + (big ? 4 : 0);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(X(local.x), Z(local.z));
    ctx.lineTo(X(obj.x), Z(obj.z));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(X(obj.x), Z(obj.z), pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const v of vehicleBuffers.values()) {
    const s = v.latest();
    if (!s) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(X(s.x) - 2.5, Z(s.z) - 2.5, 5, 5);
  }
  for (const r of net.roster) {
    if (r.isLocal) continue;
    const s = remoteBuffers.get(r.id)?.latest();
    if (!s) continue;
    ctx.fillStyle = r.role === "cop" ? "#4f8bff" : r.kind === "human" ? "#ffffff" : "#ffd166";
    ctx.beginPath();
    ctx.arc(X(s.x), Z(s.z), big ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (big) {
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.fillText(r.name, X(s.x) + 6, Z(s.z) + 4);
    }
  }
  const lp = localServerState.player?.position ?? local;
  ctx.fillStyle = "#ff4fa3";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(X(local.x ?? lp.x), Z(local.z ?? lp.z), big ? 6 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // North marker.
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("N ↑", W - 16, 14);
}

export function Minimap() {
  const [big, setBig] = useState(false);
  const small = useRef<HTMLCanvasElement>(null);
  const large = useRef<HTMLCanvasElement>(null);
  const phase = useNetStore((s) => s.game.phase);
  const carrying = useNetStore((s) => s.roster.find((r) => r.isLocal)?.carryingBag ?? false);
  const obj = objective(phase, carrying);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) setBig((b) => !b);
    };
    window.addEventListener("keydown", onKey);
    let raf = 0;
    const loop = (t: number) => {
      if (small.current) draw(small.current, false, t);
      if (large.current) draw(large.current, true, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, []);
  const aspect = (MAX_Z - MIN_Z) / (MAX_X - MIN_X);
  return (
    <>
      <div data-testid="minimap" style={{ position: "absolute", zIndex: 16777279, right: 16, bottom: 16, padding: 6, background: "rgba(20,10,30,0.8)", borderRadius: 6, border: "2px solid #ff4fa3", pointerEvents: "none" }}>
        <canvas ref={small} width={130} height={Math.round(130 * aspect)} style={{ display: "block", borderRadius: 3 }} />
        <div style={{ fontSize: 11, marginTop: 4, maxWidth: 130, lineHeight: 1.3 }}>
          {obj ? <span style={{ color: "#ffd166" }}>◎ {obj.label}</span> : null}
          <div style={{ opacity: 0.7 }}>M: full map</div>
        </div>
      </div>
      {big && (
        <div style={{ position: "absolute", inset: 0, zIndex: 16777280, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,3,12,0.7)", pointerEvents: "none" }}>
          <div style={{ padding: 12, background: "rgba(20,10,30,0.95)", borderRadius: 8, border: "2px solid #ff4fa3" }}>
            <div style={{ fontWeight: 800, letterSpacing: 2, marginBottom: 8 }}>NEON BAY · MAP {obj ? <span style={{ color: "#ffd166", fontWeight: 600, letterSpacing: 0 }}> · ◎ {obj.label}</span> : null}</div>
            <canvas ref={large} width={Math.round(560 / aspect)} height={560} style={{ display: "block", borderRadius: 4 }} />
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>
              <span style={{ color: "#ff4fa3" }}>● you</span> · <span style={{ color: "#ffd166" }}>● crew</span> · <span style={{ color: "#4f8bff" }}>● police</span> · <span>● humans</span> · ■ cars · M to close
            </div>
          </div>
        </div>
      )}
    </>
  );
}
