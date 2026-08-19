const patientIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildPatientConsentsHref(patientId: string) {
  if (!patientIdPattern.test(patientId)) {
    throw new Error("Invalid patient ID.");
  }

  return `/dashboard/patients/${patientId}/consents`;
}
