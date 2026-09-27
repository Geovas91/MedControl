export const ASSISTANT_PATIENT_QUERY_MIN = 2;
export const ASSISTANT_PATIENT_QUERY_MAX = 80;
export const ASSISTANT_PATIENT_SUGGESTION_LIMIT = 8;

/** Patient names are plain search terms, never SQL or provider instructions. */
export function parseAssistantPatientQuery(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const query = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (query.length < ASSISTANT_PATIENT_QUERY_MIN || query.length > ASSISTANT_PATIENT_QUERY_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} .'-]+$/u.test(query) || !/\p{L}/u.test(query)) return null;
  if (query.split(" ").length > 6) return null;
  return query;
}
