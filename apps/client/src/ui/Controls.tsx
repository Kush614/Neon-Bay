// Discrete keys: E car, R ready, G grab bag, Y/N answer the latest deal offered to you.
import { useEffect } from "react";
import { onKeyPress } from "../input/keyboard.js";
import { sendAction, sendReady, sendUseVehicle, useNetStore } from "../net/connection.js";

function latestOffer() {
  const s = useNetStore.getState();
  return [...s.deals].reverse().find((d) => d.toId === s.sessionId && d.status === "pending");
}

export function Controls() {
  useEffect(() => {
    const offs = [
      onKeyPress("KeyE", () => sendUseVehicle()),
      onKeyPress("KeyR", () => {
        const s = useNetStore.getState();
        const me = s.roster.find((r) => r.isLocal);
        if (s.phase === "lobby" && me) sendReady(!me.ready);
      }),
      onKeyPress("KeyG", () => sendAction({ type: "grab_bag" })),
      onKeyPress("KeyY", () => {
        const d = latestOffer();
        if (d) sendAction({ type: "accept", dealId: d.id });
      }),
      onKeyPress("KeyN", () => {
        const d = latestOffer();
        if (d) sendAction({ type: "reject", dealId: d.id });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return null;
}
