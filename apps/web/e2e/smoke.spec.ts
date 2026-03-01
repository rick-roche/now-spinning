import { test, expect } from "@playwright/test";

test("home renders after auth status", async ({ page }) => {
  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ lastfmConnected: false, discogsConnected: false }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Get Started" })).toBeVisible();
  await expect(page.getByText("Connect your music services")).toBeVisible();
});

test("collection renders items after auth", async ({ page }) => {
  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ lastfmConnected: false, discogsConnected: true }),
    });
  });

  await page.route("**/api/discogs/collection**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: 1,
        pages: 1,
        perPage: 20,
        totalItems: 1,
        items: [
          {
            instanceId: "inst-1",
            releaseId: "rel-1",
            title: "Loaded Album",
            artist: "Loaded Artist",
            year: 2024,
            thumbUrl: "https://example.com/thumb.jpg",
            formats: ["Vinyl"],
          },
        ],
      }),
    });
  });

  await page.goto("/collection");

  await expect(page.getByText("Loaded Album")).toBeVisible();
  await expect(page.getByTestId("collection-skeleton")).toHaveCount(0);
});
