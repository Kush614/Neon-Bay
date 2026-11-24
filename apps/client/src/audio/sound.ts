// Procedural sound (original, synthesised in WebAudio; no audio files): a synthwave bed whose
// tempo rises with the phase, ocean surf, footsteps, car engine, vault drill and alarm, plus UI
// stingers for phase changes, radio, deals and banked bags. Audio starts on the first key/click
// (browser autoplay rules). ?mute=1 or the K key silences it.
import { useLocalStore } from "../store.js";
import { useNetStore } from "../net/connection.js";

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;
let muted = typeof location !== "undefined" && new URLSearchParams(location.search).get("mute") === "1";

function noiseBuffer(c: AudioContext): AudioBuffer {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, bus: AudioNode = sfxBus, glideTo?: number) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  env(g, t, 0.008, vol, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst(dur: number, vol: number, filter: BiquadFilterType, freq: number, when = 0, q = 1) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.004, vol, dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------------------------
// One-shot effects.

export const sfx = {
  footstep(run: boolean) {
    burst(0.07, run ? 0.22 : 0.14, "bandpass", 900 + Math.random() * 400, 0, 1.2);
    tone(90 + Math.random() * 20, 0.06, "sine", run ? 0.18 : 0.1);
  },
  phase() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.35, "sawtooth", 0.08, i * 0.09));
    tone(130.8, 0.8, "triangle", 0.2);
  },
  radio() {
    burst(0.25, 0.1, "bandpass", 2500, 0, 3);
    tone(1760, 0.08, "square", 0.05, 0.27);
    tone(2349, 0.12, "square", 0.05, 0.36);
  },
  vaultOpen() {
    tone(220, 0.9, "sawtooth", 0.15, 0, sfxBus, 880);
    [880, 1108.7, 1318.5].forEach((f, i) => tone(f, 0.5, "triangle", 0.12, 0.9 + i * 0.07));
    burst(0.6, 0.2, "lowpass", 400, 0.85);
  },
  bagGrab() {
    burst(0.15, 0.25, "lowpass", 600);
    tone(1318.5, 0.08, "square", 0.06, 0.05);
    tone(1760, 0.12, "square", 0.06, 0.12);
  },
  cash() {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.18, "square", 0.06, i * 0.06));
    burst(0.3, 0.1, "highpass", 6000, 0.25);
  },
  carDoor() {
    burst(0.12, 0.35, "lowpass", 300);
    tone(70, 0.15, "sine", 0.25);
  },
  deal() {
    tone(880, 0.1, "sine", 0.1);
    tone(1174.7, 0.18, "sine", 0.1, 0.11);
  },
  blip() {
    tone(1400, 0.05, "square", 0.05);
  },
  betrayal() {
    tone(311, 0.6, "sawtooth", 0.12, 0, sfxBus, 155);
    tone(293.7, 0.6, "sawtooth", 0.1, 0, sfxBus, 146.8);
  },
};

// ---------------------------------------------------------------------------------------------
// Loops: synthwave music, surf, engine, alarm, vault drill.

const BASS = [41.2, 41.2, 49, 36.7]; // E1 E1 G1 D1 (per bar)
const ARP = [0, 7, 12, 15, 12, 7, 3, 7];
const TEMPO: Record<string, number> = { lobby: 92, plan: 96, prepare: 104, heist: 118, getaway: 128, payout: 90, ended: 84 };

let step = 0;
let nextNote = 0;
let engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
let alarm: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
let drillGain: GainNode | null = null;
let surfGain: GainNode | null = null;

