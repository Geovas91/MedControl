import assert from "node:assert/strict";
import {
  buildGoogleOAuthCallbackUrl,
  getGoogleOAuthErrorMessage,
  getPostAuthRedirect,
  getSafeLocalPath
} from "../lib/auth/redirects.ts";
import { getAuthProfileValues } from "../lib/auth/profile.ts";
import { getPublicAppOrigin, normalizePublicOrigin } from "../lib/auth/public-origin.ts";

function originRequest(origin: string, headers: Record<string, string> = {}) {
  const requestHeaders = new Headers(headers);
  return {
    headers: requestHeaders,
    nextUrl: { origin }
  };
}

assert.equal(getSafeLocalPath("/dashboard/settings"), "/dashboard/settings");
assert.equal(getSafeLocalPath("/invite/abc_123", ""), "/invite/abc_123");
assert.equal(getSafeLocalPath("https://evil.example/steal", "/dashboard"), "/dashboard");
assert.equal(getSafeLocalPath("//evil.example/steal", "/dashboard"), "/dashboard");
assert.equal(getSafeLocalPath("/\\evil.example/steal", "/dashboard"), "/dashboard");
assert.equal(getSafeLocalPath("javascript:alert(1)", "/dashboard"), "/dashboard");
assert.equal(getSafeLocalPath("/dashboard\nSet-Cookie:test", "/dashboard"), "/dashboard");

assert.equal(
  buildGoogleOAuthCallbackUrl("https://staging.clinicontrol.mx", null),
  "https://staging.clinicontrol.mx/auth/callback"
);
assert.equal(
  buildGoogleOAuthCallbackUrl("https://staging.clinicontrol.mx", "/invite/abc_123"),
  "https://staging.clinicontrol.mx/auth/callback?next=%2Finvite%2Fabc_123"
);

assert.equal(getGoogleOAuthErrorMessage("access_denied"), "El acceso con Google fue cancelado.");
assert.match(getGoogleOAuthErrorMessage("server_error", "provider is not enabled"), /no está disponible/i);

assert.equal(getPostAuthRedirect({ profileComplete: false, hasClinic: false }), "/onboarding");
assert.equal(getPostAuthRedirect({ profileComplete: true, hasClinic: false }), "/onboarding");
assert.equal(getPostAuthRedirect({ profileComplete: true, hasClinic: true }), "/dashboard");
assert.equal(getPostAuthRedirect({ next: "/dashboard/settings", profileComplete: true, hasClinic: true }), "/dashboard/settings");
assert.equal(getPostAuthRedirect({ next: "//evil.example", profileComplete: true, hasClinic: true }), "/dashboard");
assert.equal(getPostAuthRedirect({ next: "/invite/abc_123", profileComplete: false, hasClinic: false }), "/invite/abc_123");
assert.equal(getPostAuthRedirect({ next: "/reset-password?next=%2Fdashboard", profileComplete: false, hasClinic: false }), "/reset-password?next=%2Fdashboard");

assert.deepEqual(
  getAuthProfileValues(
    { id: "user-1", email: "doctor@example.com", user_metadata: { full_name: "Dra. Ana López", avatar_url: "https://example.com/avatar.png" } },
    null
  ),
  { id: "user-1", email: "doctor@example.com", full_name: "Dra. Ana López" }
);
assert.deepEqual(
  getAuthProfileValues(
    { id: "user-1", email: "new@example.com", user_metadata: { name: "Google Name" } },
    { id: "user-1", email: "old@example.com", full_name: "Nombre guardado" }
  ),
  { id: "user-1", email: "new@example.com", full_name: "Nombre guardado" }
);

assert.equal(normalizePublicOrigin("https://staging.clinicontrol.mx/"), "https://staging.clinicontrol.mx");
assert.equal(normalizePublicOrigin("javascript:alert(1)"), null);
assert.equal(normalizePublicOrigin("data:text/plain,test"), null);
assert.equal(normalizePublicOrigin("/relative"), null);
assert.equal(normalizePublicOrigin("not a URL"), null);

const internalRequest = originRequest("http://localhost:3000", {
  "x-forwarded-host": "attacker.example",
  "x-forwarded-proto": "https",
  host: "localhost:3000"
});
const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
process.env.NEXT_PUBLIC_SITE_URL = "https://staging.clinicontrol.mx/";
assert.equal(getPublicAppOrigin(internalRequest), "https://staging.clinicontrol.mx");
if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
assert.equal(
  getPublicAppOrigin(internalRequest, "javascript:alert(1)"),
  "http://localhost:3000",
  "A configured but invalid site URL must not be replaced by manipulated headers."
);

const proxiedRequest = originRequest("http://localhost:3000", {
  "x-forwarded-host": "staging.clinicontrol.mx",
  "x-forwarded-proto": "https",
  host: "localhost:3000"
});
assert.equal(getPublicAppOrigin(proxiedRequest, ""), "https://staging.clinicontrol.mx");

const publicOrigin = getPublicAppOrigin(proxiedRequest, "https://staging.clinicontrol.mx");
assert.equal(new URL("/dashboard", publicOrigin).origin, "https://staging.clinicontrol.mx");
assert.equal(new URL("/login?error=oauth", publicOrigin).origin, "https://staging.clinicontrol.mx");
assert.equal(new URL("/onboarding", publicOrigin).hostname === "localhost", false);

console.log("Google OAuth redirect checks passed.");
