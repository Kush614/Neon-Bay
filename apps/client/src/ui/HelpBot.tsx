// "Sal", the in-game helper: answers how-to-play questions from the rules knowledge base and
// always knows the next step for the current phase. H toggles it.
import { useEffect, useRef, useState } from "react";
import { useNetStore } from "../net/connection.js";
import { answer, nextStep } from "./helpKnowledge.js";

interface Msg {
  from: "bot" | "you";
  text: string;
}

const SUGGESTIONS = ["What do I do now?", "How do I open the vault?", "Where is the marina?", "How do I launder cash?", "Controls", "What about the cops?"];

export function HelpBot() {
  const [open, setOpen] = useState(() => !localStorage.getItem("nb-help-seen"));
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Hey, I'm Sal, your fixer on the inside. Ask me anything about the job: controls, the vault, cars, deals, cops. Press H to hide or show me." },
  ]);
  const scroll = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
        if (e.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      if (e.code === "KeyH") {
        setOpen((o) => !o);
        localStorage.setItem("nb-help-seen", "1");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [msgs, open]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    const net = useNetStore.getState();
    const me = net.roster.find((r) => r.isLocal);
    let reply: string;
    if (/\b(now|next|what should|stuck|help)\b/i.test(question) && !answer(question.replace(/\b(now|next|help)\b/gi, ""))) {
      reply = nextStep(net.game.phase, me?.carryingBag ?? false, me?.inVehicle ?? false);
    } else {
      const t = answer(question);
      reply = t
        ? t.answer
        : `Not sure about that one. Try asking about the vault, bags, cars, the marina, laundering, deals, betrayal, cops, stakes, the map or controls. Right now: ${nextStep(net.game.phase, me?.carryingBag ?? false, me?.inVehicle ?? false)}`;
    }
    setMsgs((m) => [...m, { from: "you", text: question }, { from: "bot", text: reply }]);
    setInput("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ position: "fixed", zIndex: 16777280, right: 170, bottom: 16, padding: "8px 14px", background: "#ff4fa3", color: "#fff", border: "none", borderRadius: 20, fontWeight: 800, cursor: "pointer", pointerEvents: "auto", boxShadow: "0 0 18px #ff4fa388" }}
      >
        ? Help (H)
      </button>
    );
  }
  return (
    <div
      data-testid="helpbot"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: "fixed", zIndex: 16777280, right: 170, bottom: 16, width: 340, height: 420, display: "flex", flexDirection: "column", background: "rgba(20,10,30,0.94)", border: "2px solid #ff4fa3", borderRadius: 10, pointerEvents: "auto", boxShadow: "0 0 30px #ff4fa355", fontSize: 13 }}
    >
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #ff4fa355", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 800, letterSpacing: 1, color: "#ff9bd2" }}>SAL · HOW TO PLAY</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16 }}>
          ×
        </button>
      </div>
      <div ref={scroll} style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.from === "you" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              padding: "7px 10px",
              borderRadius: 8,
              lineHeight: 1.4,
              background: m.from === "you" ? "#4fd1ff33" : "#ff4fa322",
              border: `1px solid ${m.from === "you" ? "#4fd1ff66" : "#ff4fa355"}`,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 10px 6px" }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, border: "1px solid #ffd16688", background: "transparent", color: "#ffd166", cursor: "pointer" }}>
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #ff4fa355" }}
      >
        <input
          ref={field}
          data-testid="helpbot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Sal… (Enter to send, Esc to return to the game)"
          style={{ flex: 1, padding: "7px 9px", borderRadius: 6, border: "1px solid #ffffff33", background: "#0c0716", color: "#fff", outline: "none" }}
        />
        <button type="submit" style={{ padding: "0 12px", borderRadius: 6, border: "none", background: "#ff4fa3", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Ask
        </button>
      </form>
    </div>
  );
}
