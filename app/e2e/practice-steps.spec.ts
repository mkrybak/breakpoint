import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
const timer = (page: Page) =>
  page.getByLabel("Time remaining in current phase");
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
  await expect(
    page.getByRole("button", { name: "Go to Entities" }),
  ).toBeVisible();

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
  await expect(
    page.getByRole("heading", { name: "Notes — API" }),
  ).toBeVisible();
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

  await page
    .getByRole("button", { name: /^Back to High-level design/ })
    .click();
  await expect(appNode.first()).toBeVisible();
  await expect(palette(page)).toBeVisible();
  await stop.click();
});

const DEMO_ID = "e2e-boards-demo";
const DEMO_NAME = "E2E Boards demo";
/** A runnable M12-era Practice record (no `boards` field): Client → App server (1 replica, overloads under Black Friday at t=0) → SQL database. */
const DEMO_RECORD = {
  id: DEMO_ID,
  name: DEMO_NAME,
  mode: "practice",
  scenarioId: "",
  graph: {
    entryNodeId: "client",
    nodes: [
      {
        id: "client",
        kind: "client",
        label: "Client",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "app",
        kind: "app_server",
        label: "App server",
        position: { x: 280, y: 0 },
        config: { replicas: 1 },
      },
      {
        id: "db",
        kind: "db_sql",
        label: "SQL database",
        position: { x: 560, y: 0 },
        config: { replicas: 0, sharded: false, readYourWrites: false },
      },
    ],
    edges: [
      {
        id: "e-client-app",
        source: "client",
        target: "app",
        callsPerRequest: 1,
        kind: "sync",
      },
      {
        id: "e-app-db",
        source: "app",
        target: "db",
        callsPerRequest: 1,
        kind: "sync",
      },
    ],
  },
  updatedAt: "2026-11-07T00:00:00.000Z",
};

