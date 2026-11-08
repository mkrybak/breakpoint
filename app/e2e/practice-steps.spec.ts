import { expect, test, type Page } from "@playwright/test";
import twitter from "../examples/twitter.json";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;
const RUN_ID = "e2e-steps-run";
const RUN_NAME = "E2E steps run";

async function newPracticeDesign(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Practice design name").fill(name);
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);
}

const board = (page: Page, label: string) =>
  page.getByRole("region", { name: `${label} board` });
const timer = (page: Page) => page.getByLabel("Time remaining in current phase");
const current = (page: Page) => page.locator('[aria-current="step"]');
const palette = (page: Page) =>
  page.getByRole("heading", { name: "Components", exact: true });
const stepChip = (page: Page, label: string) =>
  page.getByRole("button", { name: `${label} step`, exact: true });

function toSec(mmss: string | null): number {
  const [m, s] = (mmss ?? "").trim().split(":").map(Number);
  return m * 60 + s;
}

/** examples/twitter.json with the app fleet cut to 1 replica, so Black Friday overloads it at once (as smoke.spec.ts). */
function buildRecord() {
  const graph = structuredClone(twitter);
  const app = graph.nodes.find((n) => n.id === "app");
  if (!app) throw new Error("examples/twitter.json has no 'app' node");
  app.config = { ...app.config, replicas: 1 };
  return {
    id: RUN_ID,
    name: RUN_NAME,
    scenarioId: "",
    graph,
    updatedAt: new Date().toISOString(),
  };
}

test("jumping back views an earlier board while the clock keeps counting on the current step", async ({
  page,
}) => {
  await page.clock.install();
  await newPracticeDesign(page, "Steps back");
  await expect(board(page, "Requirements")).toBeVisible();
  await expect(palette(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(current(page)).toContainText("Entities");
  await expect(board(page, "Entities")).toBeVisible();

  await stepChip(page, "Requirements").click();
  await expect(board(page, "Requirements")).toBeVisible();
  await expect(current(page)).toContainText("Entities");
  await expect(stepChip(page, "Requirements")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Notes — Requirements" }),
  ).toBeVisible();
  const back = page.getByRole("button", {
    name: /^Back to Entities · \d\d:\d\d$/,
  });
  await expect(back).toBeVisible();

  const t1 = toSec(await timer(page).textContent());
  await page.clock.runFor(10_000);
  await expect
    .poll(async () => t1 - toSec(await timer(page).textContent()))
    .toBeGreaterThanOrEqual(10);
  expect(t1 - toSec(await timer(page).textContent())).toBeLessThanOrEqual(12);
  // The back chip shows the live clock (polled: the fake clock still flows).
  await expect
    .poll(async () => {
      const chip = await back.locator(".font-mono").textContent();
      return chip === (await timer(page).textContent());
    })
    .toBe(true);

  await back.click();
  await expect(board(page, "Entities")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Back to/ })).toHaveCount(0);
});

test("a timeout while typing keeps focus, text and the view (review focus 1)", async ({
  page,
}) => {
  await page.clock.install();
  await newPracticeDesign(page, "Steps timeout");
  const notes = page.getByLabel("Phase notes for Requirements");
  await notes.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("first half ");
  await page.clock.runFor("05:00");
  await page.keyboard.type("second half");

  await expect(notes).toBeFocused();
  await expect(notes).toHaveValue(/first half second half$/);
  await expect(board(page, "Requirements")).toBeVisible();
  await expect(current(page)).toContainText("Entities");
  await expect(page.getByRole("button", { name: "Go to Entities" })).toBeVisible();

  // The typing never leaked into the next step's note.
  await page.getByRole("button", { name: "Go to Entities" }).click();
  await expect(page.getByLabel("Phase notes for Entities")).toHaveValue("");

  // A boundary passing while viewing an earlier step keeps the view too.
  await stepChip(page, "Requirements").click();
  await page.clock.runFor("02:00");
  await expect(board(page, "Requirements")).toBeVisible();
  await expect(current(page)).toContainText("API");
  await expect(page.getByRole("button", { name: "Go to API" })).toBeVisible();
});

test("reload while viewing an earlier step opens on the clock's step (review focus 2)", async ({
  page,
}) => {
  await newPracticeDesign(page, "Steps reload");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(current(page)).toContainText("API");
  await stepChip(page, "Entities").click();
  await expect(board(page, "Entities")).toBeVisible();

  await page.reload();
  await expect(current(page)).toContainText("API");
  await expect(board(page, "API")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Back to/ })).toHaveCount(0);
  await expect(stepChip(page, "Entities")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("heading", { name: "Notes — API" })).toBeVisible();
  await expect(timer(page)).toHaveText(/^0[45]:\d\d$/);
});

test("an earlier board in High-level design replaces only the canvas while a run keeps going", async ({
  page,
}) => {
  const seeds = [
    { key: `bp:design:${RUN_ID}`, value: JSON.stringify(buildRecord()) },
    {
      key: `bp:phase:${RUN_ID}`,
      value: JSON.stringify({
        phase: "hld",
        remainingSec: 900,
        elapsedSec: 0,
        running: true,
      }),
    },
  ];
  for (const seed of seeds) {
    await page.addInitScript(({ key, value }) => {
      if (!window.localStorage.getItem(key))
        window.localStorage.setItem(key, value);
    }, seed);
  }

  await page.goto(`/design/${RUN_ID}`);
  const appNode = page.getByText("App fleet", { exact: true });
  await expect(appNode.first()).toBeVisible();
  await expect(palette(page)).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible();

  await stepChip(page, "Entities").click();
  await expect(board(page, "Entities")).toBeVisible();
  await expect(appNode).toHaveCount(0);
  await expect(palette(page)).toHaveCount(0);
  await expect(stop).toBeVisible();
  // The run progressed while the board was shown.
  await expect(page.getByText(/App fleet overloaded/).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /^Back to High-level design/ }).click();
  await expect(appNode.first()).toBeVisible();
  await expect(palette(page)).toBeVisible();
  await stop.click();
});
