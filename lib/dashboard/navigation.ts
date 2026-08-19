const patientConsentPathPattern = /^\/dashboard\/patients\/[^/]+\/consents(?:\/|$)/;

export function isDashboardNavItemActive(pathname: string, href: string) {
  const isPatientConsentPath = patientConsentPathPattern.test(pathname);

  if (href === "/dashboard/consents") {
    return pathname === href || pathname.startsWith(`${href}/`) || isPatientConsentPath;
  }

  if (href === "/dashboard/patients" && isPatientConsentPath) {
    return false;
  }

  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}
