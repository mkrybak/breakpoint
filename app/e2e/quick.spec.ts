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
