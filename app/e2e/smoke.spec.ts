import { expect, test } from "@playwright/test";
import twitter from "../examples/twitter.json";

const DESIGN_ID = "e2e-twitter";
const DESIGN_NAME = "E2E Twitter";

/**
 * examples/twitter.json with the app fleet cut to 1 replica (4k RPS cap):
 * Black Friday's 5k RPS base overloads it on the first tick, so a node
 * changes state immediately instead of at t=45s.
 */
function buildRecord() {
  const graph = structuredClone(twitter);
  const app = graph.nodes.find((n) => n.id === "app");
  if (!app) throw new Error("examples/twitter.json has no 'app' node");
  app.config = { ...app.config, replicas: 1 };
  return {
    id: DESIGN_ID,
    name: DESIGN_NAME,
    scenarioId: "",
    graph,
    updatedAt: new Date().toISOString(),
  };
}

test("landing → design → run → live state change → verdict", async ({
  page,
}) => {
  const record = buildRecord();
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: `bp:design:${DESIGN_ID}`, value: JSON.stringify(record) },
  );

  await page.goto("/");
  await page.getByRole("link", { name: DESIGN_NAME, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/design/${DESIGN_ID}$`));

  // the canvas rendered the seeded graph
  await expect(
    page.getByText("App fleet", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Run", exact: true }).click();

  // a node changed state: the worker streamed frames and the event log shows it
  await expect(page.getByText(/App fleet overloaded/).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Stop", exact: true }).click();

  // a verdict appeared
  await expect(page.getByText(/^(Passed|Failed)$/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("button", { name: "Re-run", exact: true }),
  ).toBeVisible();
});
