import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { liveReadPlan } from './assistant-live-gates.ts';

const plan = liveReadPlan(process.env);
if (plan.status !== 'READY') {
  console.log(JSON.stringify(plan));
  process.exitCode = 2;
} else {
  // No traces, screenshots, HTML dumps, storageState or raw Playwright errors.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let context: Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined;
  let stage = 'browser_launch';
  try {
    browser = await chromium.launch({ headless: true, ...(existsSync(executablePath) ? { executablePath } : {}) });
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    stage = 'qa_login';
    await page.goto(`${plan.origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill(process.env.ASSISTANT_QA_EMAIL!);
    await page.getByLabel('Contraseña', { exact: true }).fill(process.env.ASSISTANT_QA_PASSWORD!);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL(`${plan.origin}/dashboard**`);
    stage = 'qa_clinic_verification';
    if (!await page.getByText(process.env.ASSISTANT_QA_CLINIC!, { exact: true }).first().isVisible()) throw new Error('blocked');
    stage = 'assistant_read';
    await page.goto(`${plan.origin}/dashboard/bot`);
    const assistant = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Appointment Assistant', exact: true }) });
    await assistant.getByLabel('Escribe una solicitud', { exact: true }).fill('Muéstrame mi agenda de mañana');
    await assistant.getByRole('button', { name: 'Enviar', exact: true }).click();
    await assistant.getByText(/^Encontré \d+ citas\./).waitFor({ state: 'visible' });
    console.log(JSON.stringify({ status: 'PASS', level: 'authenticated_browser_read_only', mutations: 0, providerSuccess: 'NOT_VERIFIED', liveLifecycle: 'BLOCKED' }));
  } catch {
    console.log(JSON.stringify({ status: 'FAIL', level: 'authenticated_browser_read_only', stage, liveLifecycle: 'BLOCKED' }));
    process.exitCode = 1;
  } finally {
    // Authentication stays in a fresh context; clear it even on failed assertions.
    await context?.clearCookies().catch(() => {});
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
