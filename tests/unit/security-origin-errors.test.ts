import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPublicAppOrigin, normalizePublicOrigin } from "../../lib/auth/public-origin.ts";
import { getSafeLocalPath } from "../../lib/auth/redirects.ts";
import { getSafeDiagnosticCode, getSafeSignInError, getSafeSignUpError } from "../../lib/security/public-errors.ts";

function request(origin: string, values: Record<string, string> = {}) {
  const requestHeaders = new Headers(values);
  return { headers: requestHeaders, nextUrl: { origin } };
}

test("canonical public origins require HTTPS except explicit local development", () => {
  assert.equal(normalizePublicOrigin("https://clinicontrol.mx"), "https://clinicontrol.mx");
  assert.equal(normalizePublicOrigin("https://clinicontrol.mx/path"), null);
  assert.equal(normalizePublicOrigin("https://clinicontrol.mx?next=evil"), null);
  assert.equal(normalizePublicOrigin("http://clinicontrol.mx"), null);
  assert.equal(normalizePublicOrigin("http://localhost:3100"), "http://localhost:3100");
});

test("public redirects ignore Host and forwarding headers", () => {
  const hostile = request("http://localhost:3000", {
    host: "attacker.example",
    "x-forwarded-host": "attacker.example",
    "x-forwarded-proto": "https"
  });
  assert.equal(getPublicAppOrigin(hostile, "https://clinicontrol.mx"), "https://clinicontrol.mx");
  assert.equal(
    getPublicAppOrigin(request("https://alternate.internal", { host: "alternate.example" }), "https://clinicontrol.mx"),
    "https://clinicontrol.mx"
  );
  assert.equal(getPublicAppOrigin(hostile), "http://localhost:3000");
  assert.throws(() => getPublicAppOrigin(hostile, "javascript:alert(1)"), /configured public application origin is invalid/i);
  assert.throws(() => getPublicAppOrigin(request("https://internal.example")), /canonical public application origin is required/i);
});

test("local redirect validation rejects encoded separators, controls, and malformed escapes", () => {
  for (const unsafe of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/%0d%0aLocation:test",
    "/%ZZ",
    "javascript:alert(1)",
    "data:text/html,test",
    "https://clinicontrol.mx@evil.test"
  ]) {
    assert.equal(getSafeLocalPath(unsafe, "/dashboard"), "/dashboard");
  }
  assert.equal(getSafeLocalPath("/dashboard/settings?tab=calendar"), "/dashboard/settings?tab=calendar");
  assert.equal(getSafeLocalPath("/dashboard"), "/dashboard");
});

test("public errors and diagnostic codes are allowlisted", () => {
  const raw = "relation public.secrets does not exist user@example.test";
  assert.equal(getSafeSignInError({ code: raw, status: 500 }), "No fue posible iniciar sesión. Intenta nuevamente.");
  assert.equal(getSafeSignInError({ code: "invalid_credentials", status: 400 }), "El correo o la contraseña no son válidos.");
  assert.equal(getSafeSignUpError(), "No fue posible crear la cuenta. Revisa los datos o intenta iniciar sesión.");
  assert.equal(getSafeDiagnosticCode({ code: raw }), "operation_failed");
  assert.equal(getSafeDiagnosticCode({ code: "rate_limit_exceeded" }), "rate_limit_exceeded");
});

test("server actions do not return raw provider or database messages", () => {
  for (const path of [
    "app/(auth)/actions.ts",
    "app/onboarding/actions.ts",
    "app/dashboard/members/actions.ts",
    "app/dashboard/directory/actions.ts"
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /(?:error|membersError)\?*\.message/);
  }
});
