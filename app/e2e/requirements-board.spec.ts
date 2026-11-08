import { expect, test } from "@playwright/test";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;

test("Requirements board: seeded NFRs, keyboard-fast lists, drag reorder, survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Practice design name").fill("Requirements check");
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);
  const designId = new URL(page.url()).pathname.split("/").pop() ?? "";

  const nfr = page.getByRole("region", { name: "Non-functional", exact: true });
  const func = page.getByRole("region", { name: "Functional", exact: true });

  // Seeded once from the default preset (no lag NFR).
  await expect(nfr.getByRole("textbox")).toHaveCount(4);
  await expect(page.getByLabel("Non-functional requirement 1", { exact: true })).toHaveValue("Target load: 5000 RPS");
  await expect(page.getByLabel("Non-functional requirement 2", { exact: true })).toHaveValue("p95 latency budget: 250 ms");
  await expect(nfr.getByText("scenario", { exact: true })).toHaveCount(4);
  await expect(page.getByLabel("Phase notes for Requirements")).toHaveValue("");

  // Enter adds below and focuses it.
  await page.getByRole("button", { name: "Add functional requirement" }).click();
  await page.keyboard.type("Users can place an order");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Users can track an order");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Admins can refund");
  await expect(page.getByLabel("Functional requirement 1", { exact: true })).toHaveValue("Users can place an order");
  await expect(page.getByLabel("Functional requirement 2", { exact: true })).toHaveValue("Users can track an order");
  await expect(page.getByLabel("Functional requirement 3", { exact: true })).toHaveValue("Admins can refund");

  // Backspace on an empty item deletes it and focuses the previous one.
  await page.keyboard.press("Enter");
  await expect(func.getByRole("textbox")).toHaveCount(4);
  await page.keyboard.press("Backspace");
  await expect(func.getByRole("textbox")).toHaveCount(3);
  await expect(page.getByLabel("Functional requirement 3", { exact: true })).toBeFocused();

  // Keyboard reorder keeps focus on the moved item.
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.getByLabel("Functional requirement 2", { exact: true })).toHaveValue("Admins can refund");
  await expect(page.getByLabel("Functional requirement 2", { exact: true })).toBeFocused();

  // Drag the second item above the first.
  await func
    .getByTitle("Drag to reorder")
    .nth(1)
    .dragTo(page.getByLabel("Functional requirement 1", { exact: true }), { targetPosition: { x: 20, y: 2 } });
  await expect(page.getByLabel("Functional requirement 1", { exact: true })).toHaveValue("Admins can refund");
  await expect(page.getByLabel("Functional requirement 2", { exact: true })).toHaveValue("Users can place an order");
  await expect(page.getByLabel("Functional requirement 3", { exact: true })).toHaveValue("Users can track an order");

  await page.getByRole("button", { name: "Delete non-functional requirement 4" }).click();
  await expect(nfr.getByRole("textbox")).toHaveCount(3);

  await expect
    .poll(() => page.evaluate((id) => localStorage.getItem(`bp:design:${id}`) ?? "", designId))
    .toContain("Admins can refund");
  await page.reload();

  await expect(page.getByLabel("Functional requirement 1", { exact: true })).toHaveValue("Admins can refund");
  await expect(page.getByLabel("Functional requirement 2", { exact: true })).toHaveValue("Users can place an order");
  await expect(page.getByLabel("Functional requirement 3", { exact: true })).toHaveValue("Users can track an order");
  await expect(nfr.getByRole("textbox")).toHaveCount(3);
  await expect(nfr.getByText("scenario", { exact: true })).toHaveCount(3);
});
