import { expect, test } from "@playwright/test";
import { buildConsentSigningUrl } from "../../lib/consents/signing-url";

test("a generated signing URL reaches the public consent route", async ({ page }) => {
  const token = "browser_test_token_abcdefghijklmnopqrstuvwxyz_1234567890";
  const signingUrl = buildConsentSigningUrl(token, "http://localhost:3100");
  const response = await page.goto(signingUrl);

  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(`/consent/sign/${token}`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByRole("heading", { name: "Enlace no disponible" })).toBeVisible();
});
