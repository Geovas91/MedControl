// TODO: Replace with the real CliniControl sales WhatsApp number.
export const salesWhatsAppPhonePlaceholder = "521XXXXXXXXXX";
export const salesWhatsAppPhone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim() || salesWhatsAppPhonePlaceholder;

export const salesWhatsAppMessage =
  "Hola, me interesa conocer más sobre CliniControl y sus planes para médicos y clínicas.";

export function isSalesWhatsAppConfigured() {
  return salesWhatsAppPhone !== salesWhatsAppPhonePlaceholder && /^\d{10,15}$/.test(salesWhatsAppPhone);
}

export function getSalesWhatsAppUrl() {
  if (!isSalesWhatsAppConfigured()) {
    return null;
  }

  return `https://wa.me/${salesWhatsAppPhone}?text=${encodeURIComponent(salesWhatsAppMessage)}`;
}
