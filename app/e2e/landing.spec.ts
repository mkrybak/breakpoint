import { expect, test, type Page } from "@playwright/test";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;

function row(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

test("Quick simulation opens the starter design in one click", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quick simulation", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);
  const canvas = page.locator(".react-flow");
  await expect(canvas.getByText("App server", { exact: true }).first()).toBeVisible();
  await expect(canvas.getByText("SQL database", { exact: true }).first()).toBeVisible();

  await page.goto("/");
  const quick = row(page, "Quick simulation");
  await expect(quick.getByText("Quick", { exact: true })).toBeVisible();
  await expect(quick.getByRole("link", { name: "Review" })).toHaveCount(0);
});

test("landing import creates a new design with the file's mode", async ({ page }) => {
  const file = {
    id: "file-id",
    name: "Imported quick",
    mode: "quick",
    scenarioId: "",
    graph: { nodes: [], edges: [], entryNodeId: "" },
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "imported.design.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page).toHaveURL(DESIGN_URL);

  await page.goto("/");
  await expect(row(page, "Imported quick").getByText("Quick", { exact: true })).toBeVisible();
});
