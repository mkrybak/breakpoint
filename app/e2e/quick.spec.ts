import { expect, test } from "@playwright/test";

const DESIGN_ID = "e2e-quick";

/** Inline copy of T-7.3's Quick starter graph (Client → App server → SQL database). */
const STARTER_GRAPH = {
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
};

test("quick design → simple workspace → run → plain verdict", async ({
  page,
}) => {
  const record = {
    id: DESIGN_ID,
    name: "E2E Quick",
    mode: "quick",
    scenarioId: "",
    graph: STARTER_GRAPH,
    updatedAt: new Date().toISOString(),
  };
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: `bp:design:${DESIGN_ID}`, value: JSON.stringify(record) },
  );

  await page.goto(`/design/${DESIGN_ID}`);
  await expect(
    page.getByRole("button", { name: "More scenarios" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open review screen/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Time remaining in current phase")).toHaveCount(
    0,
  );
  await expect(page.getByText("Bottleneck", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Break it" })).toHaveCount(0);

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Break it" })).toBeVisible();
  await expect(page.getByText(/^[\d.]+k? rps$/).first()).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Stopped at .* of 30s/)).toBeVisible();
});

test("inspector opens on selection; design file menu exports and imports", async ({
  page,
}) => {
  const record = {
    id: DESIGN_ID,
    name: "E2E Quick",
    mode: "quick",
    scenarioId: "",
    graph: STARTER_GRAPH,
    updatedAt: new Date().toISOString(),
  };
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: `bp:design:${DESIGN_ID}`, value: JSON.stringify(record) },
  );

  // 1. nothing selected: no inspector, no sidebar Export button
  await page.goto(`/design/${DESIGN_ID}`);
  const canvas = page.locator(".react-flow");
  await expect(canvas.getByText("Client", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: /settings$/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export JSON" })).toHaveCount(
    0,
  );

  // 2. selecting a node opens the inspector without moving the viewport
  const client = canvas.getByText("Client", { exact: true });
  const before = await client.boundingBox();
  if (!before) throw new Error("Client node has no box");
  await canvas.getByText("App server", { exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Node settings" });
  await expect(inspector).toBeVisible();
  const opened = await client.boundingBox();
  expect(opened?.x).toBeCloseTo(before.x, 0);
  expect(opened?.y).toBeCloseTo(before.y, 0);

  // 3. the close button deselects and hides it, still no jump
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(
    page.getByRole("complementary", { name: /settings$/ }),
  ).toHaveCount(0);
  const closed = await client.boundingBox();
  expect(closed?.x).toBeCloseTo(before.x, 0);
  expect(closed?.y).toBeCloseTo(before.y, 0);

  // 4. export from the ⋯ menu
  await page.getByRole("button", { name: "Design file" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Export JSON/ }).click();
  expect((await download).suggestedFilename()).toBe("e2e-quick.design.json");

  // 5. a bad file shows the alert
  await page.locator('input[type="file"]').setInputFiles({
    name: "x.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  // filtered: Next's route announcer is also role="alert"
  const importAlert = page
    .getByRole("alert")
    .filter({ hasText: "Not a valid design file" });
  await expect(importAlert).toBeVisible();

  // 6. dropping a valid file on the canvas imports it and clears the alert
  const dt = await page.evaluateHandle(
    (text) => {
      const d = new DataTransfer();
      d.items.add(
        new File([text], "imported.design.json", { type: "application/json" }),
      );
      return d;
    },
    JSON.stringify({
      ...record,
      name: "Dropped",
      graph: {
        entryNodeId: "c",
        nodes: [
          {
            id: "c",
            kind: "client",
            label: "Dropped client",
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      },
    }),
  );
  await page.dispatchEvent(".react-flow", "drop", { dataTransfer: dt });
  await expect(canvas.getByText("Dropped client", { exact: true })).toBeVisible();
  await expect(canvas.getByText("App server", { exact: true })).toHaveCount(0);
  await expect(importAlert).toHaveCount(0);
});
