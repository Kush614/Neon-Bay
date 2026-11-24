// M2 acceptance: two clients each see the other's position change.
import { expect, test, type Page } from "@playwright/test";

type SeenPlayer = { id: string; name: string; x: number; z: number; local: boolean };

async function players(page: Page): Promise<SeenPlayer[]> {
  return page.evaluate(() => window.__neonBay?.players() ?? []);
}

async function open(page: Page, name: string) {
  await page.goto(`/?name=${name}`);
  await expect(page.getByTestId("net-status")).toHaveAttribute("data-status", "connected", { timeout: 20_000 });
}

async function waitForPeer(page: Page, peerName: string): Promise<SeenPlayer> {
  let peer: SeenPlayer | undefined;
  await expect
    .poll(async () => {
      peer = (await players(page)).find((p) => p.name === peerName && !p.local);
      return !!peer;
    }, { timeout: 15_000 })
    .toBe(true);
  return peer!;
}

/** Hold W on `mover` and assert `watcher` sees the mover's position change by at least 2 m. */
async function assertSeesMove(mover: Page, watcher: Page, moverName: string) {
  const before = await waitForPeer(watcher, moverName);
  await mover.bringToFront();
  await mover.keyboard.down("KeyW");
  await mover.waitForTimeout(1500);
  await mover.keyboard.up("KeyW");
  await expect
    .poll(async () => {
      const now = (await players(watcher)).find((p) => p.name === moverName);
      return now ? Math.hypot(now.x - before.x, now.z - before.z) : 0;
    }, { timeout: 10_000, message: `${moverName}'s movement should reach the other client` })
    .toBeGreaterThan(2);
}

test("two clients see each other move", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));

  await open(a, "Alpha");
  await open(b, "Bravo");

  await assertSeesMove(a, b, "Alpha");
  await assertSeesMove(b, a, "Bravo");

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
