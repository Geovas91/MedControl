import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { BrowserLifecycleAdapter } from './lifecycle/browser.ts';
import { blockers, PROJECT, STAGING, requireQa, QaError } from './lifecycle/contracts.ts';
import { newJournal, openJournal } from './lifecycle/journal.ts';
import { cleanup, runLifecycle } from './lifecycle/runner.ts';
import { publicKeyOnly, stagingReads } from './lifecycle/staging-reads.ts';

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let journal: ReturnType<typeof openJournal> | undefined;
try {
  const args = process.argv.slice(2);
  const mode = args[0] ?? '--preflight';
  requireQa(['--preflight', '--execute', '--recover'].includes(mode) && args.length <= (mode === '--recover' ? 2 : 1), 'usage_preflight_execute_or_recover');
  requireQa(process.env.ASSISTANT_QA_LIFECYCLE_READ === '1', 'read_only_opt_in_required');
  requireQa(process.env.ASSISTANT_QA_SUPABASE_URL === PROJECT && publicKeyOnly(process.env.ASSISTANT_QA_PUBLISHABLE_KEY ?? ''), 'approved_public_supabase_configuration_required');
  requireQa(/^qa\.owner\.(norte|sur)@clinicontrol\.mx$/.test(process.env.ASSISTANT_QA_EMAIL ?? '') && Boolean(process.env.ASSISTANT_QA_PASSWORD), 'qa_owner_credentials_required');
  requireQa(process.env.ASSISTANT_QA_CLINIC === `CliniControl QA ${process.env.ASSISTANT_QA_EMAIL!.includes('.norte@') ? 'Norte' : 'Sur'}`, 'qa_clinic_mismatch');
  if (mode !== '--preflight') requireQa(process.env.ASSISTANT_QA_LIFECYCLE_MUTATIONS === '1' && Boolean(process.env.ASSISTANT_QA_JOURNAL_KEY), 'mutation_opt_in_and_private_journal_required');
  const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => [STAGING, PROJECT].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(20_000);
  await page.goto(`${STAGING}/login`);
  requireQa(new URL(page.url()).origin === STAGING, 'unexpected_origin');
  await page.getByLabel('Email', { exact: true }).fill(process.env.ASSISTANT_QA_EMAIL!);
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.ASSISTANT_QA_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(`${STAGING}/dashboard**`);
  const reads = await stagingReads(page, context, process.env);
  const adapter = new BrowserLifecycleAdapter(page, reads, STAGING);
  const flight = await adapter.preflight();
  const failed = blockers(flight).filter(key => key !== 'patientEligibility' && (mode !== '--recover' || !['availability', 'slots'].includes(key)));
  if (mode === '--preflight' || failed.length) {
    console.log(JSON.stringify({ status: failed.length ? 'BLOCKED' : 'READY_FOR_FIXTURE_STAGE', gates: flight.gates, blockers: failed, patientEligibility: 'DEFERRED_UNTIL_CREATION', mutations: 0 }));
    process.exitCode = failed.length ? 2 : 0;
  } else {
    journal = openJournal({ directory: process.env.ASSISTANT_QA_JOURNAL_DIRECTORY, key: process.env.ASSISTANT_QA_JOURNAL_KEY!, ...(mode === '--recover' ? { run: args[1] } : { initial: newJournal(flight.scope) }) });
    if (mode === '--recover') {
      await cleanup(adapter, journal); await cleanup(adapter, journal);
      console.log(JSON.stringify({ status: 'PASS', operation: 'exact_cleanup', activeAppointments: 0 }));
    } else {
      const result = await runLifecycle(adapter, journal, true);
      console.log(JSON.stringify(result));
      if (result.status !== 'PASS') process.exitCode = result.status === 'PARTIAL' ? 2 : 1;
    }
    if (journal.read().state !== 'clean') process.exitCode = 1;
  }
} catch (error) {
  console.log(JSON.stringify({ status: journal ? 'FAIL' : 'BLOCKED', reason: error instanceof QaError ? error.code : 'safe_execution_error', recoveryJournalRetained: Boolean(journal) }));
  process.exitCode = journal ? 1 : 2;
} finally {
  try { journal?.close(); } catch { console.log(JSON.stringify({ status: 'FAIL', reason: 'journal_close_failed' })); process.exitCode = 1; }
  await browser?.close().catch(() => {});
}
