import { STAGING, type Gate } from './contracts.ts';
import { runtimeProofDeadline } from './signed-runtime-evidence.ts';

export type RuntimeObservations = {
  reviewedRelease: 'operator_binding_required' | 'independently_verified';
  servingProcess: 'independent_observation_required' | 'independently_verified';
  workers: 'complete_inventory_required' | 'independently_verified';
  readinessPolicy: 'isolated' | 'normal' | 'blocked' | 'unknown';
  readinessEmail: 'disabled' | 'ready' | 'required_unavailable' | 'unknown';
  trust: 'unavailable' | 'authenticated';
  validUntil?: number;
};

/** Observations alone never authorize a gate. The optional handle must have
 * been minted in memory by the fixed-policy independent authority client.
 * Serialized verification results, receipts and flags cannot recreate it.
 */
export function runtimeVerificationBoundary(origin: string, readiness: unknown, proof?: unknown): {
  deployment: Gate; whatsapp: Gate; observations: RuntimeObservations;
} {
  const checks = readiness && typeof readiness === 'object' && 'checks' in readiness && readiness.checks && typeof readiness.checks === 'object' ? readiness.checks as Record<string, unknown> : {};
  const readinessPolicy = typeof checks.outbound === 'string' && ['isolated', 'normal', 'blocked'].includes(checks.outbound) ? checks.outbound as RuntimeObservations['readinessPolicy'] : 'unknown';
  const readinessEmail = typeof checks.email === 'string' && ['disabled', 'ready', 'required_unavailable'].includes(checks.email) ? checks.email as RuntimeObservations['readinessEmail'] : 'unknown';
  const unsafe = origin !== STAGING || readinessPolicy === 'blocked';
  const validUntil = runtimeProofDeadline(proof, origin);
  const authenticated = !unsafe && readinessPolicy === 'isolated' && readinessEmail === 'disabled' && validUntil !== undefined;
  return {
    deployment: { state: unsafe ? 'blocked' : authenticated ? 'verified' : 'unknown', source: unsafe ? 'runtime_scope_or_policy_rejected' : authenticated ? 'independent_signed_release_process_binding' : 'operator_controlled_release_process_binding_required' },
    whatsapp: { state: unsafe ? 'blocked' : authenticated ? 'verified' : 'unknown', source: unsafe ? 'runtime_scope_or_policy_rejected' : authenticated ? 'independent_signed_sender_inventory_and_isolation' : 'independent_serving_and_worker_observation_required' },
    observations: { reviewedRelease: authenticated ? 'independently_verified' : 'operator_binding_required', servingProcess: authenticated ? 'independently_verified' : 'independent_observation_required', workers: authenticated ? 'independently_verified' : 'complete_inventory_required', readinessPolicy, readinessEmail, trust: authenticated ? 'authenticated' : 'unavailable', ...(authenticated ? { validUntil } : {}) }
  };
}