function startLoops(c: AudioContext) {
  // Surf: filtered noise swelling slowly.
  const s = c.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 600;
  surfGain = c.createGain();
  surfGain.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain).connect(surfGain.gain);
  s.connect(f).connect(surfGain).connect(sfxBus);
  s.start();
  lfo.start();
  // Engine: two detuned saws through a lowpass; pitch follows speed.
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  o1.type = o2.type = "sawtooth";
  o2.detune.value = 14;
  const ef = c.createBiquadFilter();
  ef.type = "lowpass";
  ef.frequency.value = 500;
  const eg = c.createGain();
  eg.gain.value = 0;
  o1.connect(ef);
  o2.connect(ef);
  ef.connect(eg).connect(sfxBus);
  o1.start();
  o2.start();
  engine = { osc: o1, osc2: o2, gain: eg, filter: ef };
  // Alarm: two-tone siren.
  const ao = c.createOscillator();
  ao.type = "square";
  ao.frequency.value = 880;
  const al = c.createOscillator();
  al.type = "square";
  al.frequency.value = 2;
  const alg = c.createGain();
  alg.gain.value = 220;
  al.connect(alg).connect(ao.frequency);
  const ag = c.createGain();
  ag.gain.value = 0;
  const af = c.createBiquadFilter();
  af.type = "lowpass";
  af.frequency.value = 2200;
  ao.connect(af).connect(ag).connect(sfxBus);
  ao.start();
  al.start();
  alarm = { osc: ao, gain: ag, lfo: al };
  // Vault drill: high noise band, gated on while someone works the panel.
  const d = c.createBufferSource();
  d.buffer = noise;
  d.loop = true;
  const df = c.createBiquadFilter();
  df.type = "bandpass";
  df.frequency.value = 3200;
  df.Q.value = 6;
  drillGain = c.createGain();
  drillGain.gain.value = 0;
  d.connect(df).connect(drillGain).connect(sfxBus);
  d.start();
}

function scheduleMusic(c: AudioContext) {
  const phase = useNetStore.getState().game.phase;
  const bpm = TEMPO[phase] ?? 96;
  const sixteenth = 60 / bpm / 4;
  if (nextNote < c.currentTime) nextNote = c.currentTime + 0.05;
  while (nextNote < c.currentTime + 0.2) {
    const bar = Math.floor(step / 16) % 4;
    const root = BASS[bar]!;
    const t = nextNote - c.currentTime;
    const s16 = step % 16;
    // Driving octave bass on eighths.
    if (s16 % 2 === 0) tone(root * (s16 % 4 === 0 ? 2 : 4), sixteenth * 1.6, "sawtooth", 0.07, t, musicBus);
    // Arpeggio on sixteenths, an octave set by intensity.
    const lift = phase === "heist" || phase === "getaway" ? 8 : 4;
    tone(root * lift * Math.pow(2, ARP[step % 8]! / 12), sixteenth * 0.9, "square", 0.025, t, musicBus);
    // Gated drums: kick on 1 and 3, snare on 2 and 4, hats on eighths.
    if (s16 === 0 || s16 === 8) tone(150, 0.18, "sine", 0.35, t, musicBus, 40);
    if (s16 === 4 || s16 === 12) {
      const sn = c.createBufferSource();
      sn.buffer = noise;
      const g = c.createGain();
      env(g, c.currentTime + t, 0.003, 0.12, 0.18);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1500;
      sn.connect(hp).connect(g).connect(musicBus);
      sn.start(c.currentTime + t, Math.random());
      sn.stop(c.currentTime + t + 0.25);
    }
    if (s16 % 2 === 1) {
      const h = c.createBufferSource();
      h.buffer = noise;
      const g = c.createGain();
      env(g, c.currentTime + t, 0.002, 0.03, 0.04);
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 8000;
      h.connect(hp).connect(g).connect(musicBus);
      h.start(c.currentTime + t, Math.random());
      h.stop(c.currentTime + t + 0.08);
    }
    nextNote += sixteenth;
    step++;
  }
}

// ---------------------------------------------------------------------------------------------
// Reacting to game state.

let lastPhase = "";
let lastFeed = 0;
let lastBag = false;
let lastCar = false;
let lastVault = false;
let lastBanked = 0;
let lastDeals = 0;
let stepDist = 0;
const lastPos = { x: 0, z: 0, init: false };
let lastVaultPct = 0;
let drillUntil = 0;

