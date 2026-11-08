import { expect, test, type Locator, type Page } from "@playwright/test";

const DESIGN_URL = /\/design\/[0-9a-f-]{36}$/;

async function newPracticeDesign(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Practice design name").fill("Entities e2e");
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await expect(page).toHaveURL(DESIGN_URL);
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}

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

const storedRecord = (page: Page, id: string) =>
  page.evaluate((key) => localStorage.getItem(key) ?? "", `bp:design:${id}`);

test("build, relate, retype, reorder and delete on the Entities board; it survives a reload", async ({ page }) => {
  const id = await newPracticeDesign(page);
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  const board = page.getByRole("region", { name: "Entities board" });
  const nodes = board.locator(".react-flow__node");

  // + Entity focuses the new name; Enter moves into the fields.
  await board.getByRole("button", { name: "Add entity" }).click();
  await expect(nodes.nth(0).getByLabel("Entity name")).toBeFocused();
  await page.keyboard.type("User");
  await page.keyboard.press("Enter");
  await expect(nodes.nth(0).getByLabel("Field name").first()).toBeFocused();
  await page.keyboard.type("id");
  await page.keyboard.press("Tab");
  await page.keyboard.type("uuid");
  await page.keyboard.press("Enter");
  await page.keyboard.type("email");
  await page.keyboard.press("Tab");
  await page.keyboard.type("string");

  await board.getByRole("button", { name: "Add entity" }).click();
  await expect(nodes.nth(1).getByLabel("Entity name")).toBeFocused();
  await page.keyboard.type("Order");

  // The second box lands on a free spot.
  const a = await nodes.nth(0).boundingBox();
  const b = await nodes.nth(1).boundingBox();
  if (!a || !b) throw new Error("entity boxes not rendered");
  expect(b.x >= a.x + a.width || b.y >= a.y + a.height).toBe(true);

  // A new line defaults to one-to-many.
  await connectEntities(page, nodes.nth(0), nodes.nth(1));
  await expect(board.locator('[data-relation-kind="one-to-many"]')).toHaveCount(1);

  // Clicking the line opens the picker; choosing a kind closes it.
  await board.locator(".react-flow__edge").first().dispatchEvent("click");
  await expect(page.getByRole("button", { name: "One-to-many", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Many-to-many", exact: true }).click();
  await expect(board.locator('[data-relation-kind="many-to-many"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Many-to-many", exact: true })).toHaveCount(0);

  // Alt+↑ reorders fields.
  await nodes.nth(0).getByLabel("Field name").nth(1).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(nodes.nth(0).getByLabel("Field name").nth(0)).toHaveValue("email");

  await expect.poll(() => storedRecord(page, id)).toContain("many-to-many");

  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(nodes.nth(0).getByLabel("Entity name")).toHaveValue("User");
  await expect(nodes.nth(0).getByLabel("Field name").nth(0)).toHaveValue("email");
  await expect(board.locator('[data-relation-kind="many-to-many"]')).toHaveCount(1);

  // Deleting a box deletes its relations.
  await nodes.nth(0).getByRole("button", { name: "Delete entity" }).click();
  await expect(nodes).toHaveCount(1);
  await expect(board.locator(".react-flow__edge")).toHaveCount(0);
  await expect
    .poll(async () => JSON.parse(await storedRecord(page, id)).boards.entities.relations.length)
    .toBe(0);
});

test("a box can relate to itself", async ({ page }) => {
  await newPracticeDesign(page);
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  const board = page.getByRole("region", { name: "Entities board" });
  const nodes = board.locator(".react-flow__node");
  await board.getByRole("button", { name: "Add entity" }).click();
  await expect(nodes.nth(0).getByLabel("Entity name")).toBeFocused();
  await page.keyboard.type("User");

  await connectEntities(page, nodes.nth(0), nodes.nth(0));
  await expect(board.locator('[data-relation-kind="one-to-many"]')).toHaveCount(1);
});
