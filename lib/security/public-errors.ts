type ErrorLike = { code?: unknown; status?: unknown } | null | undefined;

const safeCodePattern = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function getSafeDiagnosticCode(error: ErrorLike, fallback = "operation_failed") {
  const code = error && typeof error.code === "string" ? error.code : null;
  return code && safeCodePattern.test(code) ? code.toLowerCase() : fallback;
}

export function getSafeSignInError(error: ErrorLike) {
  const status = error && typeof error.status === "number" ? error.status : null;
  const code = getSafeDiagnosticCode(error, "authentication_failed");
  if (status === 400 || code === "invalid_credentials") {
    return "El correo o la contraseña no son válidos.";
  }
  return "No fue posible iniciar sesión. Intenta nuevamente.";
}

export function getSafeSignUpError() {
  return "No fue posible crear la cuenta. Revisa los datos o intenta iniciar sesión.";
}