function tick() {
  const c = ctx;
  if (!c) return;
  scheduleMusic(c);
  const net = useNetStore.getState();
  const g = net.game;
  const me = net.roster.find((r) => r.isLocal);
  const local = useLocalStore.getState();
  const now = c.currentTime;

  if (g.phase !== lastPhase) {
    if (lastPhase) sfx.phase();
    lastPhase = g.phase;
  }
  const newest = net.feed[net.feed.length - 1];
  if (newest && newest.at > lastFeed) {
    if (lastFeed) {
      if (newest.text.includes("96.6") || newest.text.toLowerCase().includes("radio")) sfx.radio();
      else if (/betray/i.test(newest.text)) sfx.betrayal();
      else sfx.blip();
    }
    lastFeed = newest.at;
  }
  if (g.vaultOpen && !lastVault) sfx.vaultOpen();
  lastVault = g.vaultOpen;
  if (g.bagsBanked > lastBanked) sfx.cash();
  lastBanked = g.bagsBanked;
  if (net.deals.length > lastDeals) sfx.deal();
  lastDeals = net.deals.length;
  if (me) {
    if (me.carryingBag && !lastBag) sfx.bagGrab();
    if (me.inVehicle !== lastCar) sfx.carDoor();
    lastBag = me.carryingBag;
    lastCar = me.inVehicle;
  }

  // Footsteps from distance walked; engine from distance driven.
  const p = local.position;
  if (!lastPos.init) Object.assign(lastPos, { x: p.x, z: p.z, init: true });
  const moved = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
  lastPos.x = p.x;
  lastPos.z = p.z;
  const driving = me?.inVehicle ?? false;
  if (!driving && moved < 3) {
    stepDist += moved;
    const stride = local.running ? 1.6 : 1.1;
    if (stepDist > stride) {
      stepDist = 0;
      sfx.footstep(local.running);
    }
  }
  if (engine) {
    const speed = driving ? Math.min(moved * 60, 40) : 0;
    engine.gain.gain.setTargetAtTime(driving ? 0.06 : 0, now, 0.15);
    engine.osc.frequency.setTargetAtTime(38 + speed * 2.2, now, 0.1);
    engine.osc2.frequency.setTargetAtTime(38 + speed * 2.2, now, 0.1);
    engine.filter.frequency.setTargetAtTime(400 + speed * 40, now, 0.1);
  }
  if (alarm) alarm.gain.gain.setTargetAtTime(g.alarm ? 0.05 : 0, now, 0.2);
  if (g.vaultPercent !== lastVaultPct && !g.vaultOpen) drillUntil = now + 1.2;
  lastVaultPct = g.vaultPercent;
  if (drillGain) drillGain.gain.setTargetAtTime(now < drillUntil ? 0.05 : 0, now, 0.1);
  // Surf grows as you approach the shore (x 198).
  if (surfGain) surfGain.gain.setTargetAtTime(Math.max(0, 1 - Math.abs(p.x - 198) / 90) * 0.12 + 0.01, now, 0.5);
}

function applyMute() {
  if (!ctx) return;
  master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  applyMute();
  return muted;
}

function unlock() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  noise = noiseBuffer(ctx);
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  // A short feedback delay gives the music its 80s space.
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.32;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  musicBus.connect(master);
  musicBus.connect(delay).connect(fb).connect(delay);
  delay.connect(master);
  sfxBus.connect(master);
  applyMute();
  startLoops(ctx);
  setInterval(tick, 50);
}

/** Install once: audio starts on the first user gesture. */
export function installSound() {
  if (typeof window === "undefined") return;
  const start = () => unlock();
  window.addEventListener("pointerdown", start);
  window.addEventListener("keydown", (e) => {
    start();
    if (e.code === "KeyK" && !(e.target instanceof HTMLInputElement)) toggleMute();
  });
}
