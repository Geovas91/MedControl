// TODO: Replace with the real MedControl sales WhatsApp number.
export const salesWhatsAppPhonePlaceholder = "521XXXXXXXXXX";
export const salesWhatsAppPhone = salesWhatsAppPhonePlaceholder;

export const salesWhatsAppMessage =
  "Hola, me interesa conocer más sobre MedControl y sus planes para médicos y clínicas.";

export function isSalesWhatsAppConfigured() {
  return salesWhatsAppPhone !== salesWhatsAppPhonePlaceholder && /^\d{10,15}$/.test(salesWhatsAppPhone);
}

export function getSalesWhatsAppUrl() {
  if (!isSalesWhatsAppConfigured()) {
    return null;
  }

  return `https://wa.me/${salesWhatsAppPhone}?text=${encodeURIComponent(salesWhatsAppMessage)}`;
}
