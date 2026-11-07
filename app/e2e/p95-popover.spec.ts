import { expect, test, type Page } from "@playwright/test";

const DESIGN_ID = "e2e-p95";

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

/** Seeds a Quick design saved before the T-8.7 p95 model (so the one-time note is due). */
async function seedOldDesign(page: Page) {
  const record = {
    id: DESIGN_ID,
    name: "E2E p95",
    mode: "quick",
    scenarioId: "",
    graph: STARTER_GRAPH,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: `bp:design:${DESIGN_ID}`, value: JSON.stringify(record) },
  );
}

async function runUntilFrames(page: Page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/^[\d.]+k? rps$/).first()).toBeVisible({
    timeout: 10_000,
  });
}

test("p95 popover explains the number and names the tail's biggest share; the new-model note shows once", async ({
  page,
}) => {
  await seedOldDesign(page);
  await page.goto(`/design/${DESIGN_ID}`);

  const note = page
    .getByRole("status")
    .filter({ hasText: "p95 is now more realistic" });
  await runUntilFrames(page);
  await expect(note).toBeVisible();

  await page.getByRole("button", { name: /^p95/ }).click();
  const dialog = page.getByRole("dialog", { name: "About p95" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("95% of requests finish faster");
  await expect(dialog).toContainText("App server");
  await expect(note).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  await page.reload();
  await runUntilFrames(page);
  await expect(note).toHaveCount(0); // dismissed persists
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

test.describe("on touch", () => {
  test.use({ hasTouch: true });

  test("tapping Errors and p95 opens their explanations", async ({ page }) => {
    await seedOldDesign(page);
    await page.goto(`/design/${DESIGN_ID}`);
    await runUntilFrames(page);

    await page.getByRole("button", { name: /^Errors/ }).tap();
    await expect(
      page.getByRole("dialog", { name: "About Errors" }),
    ).toContainText("Requests the client saw fail");

    await page.getByRole("button", { name: /^p95/ }).tap();
    await expect(page.getByRole("dialog", { name: "About p95" })).toBeVisible();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  });
});
