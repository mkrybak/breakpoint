import { expect, test } from "@playwright/test";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;

test("API board keeps half-typed JSON across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Practice design name").fill("API board");
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);

  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Skip", exact: true }).click();
  }
  await expect(page.locator('[aria-current="step"]')).toContainText("API");
  await expect(page.getByRole("region", { name: "Entity names" })).toContainText("No entities yet");

  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByLabel("Endpoint URL")).toBeFocused();

  await page.getByLabel("Endpoint URL").pressSequentially("/v1/orders");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Response status code")).toBeFocused();
  await page.getByLabel("Response status code").fill("201");
  await page.getByLabel("HTTP method").selectOption("POST");

  await page.getByLabel("Request body").pressSequentially('{"items": [');
  await expect(page.getByText("not valid JSON")).toBeVisible();
  await page.getByLabel("Response body").fill('{"id": "o1"}');
  await expect(page.getByText("not valid JSON")).toHaveCount(1);

  await page.keyboard.press("Control+Enter");
  const card1 = page.getByRole("listitem", { name: "Endpoint 1" });
  const card2 = page.getByRole("listitem", { name: "Endpoint 2" });
  await expect(card2).toBeVisible();
  await expect(card2.getByLabel("Endpoint URL")).toBeFocused();

  await card2.getByRole("button", { name: "Move endpoint up" }).click();
  await expect(card1.getByLabel("Endpoint URL")).toHaveValue("");
  await expect(card2.getByLabel("Endpoint URL")).toHaveValue("/v1/orders");

  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((k) => {
          if (!k.startsWith("bp:design:")) return false;
          const r = JSON.parse(localStorage.getItem(k) ?? "{}");
          return r.boards?.api?.endpoints?.[1]?.url === "/v1/orders";
        }),
      ),
    )
    .toBe(true);
  await page.reload();

  await expect(card2.getByLabel("Request body")).toHaveValue('{"items": [');
  await expect(page.getByText("not valid JSON")).toBeVisible();
  await expect(card2.getByLabel("HTTP method")).toHaveValue("POST");

  await card1.getByRole("button", { name: "Delete endpoint" }).click();
  await expect(page.getByRole("list", { name: "Endpoints" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add endpoint" })).toBeFocused();
});
