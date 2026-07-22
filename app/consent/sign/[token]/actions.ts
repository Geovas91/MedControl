"use server";

import { signPublicConsent } from "@/lib/server/public-consent-signing";

type SigningState = { success?: boolean; error?: string };

export async function signPublicConsentAction(token: string, _state: SigningState, formData: FormData): Promise<SigningState> {
  const result = await signPublicConsent(token, String(formData.get("signer_name") ?? ""), String(formData.get("signature_png") ?? ""), formData.get("privacy") === "on", formData.get("sensitive_data") === "on");
  if (result.state === "success") return { success: true };
  return { error: result.state === "invalid" ? "Este consentimiento ya fue firmado o el enlace ya no es valido." : "No fue posible registrar la firma. Intenta nuevamente." };
}
