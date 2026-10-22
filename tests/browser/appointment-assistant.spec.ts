import { expect, test, type Page } from '@playwright/test';
import type { harness } from '../assistant-browser/entry';

// Real Chrome + real React + actual action/orchestration source. All protected
// data and authentication are simulated. No Supabase/HTTP action claims here.
async function snapshot(page: Page) { return page.evaluate(() => window.assistantQa.snapshot()); }
async function configure(page: Page, values: Partial<Pick<typeof harness.state, 'authenticated' | 'clinic' | 'failRead' | 'empty'>>) {
  await page.evaluate(values => Object.assign(window.assistantQa.state, values), values);
}
async function send(page: Page, message: string) {
  await page.getByLabel('Escribe una solicitud', { exact: true }).fill(message);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByLabel('Escribe una solicitud', { exact: true })).toBeEnabled();
}
async function incomplete(page: Page) {
  await send(page, 'Quiero agendar una cita para mañana.');
  await expect(page.getByText('¿Con qué paciente quieres agendarla?', { exact: true })).toBeVisible();
}
async function choosePatient(page: Page) {
  await incomplete(page);
  await send(page, 'Dame la lista de pacientes');
  await page.getByRole('button', { name: 'QA Patient Norte', exact: true }).click();
  await expect(page.getByText('¿Con qué profesional quieres agendarla?', { exact: true }).last()).toBeVisible();
}
async function chooseProfessional(page: Page) {
  await choosePatient(page);
  await send(page, 'Dame la lista de profesionales');
  await page.getByRole('button', { name: 'QA Doctor Norte', exact: true }).click();
  await expect(page.getByRole('button', { name: '10:00–10:30', exact: true }).last()).toBeVisible();
}
async function propose(page: Page) {
  await chooseProfessional(page);
  await page.getByRole('button', { name: '10:00–10:30', exact: true }).last().click();
  await expect(page.getByText('Propuesta pendiente', { exact: true })).toBeVisible();
}
async function searchAndSelect(page: Page) {
  await page.evaluate(() => window.assistantQa.seedAppointment());
  await send(page, 'Muéstrame mi agenda de mañana');
  const choice = page.getByRole('button').filter({ hasText: 'QA Patient Norte' });
  await expect(choice).toHaveCount(1);
  await choice.click();
  await expect(page.getByText('Encontré la cita solicitada.', { exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw new Error(`Isolated harness runtime: ${error.message}`); });
  // A new browser context per test; forbid every request outside the harness.
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:3117' ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Appointment Assistant' })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    const state = window.assistantQa.state;
    state.appointments.length = 0;
    state.pending.clear();
  });
  const data = await snapshot(page);
  expect(data.appointments).toHaveLength(0);
  expect(data.pending).toHaveLength(0);
  // Releasing the same in-memory resources a second time is harmless.
  await page.evaluate(() => { window.assistantQa.state.appointments.length = 0; window.assistantQa.state.pending.clear(); });
  expect((await snapshot(page)).appointments).toHaveLength(0);
});

