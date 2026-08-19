export type PublicConsentRpcRow = { clinic_name: string; consent_type: string; consent_version: string; consent_text: string; expires_at: string };

export type PublicConsentRpcClient = {
  rpc(name: "get_public_consent_for_signing", args: { p_token_hash: string }): Promise<{ data: PublicConsentRpcRow[] | null; error: { code: string } | null }>;
  rpc(name: "sign_public_consent", args: { p_token_hash: string; p_signer_name: string; p_signature_png: string; p_accepted_privacy: boolean; p_accepted_sensitive_data: boolean }): Promise<{ data: string | null; error: { code: string } | null }>;
};

export function getPublicConsentForSigning(client: PublicConsentRpcClient, tokenHash: string) {
  return client.rpc("get_public_consent_for_signing", { p_token_hash: tokenHash });
}

export function submitPublicConsentSignature(client: PublicConsentRpcClient, args: { tokenHash: string; signerName: string; signature: string; acceptedPrivacy: boolean; acceptedSensitiveData: boolean }) {
  return client.rpc("sign_public_consent", {
    p_token_hash: args.tokenHash,
    p_signer_name: args.signerName,
    p_signature_png: args.signature,
    p_accepted_privacy: args.acceptedPrivacy,
    p_accepted_sensitive_data: args.acceptedSensitiveData
  });
}
