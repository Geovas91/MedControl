import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("public pricing presents the approved commercial matrix", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Planes para médicos y clínicas pequeñas" })).toBeVisible();
  const basicPlan = page.getByRole("heading", { name: "CliniControl Básico" }).locator("..");
  await expect(basicPlan.getByText("Invitaciones de calendario ICS por email")).toBeVisible();
  await expect(basicPlan.getByText("Plantillas y consentimientos personalizados por especialidad")).toBeVisible();
  await expect(basicPlan.getByText("Sin Google Calendar")).toBeVisible();
  await expect(basicPlan.getByText("Sin Appointment Assistant")).toBeVisible();
  await expect(page.getByText("Appointment Assistant", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Service Bot Tier 1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Gestión avanzada de roles por clínica")).toHaveCount(0);
  await expect(page.getByText("Reportes básicos de citas y pagos")).toHaveCount(0);
  await expect(page.getByText("Soporte prioritario")).toHaveCount(0);
  await expect(page.getByText("Soporte preferente")).toHaveCount(0);
});

test("Basic hides operational Assistant access and additional staff", async ({ page }) => {
  test.skip(!process.env.E2E_COMMERCIAL_BASIC_EMAIL || !process.env.E2E_COMMERCIAL_BASIC_PASSWORD, "Local fictional Basic credentials are required.");
  await signIn(page, process.env.E2E_COMMERCIAL_BASIC_EMAIL!, process.env.E2E_COMMERCIAL_BASIC_PASSWORD!);
  await expect(page.getByRole("link", { name: "Asistente de agenda", exact: true })).toHaveCount(0);
  await page.goto("/dashboard/bot");
  await expect(page.getByRole("heading", { name: "Disponible en Plus y Pro" })).toBeVisible();
  await page.goto("/dashboard/members");
  await expect(page.getByText(/no permite altas de administradores o asistentes/i)).toBeVisible();
  await expect(page.getByRole("option", { name: "Administrador" })).toHaveCount(0);
  await page.goto("/dashboard/consents");
  await expect(page.getByRole("heading", { name: "Consentimientos" })).toBeVisible();
});

test("Plus exposes Appointment Assistant and additional staff", async ({ page }) => {
  test.skip(!process.env.E2E_COMMERCIAL_PLUS_EMAIL || !process.env.E2E_COMMERCIAL_PLUS_PASSWORD, "Local fictional Plus credentials are required.");
  await signIn(page, process.env.E2E_COMMERCIAL_PLUS_EMAIL!, process.env.E2E_COMMERCIAL_PLUS_PASSWORD!);
  await expect(page.getByRole("link", { name: "Asistente de agenda", exact: true })).toBeVisible();
  await page.goto("/dashboard/bot");
  await expect(page.getByRole("heading", { name: "Asistente de agenda", exact: true })).toBeVisible();
  await page.goto("/dashboard/members");
  await expect(page.getByRole("option", { name: "Administrador" })).toBeEnabled();
  await expect(page.getByRole("option", { name: "Asistente" })).toBeEnabled();
});

test("Pro exposes Appointment Assistant and additional staff", async ({ page }) => {
  test.skip(!process.env.E2E_COMMERCIAL_PRO_EMAIL || !process.env.E2E_COMMERCIAL_PRO_PASSWORD, "Local fictional Pro credentials are required.");
  await signIn(page, process.env.E2E_COMMERCIAL_PRO_EMAIL!, process.env.E2E_COMMERCIAL_PRO_PASSWORD!);
  await expect(page.getByRole("link", { name: "Asistente de agenda", exact: true })).toBeVisible();
  await page.goto("/dashboard/bot");
  await expect(page.getByRole("heading", { name: "Asistente de agenda", exact: true })).toBeVisible();
  await page.goto("/dashboard/members");
  await expect(page.getByRole("option", { name: "Administrador" })).toBeEnabled();
  await expect(page.getByRole("option", { name: "Asistente" })).toBeEnabled();
});
