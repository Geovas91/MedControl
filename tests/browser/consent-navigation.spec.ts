import { expect, test } from "@playwright/test";

test("authorized user reaches the real consent flow from consent navigation", async ({ page }) => {
  test.skip(!process.env.E2E_PATIENT_EMAIL || !process.env.E2E_PATIENT_PASSWORD, "Local fictional patient credentials are required.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_PATIENT_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_PATIENT_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/dashboard/consents");
  await expect(page).toHaveURL(/\/dashboard\/consents$/);
  await expect(page.getByRole("heading", { name: "Consentimientos", exact: true })).toBeVisible();
  await expect(page.getByText("demo-token")).toHaveCount(0);

  const firstPatientAction = page.getByRole("link", { name: "Ver consentimientos" }).first();
  const href = await firstPatientAction.getAttribute("href");
  expect(href).toMatch(/^\/dashboard\/patients\/[0-9a-f-]+\/consents$/i);
  await firstPatientAction.click();
  await expect(page).toHaveURL(new RegExp(`${href!.replaceAll("/", "\\/")}$`));
  await expect(page.getByRole("heading", { name: "Consentimientos", exact: true })).toBeVisible();
});