test('BROWSER-001 incomplete request asks for missing fields without mutation', async ({ page }) => {
  await incomplete(page);
  expect((await snapshot(page)).mutations).toBe(0);
  expect((await snapshot(page)).context?.activeIntent).toBe('create_appointment');
});
test('BROWSER-002 authorized patient is selected and retained', async ({ page }) => {
  await choosePatient(page);
  await expect(page.getByRole('button', { name: 'QA Patient Sur', exact: true })).toHaveCount(0);
  const data = await snapshot(page);
  expect(data.context?.focusedPatientRef).toBe(await page.evaluate(() => window.assistantQa.ids.patient));
  expect(data.mutations).toBe(0);
});
test('BROWSER-003 authorized professional is selected and retained', async ({ page }) => {
  await chooseProfessional(page);
  const data = await snapshot(page);
  expect(data.context?.focusedProfessionalRef).toBe(await page.evaluate(() => window.assistantQa.ids.professional));
  expect(data.context?.focusedPatientRef).toBeTruthy();
  await expect(page.getByRole('button', { name: 'QA Doctor Sur', exact: true })).toHaveCount(0);
});
test('BROWSER-004 future availability and structured slot are read only', async ({ page }) => {
  await send(page, 'Ver disponibilidad mañana');
  await send(page, 'Dame la lista de profesionales');
  await page.getByRole('button', { name: 'QA Doctor Norte', exact: true }).click();
  await page.getByRole('button', { name: '10:00–10:30', exact: true }).last().click();
  await expect(page.getByText('¿Con qué paciente quieres agendarla?', { exact: true }).last()).toBeVisible();
  const data = await snapshot(page);
  expect(data.context?.startTime).toBe('10:00');
  expect(data.context?.localDate).toBe('2030-10-22');
  expect(data.mutations).toBe(0);
});
test('BROWSER-005 proposal displays verified fields before confirmation', async ({ page }) => {
  await propose(page);
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toBeVisible();
  const proposal = page.getByText('Propuesta pendiente', { exact: true }).locator('..');
  await expect(proposal).toContainText('QA Patient Norte');
  await expect(proposal).toContainText('QA Doctor Norte');
  await expect(proposal).toContainText('10:00');
  const data = await snapshot(page);
  expect(data.pending).toHaveLength(1);
  expect(data.pending[0].input).toMatchObject({ date: '2030-10-22', startTime: '10:00', durationMinutes: 30 });
  expect(data.mutations).toBe(0);
  expect(data.appointments).toHaveLength(0);
});
test('BROWSER-006 explicit confirmation executes once under duplicate DOM clicks (mock)', async ({ page }) => {
  await propose(page);
  await page.getByRole('button', { name: 'Confirmar', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByText('Cita creada correctamente.', { exact: true })).toBeVisible();
  const data = await snapshot(page);
  expect(data.mutations).toBe(1);
  expect(data.confirmations).toBe(1);
  expect(data.appointments).toHaveLength(1);
  expect(data.appointments[0]).toMatchObject({ starts_at: '2030-10-22T16:00:00.000Z', ends_at: '2030-10-22T16:30:00.000Z' });
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
});
test('BROWSER-007 appointment read and click preserve verified reference', async ({ page }) => {
  await searchAndSelect(page);
  const data = await snapshot(page);
  expect(data.context?.focusedAppointmentRef).toBe(await page.evaluate(() => window.assistantQa.ids.appointment));
  expect(data.mutations).toBe(0);
});
test('BROWSER-008 rescheduling preserves original until explicit confirmation (mock)', async ({ page }) => {
  await searchAndSelect(page);
  const before = (await snapshot(page)).appointments[0].starts_at;
  await send(page, 'Reprográmala a las 11:00');
  await expect(page.getByText('Propuesta pendiente', { exact: true })).toBeVisible();
  expect((await snapshot(page)).appointments[0].starts_at).toBe(before);
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Cita reprogramada correctamente.', { exact: true })).toBeVisible();
  const data = await snapshot(page);
  expect(data.appointments).toHaveLength(1);
  expect(data.appointments[0].starts_at).toBe('2030-10-22T17:00:00.000Z');
  expect(data.mutations).toBe(1);
});
test('BROWSER-009 cancellation requires confirmation (mock)', async ({ page }) => {
  await searchAndSelect(page);
  await send(page, 'Cancela la cita');
  await expect(page.getByText('Propuesta pendiente', { exact: true })).toBeVisible();
  expect((await snapshot(page)).appointments[0].status).toBe('scheduled');
  expect((await snapshot(page)).mutations).toBe(0);
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Cita cancelada correctamente.', { exact: true })).toBeVisible();
  expect((await snapshot(page)).appointments[0].status).toBe('cancelled');
  expect((await snapshot(page)).mutations).toBe(1);
});
test('BROWSER-010 three empty reads replace filters and retain local date', async ({ page }) => {
  await configure(page, { empty: true });
  for (const [message, filter] of [
    ['Muéstrame mi agenda de mañana después de las 15:00.', { minimum: { time: '15:00', inclusive: false } }],
    ['Mejor antes de las 12:00.', { maximum: { time: '12:00', inclusive: false } }],
    ['Ahora después de las 16:00.', { minimum: { time: '16:00', inclusive: false } }]
  ] as const) {
    await send(page, message);
    const data = await snapshot(page);
    expect(data.context?.localDate).toBe('2030-10-22');
    expect(data.context?.timeFilter).toEqual(filter);
  }
  const data = await snapshot(page);
  expect(data.reads.filter(read => read.name === 'search_appointments')).toHaveLength(3);
  expect(data.events.filter(event => event.event === 'assistant_context_invalidated')).toHaveLength(0);
  expect(data.mutations).toBe(0);
});
test('BROWSER-011 failed read stays safe and retry retains context', async ({ page }) => {
  await configure(page, { empty: true });
  await send(page, 'Muéstrame mi agenda de mañana');
  await configure(page, { failRead: true });
  await send(page, 'Mejor antes de las 12:00');
  await expect(page.getByText('No fue posible consultar la agenda. Intenta de nuevo.', { exact: true })).toBeVisible();
  expect((await snapshot(page)).context?.localDate).toBe('2030-10-22');
  await configure(page, { failRead: false });
  await send(page, 'Ahora después de las 16:00');
  expect((await snapshot(page)).reads.filter(read => read.name === 'search_appointments')).toHaveLength(3);
  expect((await snapshot(page)).mutations).toBe(0);
});
test('BROWSER-012 simulated unauthenticated, cross-clinic and stale selections fail closed', async ({ page }) => {
  await configure(page, { authenticated: false });
  await send(page, 'Muéstrame mi agenda de mañana');
  await expect(page.getByText('Debes iniciar sesión o usar una referencia autorizada.', { exact: true })).toBeVisible();
  expect((await snapshot(page)).reads).toHaveLength(0);
  await configure(page, { authenticated: true });
  await page.getByRole('button', { name: 'Nueva conversación', exact: true }).click();
  await searchAndSelect(page);
  // Old visible choice must be revalidated after switching the simulated tenant.
  await configure(page, { clinic: await page.evaluate(() => window.assistantQa.ids.sur) });
  await page.getByRole('button').filter({ hasText: 'QA Patient Norte' }).click();
  await expect(page.getByText('La selección ya no está disponible. Actualiza la consulta y vuelve a elegir.', { exact: true })).toBeVisible();
  expect((await snapshot(page)).context?.focusedAppointmentRef).toBeUndefined();
  expect((await snapshot(page)).mutations).toBe(0);
  await configure(page, { clinic: await page.evaluate(() => window.assistantQa.ids.norte) });
  await page.evaluate(() => { window.assistantQa.state.appointments.length = 0; });
  await page.getByRole('button').filter({ hasText: 'QA Patient Norte' }).click();
  await expect(page.getByText('La selección ya no está disponible. Actualiza la consulta y vuelve a elegir.', { exact: true }).last()).toBeVisible();
  expect((await snapshot(page)).mutations).toBe(0);
  await page.getByRole('button', { name: 'Nueva conversación', exact: true }).click();
  await propose(page);
  await configure(page, { authenticated: false });
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Debes iniciar sesión o usar una referencia autorizada.', { exact: true }).last()).toBeVisible();
  expect((await snapshot(page)).mutations).toBe(0);
  expect((await snapshot(page)).appointments).toHaveLength(0);
});
