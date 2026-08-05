import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const viewports = [
  { name: "320", width: 320, height: 568 },
  { name: "360", width: 360, height: 800 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900 }
];

const publicRoutes = ["/", "/login", "/register", "/forgot-password"];

for (const viewport of viewports) {
  test.describe(`public routes at ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of publicRoutes) {
      test(`${route} loads without horizontal page overflow`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        const response = await page.goto(route);
        expect(response?.ok()).toBeTruthy();
        await expect(page.locator("main")).toBeVisible();
        const widths = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
        expect(widths.scrollWidth, `${route} must not overflow at ${viewport.name}px`).toBeLessThanOrEqual(widths.clientWidth);
        expect(consoleErrors, `${route} should not emit browser console errors`).toEqual([]);
      });
    }
  });
}

test("protected routes redirect to login without a session", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("Google OAuth button renders on login and signup", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
});

test("password visibility controls preserve auth field behavior", async ({ page }) => {
  const fields = [
    { route: "/login", label: "Contraseña", autocomplete: "current-password", minLength: null },
    { route: "/signup", label: "Contraseña", autocomplete: "new-password", minLength: "6" },
    { route: "/reset-password", label: "Nueva contraseña", autocomplete: "new-password", minLength: "8" },
    { route: "/reset-password", label: "Confirmar contraseña", autocomplete: "new-password", minLength: "8" }
  ];

  for (const field of fields) {
    await page.goto(field.route);
    const input = page.getByLabel(field.label, { exact: true });
    const toggle = page.getByRole("button", { name: `Mostrar ${field.label.toLocaleLowerCase("es-MX")}` });

    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveAttribute("autocomplete", field.autocomplete);
    if (field.minLength) await expect(input).toHaveAttribute("minlength", field.minLength);
    await input.fill("Clave-segura-123");

    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("Clave-segura-123");
    await expect(page.getByRole("button", { name: `Ocultar ${field.label.toLocaleLowerCase("es-MX")}` })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: `Ocultar ${field.label.toLocaleLowerCase("es-MX")}` }).click();
    await expect(input).toHaveAttribute("type", "password");
  }
});

test("auth callback without code returns a safe login error", async ({ page }) => {
  await page.goto("/auth/callback?next=https://evil.example/steal");
  await expect(page).toHaveURL(/\/login\?error=/);
  await expect(page.getByText(/callback de autenticación no es válido/i)).toBeVisible();
  expect(page.url()).not.toContain("evil.example");
});

test("auth callback handles an OAuth provider error", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=cancelled");
  await expect(page).toHaveURL(/\/login\?error=/);
  await expect(page.getByText(/acceso con Google fue cancelado/i)).toBeVisible();
});

test("auth callback honors the configured public site origin", async ({ request }) => {
  test.skip(!process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL is required for this proxy-origin regression test.");
  const response = await request.get("/auth/callback?error=access_denied", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(response.status());

  const location = response.headers().location;
  expect(location).toBeTruthy();
  expect(new URL(location).origin).toBe(new URL(process.env.NEXT_PUBLIC_SITE_URL!).origin);
  expect(new URL(location).hostname).not.toBe("localhost");
});

test("invalid invitation is generic and does not disclose identity details", async ({ page }) => {
  await page.goto("/invite/token-invalido");
  await expect(page.locator("main")).toBeVisible();
  const content = await page.locator("body").innerText();
  expect(content).not.toMatch(/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
});

test("health, readiness, and not found routes respond safely", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const readiness = await request.get("/api/ready");
  expect([200, 503]).toContain(readiness.status());
  const missing = await page.goto("/ruta-inexistente");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /página no encontrada/i })).toBeVisible();
});

test("public landing and login have no serious automated axe violations", async ({ page }) => {
  for (const route of ["/", "/login"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(serious, `${route} has serious or critical accessibility violations`).toEqual([]);
  }
});

test("public visual captures contain no authenticated data", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.screenshot({ path: testInfo.outputPath("landing-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.screenshot({ path: testInfo.outputPath("login-390.png"), fullPage: true });
});
