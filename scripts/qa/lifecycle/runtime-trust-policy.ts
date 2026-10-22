import { PROJECT, STAGING } from './contracts.ts';
import type { RuntimeTrustPolicy } from './signed-runtime-evidence.ts';

/** Reviewed trust roots only. Never populated from env, CLI or evidence itself.
 * No authority/endpoint/artifact inventory has been independently provisioned.
 * Keep disabled until their provenance is reviewed in a separate policy change.
 * These are public pins, not credentials. No private signing key belongs here.
 */
export const runtimeTrustPolicy: RuntimeTrustPolicy | null = null;
export const expectedRuntimeScope = Object.freeze({ origin: STAGING, project: PROJECT, commit: 'd1079819eec335244c2848ad45ffb0e1864f665f' });
