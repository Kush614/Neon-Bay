import { describe, expect, it } from "vitest";
import { ARREST_OUT_SECONDS, ARREST_SECONDS, TIP_OFF_REWARD, type Role } from "@neon-bay/shared";
import { createGameState, newPlayer, type GameState } from "../game/state.js";
import { proposeDeal, acceptDeal } from "./deals.js";
import { grabBag } from "./heist.js";
import { acceptBribe, callBackup, policeTick, setRoadblock, startArrest, tipOff, type Positions } from "./police.js";

type XZ = { x: number; z: number };

function setup() {
  const s: GameState = createGameState("t", 4);
  s.phase = "getaway";
  const add = (id: string, role: Role) => {
    const p = newPlayer({ id, name: id, kind: "agent", role, persona: "none" });
    s.players.set(id, p);
    return p;
  };
  const vega = add("vega", "cop");
  const burke = add("burke", "cop");
  const dex = add("dex", "muscle");
  const pos = new Map<string, XZ>([
    ["vega", { x: 4, z: 0 }],
    ["burke", { x: 4, z: 100 }],
    ["dex", { x: 5, z: 0 }],
  ]);
  const inCar = new Set<string>();
  const w: Positions = { pos: (id) => pos.get(id) ?? null, onFoot: (id) => !inCar.has(id) };
  const run = (seconds: number, dt = 0.05) => {
    const out = { arrested: 0, failed: [] as string[], released: 0 };
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      s.time += dt;
      const r = policeTick(s, w, dt);
      out.arrested += r.arrested.length;
      out.failed.push(...r.failed.map((f) => f.reason));
      out.released += r.released.length;
    }
    return out;
  };
  return { s, vega, burke, dex, pos, inCar, w, run };
}

describe("police", () => {
  it("arrests after 3 s within 2 m on foot; the bag drops and the player is out for 30 s", () => {
    const { s, vega, dex, w, run } = setup();
    s.alarm = true;
    dex.carryingBag = true;
    expect(startArrest(s, vega, "dex", w).ok).toBe(true);
    expect(run(ARREST_SECONDS - 0.2).arrested).toBe(0);
    expect(run(0.4).arrested).toBe(1);
    expect(dex.arrested).toBe(true);
    expect(dex.carryingBag).toBe(false);
    expect(s.droppedBags).toHaveLength(1);
    expect(run(ARREST_OUT_SECONDS - 1).released).toBe(0);
    expect(run(1.1).released).toBe(1);
    expect(dex.arrested).toBe(false);
  });

  it("the dropped bag can be picked up", () => {
    const { s, dex } = setup();
    s.droppedBags.push({ id: "bag_1", x: 10, z: 10 });
    expect(grabBag(s, dex, { x: 11, z: 10 })).toMatchObject({ ok: true, reason: "picked up a dropped bag" });
    expect(s.droppedBags).toHaveLength(0);
  });

  it("needs the alarm, a target in reach, and a cop", () => {
    const { s, vega, dex, w, pos } = setup();
    expect(startArrest(s, vega, "dex", w).reason).toMatch(/alarm/);
    s.alarm = true;
    pos.set("dex", { x: 40, z: 0 });
    expect(startArrest(s, vega, "dex", w).reason).toMatch(/m away/);
    expect(startArrest(s, dex, "vega", w).reason).toMatch(/only cops/);
  });

  it("fails if the target is in a car or gets away", () => {
    const { s, vega, w, pos, inCar, run } = setup();
    s.alarm = true;
    startArrest(s, vega, "dex", w);
    inCar.add("dex");
    expect(run(ARREST_SECONDS + 1).arrested).toBe(0);
    inCar.clear();
    pos.set("dex", { x: 30, z: 0 });
    expect(run(0.1).failed[0]).toMatch(/got away/);
    expect(s.arrests.size).toBe(0);
  });

  it("a bribe is a deal offered to a cop: paid at once, and that cop can no longer arrest the briber", () => {
    const { s, burke, vega, dex, w, pos } = setup();
    dex.cleanCash = 10_000;
    dex.dirtyCash = 50_000;
    const { deal } = proposeDeal(s, "dex", "burke", { splitPercent: 30, note: "look away" });
    expect(acceptDeal(s, "burke", deal!.id).reason).toMatch(/accept_bribe/);
    expect(acceptBribe(s, vega, deal!.id).reason).toMatch(/not made to you/);
    expect(acceptBribe(s, burke, deal!.id)).toMatchObject({ ok: true });
    // 30% of 60,000 = 18,000: 10,000 clean, then 8,000 dirty, paid in kind.
    expect([dex.cleanCash, dex.dirtyCash]).toEqual([0, 42_000]);
    expect([burke.cleanCash, burke.dirtyCash]).toEqual([10_000, 8_000]);
    s.alarm = true;
    pos.set("burke", { x: 5, z: 1 });
    expect(startArrest(s, burke, "dex", w).reason).toMatch(/took dex's money/);
    expect(startArrest(s, vega, "dex", w).ok).toBe(true);
  });

  it("tip-off pays 20,000 once, sounds the alarm and reveals the crew for 30 s", () => {
    const { s, dex, vega } = setup();
    s.phase = "prepare";
    s.time = 100;
    expect(tipOff(s, dex)).toMatchObject({ ok: true, alarmRaised: true });
    expect(dex.cleanCash).toBe(TIP_OFF_REWARD);
    expect(s.alarm).toBe(true);
    expect(s.revealUntil).toBe(130);
    expect(tipOff(s, dex).reason).toMatch(/not pay twice/);
    expect(tipOff(s, vega).ok).toBe(false);
  });

  it("roadblocks go on roads, one per cop, and expire; backup has a cooldown", () => {
    const { s, vega, run } = setup();
    expect(setRoadblock(s, vega, { x: 30, z: -100 }).reason).toMatch(/stand on a road/);
    const r = setRoadblock(s, vega, { x: 4, z: -75 });
    expect(r.ok).toBe(true);
    expect(r.roadblock!.edge).toContain("|");
    expect(setRoadblock(s, vega, { x: 4, z: -25 }).reason).toMatch(/still up/);
    run(61);
    expect(s.roadblocks.size).toBe(0);
    expect(callBackup(s, vega).ok).toBe(true);
    expect(callBackup(s, vega).reason).toMatch(/wait/);
  });
});
