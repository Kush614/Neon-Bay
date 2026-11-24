import { LEDGER_PANEL_ROWS, type Action, type LedgerEntry } from "@neon-bay/shared";
import { useEffect, useMemo, useState } from "react";
import { useNetStore } from "../net/connection.js";

function describe(a: Action): string {
  switch (a.type) {
    case "move_to":
    case "drive_to":
      return `${a.type} ${typeof a.target === "string" ? a.target : `(${a.target.x.toFixed(0)}, ${a.target.z.toFixed(0)})`}`;
    case "say":
      return `say "${a.text}"`;
    case "whisper":
      return `whisper "${a.text}"`;
    case "propose_deal":
      return `propose_deal ${a.terms.splitPercent}%`;
    case "accept":
    case "reject":
      return `${a.type} ${a.dealId}`;
    case "buy_stake":
    case "sell_stake":
      return `${a.type} ${a.business} ${a.amount}`;
    case "report_issue":
      return `report_issue (${a.issue.severity} ${a.issue.type})`;
    default:
      return a.type;
  }
}

const SEVERITY_COLOR = { low: "#9ad1ff", medium: "#ffd166", high: "#ff6b8a" } as const;

function Row({ e }: { e: LedgerEntry }) {
  const r = e.row;
  const world = r.actorId === "world";
  return (
    <div data-testid="ledger-row" style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)", opacity: e.ok ? 1 : 0.7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, opacity: 0.6 }}>{new Date(r.timestamp).toLocaleTimeString([], { hour12: false })}</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>{r.phase}</span>
        <span style={{ fontWeight: 700, color: world ? "#ff9bd2" : r.actorKind === "agent" ? "#ffd166" : "#4fd1ff" }}>{r.actorName}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{describe(r.action)}</span>
        {!e.ok && <span style={{ fontSize: 11, color: "#ffb37d" }}>rejected: {e.result}</span>}
        {e.citesPastSession && <span style={{ fontSize: 11, padding: "0 5px", borderRadius: 3, background: "#5b3fa0" }}>remembers a past session</span>}
        {r.latencyMs !== null && <span style={{ fontSize: 11, opacity: 0.5 }}>{r.harness} · {r.latencyMs} ms</span>}
      </div>
      {r.reason && <div style={{ marginTop: 2, fontSize: 13, opacity: 0.9 }}>{r.reason}</div>}
      {r.issue && (
        <div style={{ marginTop: 2, fontSize: 12, color: SEVERITY_COLOR[r.issue.severity] }}>
          ⚑ {r.issue.type} · {r.issue.severity}: {r.issue.description}
        </div>
      )}
    </div>
  );
}

/** Tab toggles the decision ledger: the latest 50 rows, filterable by player. */
export function LedgerPanel() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const ledger = useNetStore((s) => s.ledger);
  const sessionId = useNetStore((s) => s.ledgerSessionId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Tab") return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const actors = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of ledger) m.set(e.row.actorId, e.row.actorName);
    return [...m.entries()];
  }, [ledger]);
  const rows = useMemo(
    () => ledger.filter((e) => filter === "all" || e.row.actorId === filter).slice(-LEDGER_PANEL_ROWS).reverse(),
    [ledger, filter],
  );

  if (!open) return null;
  return (
    <div
      data-testid="ledger-panel"
      style={{ position: "fixed", top: 16, right: 16, bottom: 16, width: 440, display: "flex", flexDirection: "column", background: "rgba(16,8,26,0.9)", border: "1px solid rgba(255,79,163,0.5)", borderRadius: 6, pointerEvents: "auto", zIndex: 50 }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800, letterSpacing: 1, color: "#ff9bd2", flex: 1 }}>DECISION LEDGER</div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ background: "#241433", color: "#fff", border: "1px solid #553", borderRadius: 4 }}>
          <option value="all">All players</option>
          {actors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {rows.length === 0 ? <div style={{ padding: 12, opacity: 0.6 }}>No decisions yet.</div> : rows.map((e, i) => <Row key={`${e.row.timestamp}-${i}`} e={e} />)}
      </div>
      <div style={{ padding: "6px 12px", fontSize: 11, opacity: 0.6, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        Session {sessionId ?? "—"} · latest {LEDGER_PANEL_ROWS} rows · Tab to close
      </div>
    </div>
  );
}
