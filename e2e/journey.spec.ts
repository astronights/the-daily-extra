import { expect, test, type Page } from "@playwright/test";

// One full journey per device. Each device uses its own pack names so
// both can run against the same server.
test.describe.configure({ mode: "serial" });

const lines = (prefix: string, n = 100) => Array.from({ length: n }, (_, i) => `${prefix} line number ${i + 1}, a fine one`).join("\n");

let suffix = "";
test.beforeAll(({}, info) => {
  suffix = info.project.name === "mobile" ? "m" : "d";
});

async function signIn(page: Page) {
  await page.goto("/admin");
  if (await page.getByRole("button", { name: "Sign out" }).isVisible()) return;
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Let me in" }).click();
  await expect(page.getByText("Nope. Try again.")).toBeVisible();
  await page.getByLabel("Password").fill("test-admin");
  await page.getByRole("button", { name: "Let me in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function fillPackForm(page: Page, slug: string, count = 100) {
  await page.getByLabel("Pack name").fill(slug);
  await page.getByLabel("What does it give you, once a day?").fill(`The ${slug} pack, daily`);
  await page.getByLabel("“Today's …”").fill("drama");
  await page.getByLabel("Rated on…").fill("Spice");
  await page.getByLabel("Lines (one per line)").fill(lines(slug, count));
}

test("home works before any pack exists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Extra!" })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub · @astronights/ })).toHaveAttribute("href", "https://github.com/astronights");
});

test("admin creates a pack from pasted lines", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "New pack" }).click();
  await fillPackForm(page, `drama-${suffix}`, 99);
  await expect(page.getByText("99 / 100")).toBeVisible();
  await page.getByRole("button", { name: "Create pack" }).click();
  await expect(page.getByText("We need at least 100 different lines. You have 99.")).toBeVisible();

  await page.getByLabel("Lines (one per line)").fill(lines(`drama-${suffix}`, 120));
  await expect(page.getByText("120 / 100")).toBeVisible();
  await page.getByRole("button", { name: "Create pack" }).click();
  await expect(page.getByText(`/drama-${suffix} is live with 120 lines.`)).toBeVisible();
});

test("reader sees today's line, copies it, follows the pack", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/drama-${suffix}`);
  await expect(page.getByText("Today's drama")).toBeVisible();
  await expect(page.locator(".quote")).toContainText(`drama-${suffix} line number`);
  await expect(page.getByText(/next in \d\d:\d\d:\d\d/i)).toBeVisible();

  await page.getByRole("button", { name: "Copy & send" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(`/drama-${suffix}`) }).first()).toBeVisible();
});

test("reader rates and reviews; it shows in field reports", async ({ page }) => {
  await page.goto(`/drama-${suffix}`);
  await page.getByRole("button", { name: "Post review" }).click();
  // Browser validation stops an unscored review.
  await expect(page.getByText("Report received.")).toHaveCount(0);

  await page.locator("label[for='score-4']").click();
  await page.getByLabel("What happened? (optional)").fill("They went very quiet. Then laughed.");
  await page.getByLabel("Your name (optional)").fill("@tester");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText("Report received.")).toBeVisible();
  await expect(page.getByText("You gave it a 4/5.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("They went very quiet. Then laughed.")).toBeVisible();
  await expect(page.locator(".big-score")).toHaveText("4.0");

  await page.goto(`/drama-${suffix}/reports?sort=high`);
  await expect(page.getByRole("heading", { name: "Field reports" })).toBeVisible();
  await expect(page.getByText("@tester")).toBeVisible();
});

test("reader submits a line and admin approves it", async ({ page }) => {
  await page.goto(`/drama-${suffix}`);
  await page.getByLabel("Your line").fill("Short");
  await page.getByLabel("Your line").fill(`Who is Kevin, and why does he know my coffee order? ${suffix}`);
  await page.getByLabel("Credit me as (optional)").fill("@kevinfan");
  await page.getByRole("button", { name: "Throw it in the pile" }).click();
  await expect(page.getByRole("heading", { name: /It's in\s*the pile/ })).toBeVisible();

  await signIn(page);
  const card = page.locator("form", { hasText: `Who is Kevin, and why does he know my coffee order? ${suffix}` });
  await card.getByLabel("Spice").selectOption("5");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(`Who is Kevin, and why does he know my coffee order? ${suffix}`)).toHaveCount(0);
});

test("pitch → pile → upvote → launch", async ({ page }) => {
  const slug = `excuses-${suffix}`;
  await page.goto("/pitch");
  await fillPackForm(page, slug, 100);
  await page.getByRole("button", { name: "Pitch it" }).click();
  await expect(page.getByRole("heading", { name: "Pitched." })).toBeVisible();

  await signIn(page);
  await page.getByRole("link", { name: /Pitches ·/ }).click();
  const pitch = page.locator("form", { hasText: `/${slug}` });
  await pitch.getByText("100 lines · show all").click();
  await pitch.getByRole("button", { name: "Add to the pile" }).click();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Most wanted" })).toBeVisible();
  const vote = page.getByRole("button", { name: new RegExp(`Upvote /${slug}`) });
  await vote.click();
  await expect(page.getByRole("button", { name: new RegExp(`Remove upvote from /${slug}, 1 votes`) })).toBeVisible();

  await page.goto(`/explore?q=${slug}&f=pile`);
  await expect(page.locator(".list-item", { hasText: `/${slug}` })).toBeVisible();

  await page.goto("/admin?tab=pile");
  const item = page.locator(".card", { hasText: `/${slug}` });
  await item.getByLabel("Colour").selectOption({ label: "3 · Cobalt" });
  await item.getByRole("button", { name: "Launch pack" }).click();

  await page.goto(`/${slug}`);
  await expect(page.getByText("Today's drama")).toBeVisible();
  await page.goto(`/explore?q=${slug}&f=live`);
  await expect(page.getByRole("link", { name: `/${slug}`, exact: true })).toBeVisible();
});

test("unknown pack shows the 404 page", async ({ page }) => {
  const res = await page.goto("/no-such-pack-here");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("No pack lives here. Yet.")).toBeVisible();
});

test("colours page lists the 10-tone cycle", async ({ page }) => {
  await page.goto("/colours");
  await expect(page.locator(".swatch")).toHaveCount(10);
});
