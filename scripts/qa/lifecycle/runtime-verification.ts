import { STAGING, type Gate } from './contracts.ts';

export type RuntimeObservations = {
  reviewedRelease: 'operator_binding_required';
  servingProcess: 'independent_observation_required';
  workers: 'complete_inventory_required';
  readinessPolicy: 'isolated' | 'normal' | 'blocked' | 'unknown';
  readinessEmail: 'disabled' | 'ready' | 'required_unavailable' | 'unknown';
  trust: 'unavailable';
};

/** Safe integration boundary, NOT a receipt verifier. Until an independently
 * authenticated operator-controlled observation channel exists, no positive
 * runtime authorization is possible. No env switches, JSON approvals, SHA
 * assertions or uploaded receipts are accepted as evidence of loaded code.
 * Only allowlisted effective-policy observations are exposed for the operator.
 */
export function runtimeVerificationBoundary(origin: string, readiness: unknown): {
  deployment: Gate; whatsapp: Gate; observations: RuntimeObservations;
} {
  const checks = readiness && typeof readiness === 'object' && 'checks' in readiness && readiness.checks && typeof readiness.checks === 'object' ? readiness.checks as Record<string, unknown> : {};
  const readinessPolicy = typeof checks.outbound === 'string' && ['isolated', 'normal', 'blocked'].includes(checks.outbound) ? checks.outbound as RuntimeObservations['readinessPolicy'] : 'unknown';
  const readinessEmail = typeof checks.email === 'string' && ['disabled', 'ready', 'required_unavailable'].includes(checks.email) ? checks.email as RuntimeObservations['readinessEmail'] : 'unknown';
  const unsafe = origin !== STAGING || readinessPolicy === 'blocked';
  return {
    deployment: { state: unsafe ? 'blocked' : 'unknown', source: unsafe ? 'runtime_scope_or_policy_rejected' : 'operator_controlled_release_process_binding_required' },
    whatsapp: { state: unsafe ? 'blocked' : 'unknown', source: unsafe ? 'runtime_scope_or_policy_rejected' : 'independent_serving_and_worker_observation_required' },
    observations: { reviewedRelease: 'operator_binding_required', servingProcess: 'independent_observation_required', workers: 'complete_inventory_required', readinessPolicy, readinessEmail, trust: 'unavailable' }
  };
}
