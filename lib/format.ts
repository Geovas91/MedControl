const mxnFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0
});

export function formatMXN(value: number) {
  const formattedValue = mxnFormatter.format(value);

  return formattedValue.includes("MXN") ? formattedValue : `${formattedValue} MXN`;
}
