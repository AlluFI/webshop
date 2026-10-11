import { expect, test } from "@playwright/test";

test.describe("storefront smoke", () => {
  test("home shows collections and featured", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Gear that earns its keep/i);
    await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
  });

  test("catalog lists products with filters and a result count", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Catalog/i);
    await expect(page.getByLabel("Category")).toBeVisible();
    await expect(page.locator(".card, .list-view .card").first()).toBeVisible();
  });

  test("about includes company, mission, team, and shop social links", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Company" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mission" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await expect(page.getByRole("link", { name: /github.com\/volt-and-co/i })).toBeVisible();
  });

  test("unknown routes render the 404 page", async ({ page }) => {
    await page.goto("/this-aisle-does-not-exist");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/does not exist/i);
    await expect(page.getByRole("link", { name: /home/i })).toBeVisible();
  });

  test("header search can open the catalog", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search products").fill("sony");
    await page.getByLabel("Search products").press("Enter");
    await expect(page).toHaveURL(/catalog\?q=sony/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/sony/i);
  });
});
