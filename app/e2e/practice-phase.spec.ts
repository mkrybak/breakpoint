import { expect, test } from "@playwright/test";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;
const LOCK = /Canvas unlocks in the High-level design phase/;

test("Practice phase survives a reload: canvas stays unlocked in High-level design", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Practice design name").fill("Reload check");
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);
  await expect(page.getByText(LOCK)).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  }
  await expect(page.locator('[aria-current="step"]')).toContainText("High-level design");
  await expect(page.getByText(LOCK)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[aria-current="step"]')).toContainText("High-level design");
  await expect(page.getByLabel("Time remaining in current phase")).toHaveText(/^1[45]:\d\d$/);
  await expect(page.getByText(LOCK)).toHaveCount(0);
});
