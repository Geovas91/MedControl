export const stagingOrigin = 'https://staging.clinicontrol.mx';
export type LivePlan = { status: 'READY' | 'BLOCKED'; reason: string; origin: string; mode: 'read_only'; };

/** Read-only browser smoke only. A flag cannot bypass missing isolation proof
 * for appointment mutations: no live lifecycle writer is installed here. */
export function liveReadPlan(env: Record<string, string | undefined>): LivePlan {
  const blocked = (reason: string): LivePlan => ({ status: 'BLOCKED', reason, origin: stagingOrigin, mode: 'read_only' });
  if (env.ASSISTANT_QA_STAGING_LIVE !== '1') return blocked('opt_in_required');
  if (env.ASSISTANT_QA_LIVE_MODE !== 'read_only') return blocked('mutation_fixture_and_notification_isolation_unverified');
  if (!/^qa\.(?:owner|admin|assistant[12]|doctor[123])\.(?:norte|sur)@clinicontrol\.mx$/.test(env.ASSISTANT_QA_EMAIL ?? '')) return blocked('dedicated_qa_account_required');
  if (!env.ASSISTANT_QA_PASSWORD) return blocked('qa_password_required');
  if (!['CliniControl QA Norte', 'CliniControl QA Sur'].includes(env.ASSISTANT_QA_CLINIC ?? '')) return blocked('expected_qa_clinic_required');
  const region = env.ASSISTANT_QA_EMAIL!.split('@')[0].endsWith('.norte') ? 'Norte' : 'Sur';
  if (env.ASSISTANT_QA_CLINIC !== `CliniControl QA ${region}`) return blocked('qa_account_clinic_mismatch');
  return { status: 'READY', reason: 'read_only_preflight_ready', origin: stagingOrigin, mode: 'read_only' };
}
