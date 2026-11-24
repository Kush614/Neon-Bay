// Keyboard state. Tracks physical keys so layout changes do not move the bindings.
const down = new Set<string>();

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

let installed = false;
export function installKeyboard(): () => void {
  if (installed) return () => {};
  installed = true;
  const onDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    down.add(e.code);
    if (e.code === "Tab") e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const onBlur = () => down.clear();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);
  return () => {
    installed = false;
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
  };
}

export function isDown(code: string): boolean {
  return down.has(code);
}

/** WASD as a camera-relative stick: forward is +1, right is +1. */
export function moveAxes(): { forward: number; right: number; run: boolean } {
  const forward = (isDown("KeyW") || isDown("ArrowUp") ? 1 : 0) - (isDown("KeyS") || isDown("ArrowDown") ? 1 : 0);
  const right = (isDown("KeyD") || isDown("ArrowRight") ? 1 : 0) - (isDown("KeyA") || isDown("ArrowLeft") ? 1 : 0);
  return { forward, right, run: isDown("ShiftLeft") || isDown("ShiftRight") };
}

const pressHandlers = new Map<string, Set<() => void>>();
window.addEventListener("keydown", (e) => {
  if (e.repeat || isTyping(e)) return;
  for (const h of pressHandlers.get(e.code) ?? []) h();
});

/** Call `cb` once per key press (not on auto-repeat). Returns an unsubscribe function. */
export function onKeyPress(code: string, cb: () => void): () => void {
  const set = pressHandlers.get(code) ?? new Set();
  pressHandlers.set(code, set);
  set.add(cb);
  return () => set.delete(cb);
}

/** W/S and A/D as car controls. */
export function driveAxes(): { throttle: number; steer: number } {
  const { forward, right } = moveAxes();
  return { throttle: forward, steer: right };
}
