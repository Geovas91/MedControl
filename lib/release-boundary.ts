/** CliniControl v1.0 release policy. Re-enabling requires a reviewed code release,
 * plus the corresponding database grant/trigger review. No environment override.
 * Shared with presentation code; never contains credentials or tenant state.
 */
const excluded = Object.freeze({
  appointment_assistant: false,
  appointment_automations: false,
  google_calendar: false,
  automated_messaging: false,
  experimental_llm: false
});

export type ExcludedReleaseFeature = keyof typeof excluded;

export function releaseAllows(feature: ExcludedReleaseFeature): boolean {
  return Object.hasOwn(excluded, feature) && Boolean(excluded[feature]);
}

export const RELEASE_UNAVAILABLE_MESSAGE = "Esta función no está disponible en CliniControl v1.0.";
