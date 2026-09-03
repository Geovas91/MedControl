import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("tenant can search, open an article, diagnose and reject a medical question safely", async ({ page }) => {
  test.skip(!process.env.E2E_PATIENT_EMAIL || !process.env.E2E_PATIENT_PASSWORD, "Local fictional tenant credentials are required.");
  await signIn(page, process.env.E2E_PATIENT_EMAIL!, process.env.E2E_PATIENT_PASSWORD!);
  const supportResponse = await page.goto("/dashboard/support");
  if (process.env.PLAYWRIGHT_WEB_SERVER === "production") expect(supportResponse?.headers()["cache-control"]).toContain("private, no-store");
  expect(supportResponse?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByRole("heading", { name: "Ayuda y soporte", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Asistente de agenda", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ayuda y soporte", exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "¿En qué necesitas ayuda?", exact: true }).fill("crear cita");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("link", { name: /Cómo crear una cita/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/support\/articles\/crear-una-cita$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cómo crear una cita", exact: true })).toBeVisible();

  await page.goto("/dashboard/support");
  await page.getByRole("button", { name: "Ejecutar diagnóstico" }).click();
  await expect(page.getByText(/Estado: (Operando correctamente|Requiere atención|No disponible|No aplica)/)).toBeVisible();
  await page.getByLabel("Describe el problema técnico").fill("¿Qué medicamento y dosis debo tomar?");
  await page.getByRole("button", { name: "Obtener ayuda guiada" }).click();
  await expect(page.getByText(/No puede orientar sobre diagnósticos, tratamientos, medicamentos ni dosis/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear ticket de soporte" })).toHaveCount(0);
});

test("tenant can create, list, open and reply to a support ticket", async ({ page }) => {
  test.skip(!process.env.E2E_PATIENT_EMAIL || !process.env.E2E_PATIENT_PASSWORD, "Local fictional tenant credentials are required.");
  await signIn(page, process.env.E2E_PATIENT_EMAIL!, process.env.E2E_PATIENT_PASSWORD!);
  await page.goto("/dashboard/support#crear-ticket");
  const suffix = Date.now().toString();
  await page.getByLabel("Asunto").fill(`Prueba técnica ${suffix}`);
  await page.getByLabel("Resumen").fill("Validación funcional local sin datos clínicos.");
  await page.getByRole("button", { name: "Crear ticket", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/support\/tickets\/[0-9a-f-]+\?created=1$/i);
  await expect(page.getByText("Ticket creado correctamente.")).toBeVisible();
  await page.getByLabel("Agregar respuesta").fill("Respuesta funcional local sin datos clínicos.");
  await page.getByRole("button", { name: "Enviar respuesta" }).click();
  await expect(page.getByText("Respuesta agregada.")).toBeVisible();
  await page.getByRole("link", { name: "Volver a Ayuda y soporte" }).click();
  await expect(page.getByText(`Prueba técnica ${suffix}`)).toBeVisible();
});

test("doctor gets a generic 404 for another user's ticket", async ({ page }) => {
  test.skip(!process.env.E2E_PATIENT_EMAIL || !process.env.E2E_PATIENT_PASSWORD || !process.env.E2E_OTHER_SUPPORT_TICKET_ID, "Local fictional cross-user fixture is required.");
  await signIn(page, process.env.E2E_PATIENT_EMAIL!, process.env.E2E_PATIENT_PASSWORD!);
  await page.goto(`/dashboard/support/tickets/${process.env.E2E_OTHER_SUPPORT_TICKET_ID}`);
  await expect(page.getByRole("heading", { name: /Página no encontrada/i })).toBeVisible();
});

test("owner can see a clinic ticket", async ({ page }) => {
  test.skip(!process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD || !process.env.E2E_CLINIC_SUPPORT_TICKET_ID, "Local fictional owner fixture is required.");
  await signIn(page, process.env.E2E_OWNER_EMAIL!, process.env.E2E_OWNER_PASSWORD!);
  await page.goto("/dashboard/support");
  await expect(page.getByRole("heading", { name: "Tickets de la clínica" })).toBeVisible();
  await page.goto(`/dashboard/support/tickets/${process.env.E2E_CLINIC_SUPPORT_TICKET_ID}`);
  await expect(page.getByText(/Ticket [0-9A-F]{16}/)).toBeVisible();
});
