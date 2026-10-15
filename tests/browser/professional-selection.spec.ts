import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.QA_DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.afterEach(async ({ page }) => {
  if (!page.url().includes("/dashboard")) return;
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});

for (const [side,other] of [["norte", "Sur"], ["sur", "Norte"]]) {
  test(`QA owner ${side} selects own clinic professionals for appointments and availability`, async ({ page }) => {
    test.skip(!process.env.QA_DEMO_PASSWORD, "Synthetic QA credentials required.");
    await signIn(page, `qa.owner.${side}@clinicontrol.mx`);
    await page.goto("/dashboard/appointments/new");
    const doctor = page.getByRole("combobox", { name: /^Médico \*/ });
    await expect(doctor.locator("option")).toHaveCount(4);
    await expect(doctor).not.toContainText(other);
    await doctor.selectOption({ index: 1 });
    await expect(doctor).not.toHaveValue("");
    await page.goto("/dashboard/settings/availability");
    const professional = page.locator("#professional");
    await expect(professional.locator("option")).toHaveCount(3);
    await expect(professional).not.toContainText(other);
    await professional.selectOption({ index: 1 });
    await expect(page).toHaveURL(/professional=/);
    await expect(page.getByRole("button", { name: "Guardar horario", exact: true })).toBeVisible();
    await expect(page.getByText("Zona horaria: America/Mexico_City", { exact: true }).first()).toBeVisible();
  });
}

test("QA doctor keeps own schedule and no financial access", async ({ page }) => {
  test.skip(!process.env.QA_DEMO_PASSWORD, "Synthetic QA credentials required.");
  await signIn(page, "qa.doctor1.norte@clinicontrol.mx");
  await page.goto("/dashboard/appointments/new");
  const doctor = page.getByRole("combobox", { name: /^Médico \*/ });
  await expect(doctor.locator("option")).toHaveCount(2);
  await expect(doctor).toContainText("QA Doctor 1 Norte");
  await page.goto("/dashboard/settings/availability");
  await expect(page.locator("#professional")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar horario", exact: true })).toBeVisible();
  await page.goto("/dashboard/payments");
  await expect(page.getByRole("heading", { name: "Acceso restringido", exact: true })).toBeVisible();
});

test("QA assistant availability remains read-only", async ({ page }) => {
  test.skip(!process.env.QA_DEMO_PASSWORD, "Synthetic QA credentials required.");
  await signIn(page, "qa.assistant1.norte@clinicontrol.mx");
  await page.goto("/dashboard/settings/availability");
  await expect(page.locator("#professional option")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Guardar horario", exact: true })).toHaveCount(0);
  await expect(page.locator("#start-1-0")).toBeDisabled();
});

test("patient detail has one main landmark under dashboard layout", async ({ page }) => {
  test.skip(!process.env.QA_DEMO_PASSWORD, "Synthetic QA credentials required.");
  await signIn(page, "qa.owner.norte@clinicontrol.mx");
  await page.goto("/dashboard/patients?q=QA%20Patient%20N-D1-01");
  await page.getByRole("link").filter({ hasText: "QA Patient N-D1-01" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/patients\/[a-f0-9-]+/);
  await expect(page.getByRole("heading", { name: "QA Patient N-D1-01", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("main")).toHaveCount(1);
});
