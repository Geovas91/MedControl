import assert from "node:assert/strict";
import {
  buildGoogleOAuthCallbackUrl,
  getGoogleOAuthErrorMessage,
  getPostAuthRedirect,
  getSafeLocalPath
} from "../lib/auth/redirects.ts";
import { getAuthProfileValues } from "../lib/auth/profile.ts";

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

console.log("Google OAuth redirect checks passed.");