/** Drag a relation from one entity box's source handle to another's target handle. */
async function connectEntities(page: Page, from: Locator, to: Locator) {
  const a = await from.locator(".react-flow__handle.source").boundingBox();
  const b = await to.locator(".react-flow__handle.target").boundingBox();
  if (!a || !b) throw new Error("entity handles not rendered");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("milestone demo: boards → earlier board in HLD → run → export bundle → import in a fresh browser → review + report", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);

  // 1. Seed and open (no phase key: the clock starts fresh on Requirements).
  await page.addInitScript(
    ({ key, value }) => {
      if (!window.localStorage.getItem(key))
        window.localStorage.setItem(key, value);
    },
    { key: `bp:design:${DEMO_ID}`, value: JSON.stringify(DEMO_RECORD) },
  );
  await page.goto("/");
  await page.getByRole("link", { name: DEMO_NAME, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/design/${DEMO_ID}$`));

  // 2. Requirements: the old record got empty boards, then the NFRs were seeded.
  const nfr = page.getByRole("region", { name: "Non-functional", exact: true });
  const fn = page.getByRole("region", { name: "Functional", exact: true });
  await expect(
    page.getByLabel("Non-functional requirement 1", { exact: true }),
  ).toHaveValue("Target load: 5000 RPS");
  await expect(
    nfr.getByText("scenario", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add functional requirement", exact: true })
    .click();
  await page.keyboard.type("Users place orders");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Users list their orders");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Users cancel an order");
  await expect(fn.getByRole("textbox")).toHaveCount(3);
  await expect(
    page.getByLabel("Functional requirement 3", { exact: true }),
  ).toHaveValue("Users cancel an order");
  await page
    .getByLabel("Phase notes for Requirements")
    .fill("Orders are the core flow");

  // 3. Entities.
  await stepChip(page, "Entities").click();
  const ent = board(page, "Entities").first();
  await expect(ent).toBeVisible();
  const nodes = ent.locator(".react-flow__node");
  const model: [string, [string, string][]][] = [
    [
      "User",
      [
        ["id", "uuid"],
        ["email", "string"],
      ],
    ],
    [
      "Order",
      [
        ["id", "uuid"],
        ["total", "int"],
      ],
    ],
    [
      "Product",
      [
        ["id", "uuid"],
        ["title", "string"],
      ],
    ],
  ];
  for (const [i, [name, fields]] of model.entries()) {
    await ent.getByRole("button", { name: "Add entity" }).click();
    const node = nodes.nth(i);
    await node.getByLabel("Entity name").fill(name);
    for (const [f, t] of fields) {
      await node.getByRole("button", { name: "Add field" }).click();
      await node.getByLabel("Field name").last().fill(f);
      await node.getByLabel("Field type").last().fill(t);
    }
  }
  await connectEntities(page, nodes.nth(0), nodes.nth(1));
  await connectEntities(page, nodes.nth(1), nodes.nth(2));
  await expect(ent.locator('[data-relation-kind="one-to-many"]')).toHaveCount(
    2,
  );
  await ent.locator(".react-flow__edge").nth(1).dispatchEvent("click");
  await page.getByRole("button", { name: "Many-to-many", exact: true }).click();
  await expect(ent.locator('[data-relation-kind="many-to-many"]')).toHaveCount(
    1,
  );
  await expect(ent.locator('[data-relation-kind="one-to-many"]')).toHaveCount(
    1,
  );

  // 4. API.
  await stepChip(page, "API").click();
  await page.getByRole("button", { name: "Add endpoint", exact: true }).click();
  await page.getByLabel("HTTP method", { exact: true }).selectOption("POST");
  await page.getByLabel("Endpoint URL", { exact: true }).fill("/v1/orders");
  await page.getByLabel("Response status code", { exact: true }).fill("201");
  await page
    .getByLabel("Request body", { exact: true })
    .fill('{ "productId": "p1", "qty": 2 }');
  await page
    .getByLabel("Response body", { exact: true })
    .fill('{ "id": "o1", "status": "placed" }');

  // 5. HLD, then an earlier board while the HLD clock keeps counting.
  await stepChip(page, "High-level design").click();
  await expect(current(page)).toContainText("High-level design");
  await expect(
    page.getByText("App server", { exact: true }).first(),
  ).toBeVisible();
  await stepChip(page, "Entities").click();
  await expect(ent).toBeVisible();
  await expect(current(page)).toContainText("High-level design");
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeVisible();
  const t = (await timer(page).textContent()) ?? "";
  await expect(timer(page)).not.toHaveText(t);
  await page
    .getByRole("button", { name: /^Back to High-level design/ })
    .click();
  await expect(ent).toHaveCount(0);

  // 6. Run.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/App server overloaded/).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByText(/^(Passed|Failed)$/)).toBeVisible({
    timeout: 10_000,
  });

  // 7. In-session review and bundle export.
  await page.getByRole("link", { name: "Open review screen →" }).click();
  await expect(page).toHaveURL(new RegExp(`/review/${DEMO_ID}$`));
  await expect(page.getByRole("tab", { name: /^Entities/ })).toBeVisible();
  const bundleWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export bundle" }).click();
  const bundlePath = testInfo.outputPath("demo.breakmydesign.json");
  await (await bundleWait).saveAs(bundlePath);
  expect(
    JSON.parse(readFileSync(bundlePath, "utf8")).design.boards.entities
      .relations,
  ).toHaveLength(2);

  // 8. Import in a fresh browser context: the bundle alone carries the boards.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("/review/import-check");
  await fresh.locator('input[type="file"]').setInputFiles(bundlePath);
  await expect(fresh).toHaveURL(new RegExp(`/review/${DEMO_ID}$`));
  const panel = fresh.getByRole("tabpanel");

  await fresh.getByRole("tab", { name: /^Requirements/ }).click();
  await expect(
    panel.getByText("Users place orders", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Users cancel an order", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("scenario", { exact: true }).first(),
  ).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  await fresh.getByRole("tab", { name: /^Entities/ }).click();
  for (const name of ["User", "Order", "Product"]) {
    await expect(panel.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(panel.locator('[data-relation-kind="one-to-many"]')).toHaveCount(
    1,
  );
  await expect(
    panel.locator('[data-relation-kind="many-to-many"]'),
  ).toHaveCount(1);
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  await fresh.getByRole("tab", { name: /^API/ }).click();
  await expect(panel.getByText("POST", { exact: true })).toBeVisible();
  await expect(panel.getByText("/v1/orders", { exact: true })).toBeVisible();
  await expect(panel.getByText("201", { exact: true })).toBeVisible();
  await expect(panel.getByText(/"productId"/).first()).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  // 9. The report from the imported design.
  const reportWait = fresh.waitForEvent("download");
  await fresh.getByRole("button", { name: "Export report" }).click();
  const reportPath = testInfo.outputPath("demo.review.md");
  await (await reportWait).saveAs(reportPath);
  const md = readFileSync(reportPath, "utf8");
  for (const line of [
    "- Users place orders",
    "- Target load: 5000 RPS _(scenario)_",
    "**User**",
    "- email: string",
    "- User 1 → many Order",
    "- Order many → many Product",
    "### POST /v1/orders → 201",
    '```json\n{ "productId": "p1", "qty": 2 }\n```',
    "Orders are the core flow",
  ]) {
    expect(md).toContain(line);
  }
  await context.close();
});
