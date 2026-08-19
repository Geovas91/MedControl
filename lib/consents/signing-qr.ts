import QRCode from "qrcode";

export type ConsentSigningQrStatus = "pending" | "signed" | "cancelled";

export function getConsentSigningQrAvailability({
  status,
  hasActiveLink,
  signingUrl
}: {
  status: ConsentSigningQrStatus;
  hasActiveLink: boolean;
  signingUrl?: string;
}) {
  if (status !== "pending") {
    return { available: false as const, reason: status };
  }

  if (!hasActiveLink) {
    return { available: false as const, reason: "missing_link" as const };
  }

  if (!signingUrl) {
    return { available: false as const, reason: "missing_url" as const };
  }

  return { available: true as const, signingUrl };
}

export async function createConsentSigningQr(signingUrl: string) {
  const parsedUrl = new URL(signingUrl);
  const isLocalHttp = parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);

  if (
    (parsedUrl.protocol !== "https:" && !isLocalHttp)
    || !/^\/consent\/sign\/[A-Za-z0-9_-]{40,}$/.test(parsedUrl.pathname)
    || parsedUrl.search
    || parsedUrl.hash
    || parsedUrl.username
    || parsedUrl.password
  ) {
    throw new Error("Consent signing QR requires an HTTPS URL.");
  }

  const payload = parsedUrl.toString();
  const svg = await QRCode.toString(payload, {
    type: "svg",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" }
  });

  return { payload, svg };
}
