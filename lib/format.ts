const mxnFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0
});

export function formatMXN(value: number) {
  const formattedValue = mxnFormatter.format(value);

  return formattedValue.includes("MXN") ? formattedValue : `${formattedValue} MXN`;
}

export function formatCurrency(value: number, currency: "MXN" | "USD", locale = currency === "MXN" ? "es-MX" : "en-US") {
  const formattedValue = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);

  return formattedValue.includes(currency) ? formattedValue : `${formattedValue} ${currency}`;
}
