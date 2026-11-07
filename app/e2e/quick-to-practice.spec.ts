import { expect, test, type Page } from "@playwright/test";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;
const QUICK_ID = "e2e-quick-start";
const QUICK_NAME = "E2E Quick start";
/** Inline copy of T-7.3's starter graph (components/quick/starter.ts) — no src/ imports in e2e. */
const QUICK_RECORD = {
  id: QUICK_ID,
  name: QUICK_NAME,
  mode: "quick",
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
  updatedAt: "2026-11-05T00:00:00.000Z",
};

function row(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

test("landing → Quick → Run → Passed → Try a full practice interview → fresh Practice design", async ({
  page,
}) => {
  // An existing Quick design, opened from the saved list (the landing Quick *card*
  // resets the phase clock itself since T-7.4, so it can't prove the link's reset).
  await page.addInitScript(
    ({ key, value }) => {
      if (!window.localStorage.getItem(key))
        window.localStorage.setItem(key, value);
    },
    { key: `bp:design:${QUICK_ID}`, value: JSON.stringify(QUICK_RECORD) },
  );

  // In-tab history: an earlier Practice session leaves the global phase clock at
  // High-level design. Browser back is a client-side navigation, so stores survive.
  await page.goto("/");
  await page.getByLabel("Practice design name").fill("Warm-up");
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  }
  await expect(page.locator('[aria-current="step"]')).toContainText(
    "High-level design",
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("link", { name: QUICK_NAME, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/design/${QUICK_ID}$`));
  const quickUrl = page.url();

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/^[\d.]+k? rps$/).first()).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("region", { name: "Challenges" })).toBeVisible();

  await page
    .getByRole("button", { name: "Try a full practice interview", exact: true })
    .click();
  await expect(page).toHaveURL(DESIGN_URL);
  expect(page.url()).not.toBe(quickUrl);

  // Practice layout, fresh interview: phase 1 with a full clock, canvas locked
  await expect(page.locator('[aria-current="step"]')).toContainText(
    "Requirements",
  );
  await expect(page.getByLabel("Time remaining in current phase")).toHaveText(
    /^0[45]:\d\d$/,
  );
  await expect(
    page.getByText(/Canvas unlocks in the High-level design phase/),
  ).toBeVisible();
  // nothing leaked from Quick: no verdict, no run, Practice's default preset, no Quick UI
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Passed", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox").first()).toHaveValue("black-friday");
  await expect(
    page.getByRole("button", { name: "More scenarios" }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Challenges" })).toHaveCount(0);

  // both designs are saved, each with its own mode
  await page.goto("/");
  await expect(
    row(page, QUICK_NAME).getByText("Quick", { exact: true }),
  ).toBeVisible();
  await expect(
    row(page, "Untitled design").getByText("Practice", { exact: true }),
  ).toBeVisible();
});
