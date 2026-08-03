"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildGoogleOAuthCallbackUrl, getGoogleOAuthErrorMessage } from "@/lib/auth/redirects";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.86A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.52H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.48l3.34-2.62Z" />
      <path fill="#EA4335" d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.95 5.52l3.34 2.62C7.18 7.77 9.39 6.01 12 6.01Z" />
    </svg>
  );
}

export function GoogleOAuthButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    if (loading) return;

    setError(null);
    const { missing } = getSupabaseConfig();
    if (missing.length > 0) {
      setError("Google no está disponible como proveedor de acceso en este momento.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildGoogleOAuthCallbackUrl(window.location.origin, next)
        }
      });

      if (oauthError) {
        setError(getGoogleOAuthErrorMessage(oauthError.code, oauthError.message));
        setLoading(false);
      }
    } catch {
      setError("No fue posible iniciar el acceso con Google. Intenta nuevamente.");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <Button type="button" variant="secondary" className="w-full" onClick={continueWithGoogle} disabled={loading} aria-describedby={error ? "google-oauth-error" : undefined}>
        {loading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
        {loading ? "Conectando con Google..." : "Continuar con Google"}
      </Button>
      {error ? <p id="google-oauth-error" role="alert" className="mt-3 rounded-md bg-rose-50 p-3 text-sm leading-6 text-rose-700">{error}</p> : null}
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">o continúa con correo</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
