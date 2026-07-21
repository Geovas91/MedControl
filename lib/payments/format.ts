import type { ClinicalPaymentStatus } from "@/lib/payments/query";

export type ClinicalPaymentSummaryRow = {
  amount: number;
  currency: string;
  status: ClinicalPaymentStatus;
};

export type ClinicalPaymentCurrencySummary = {
  currency: string;
  total: number;
  paid: number;
  pending: number;
  refunded: number;
  cancelled: number;
  operations: number;
};

export function formatClinicalPaymentCurrency(amount: number, currency: string, locale = "es-MX") {
  const normalizedCurrency = currency.trim().toUpperCase();

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale, { maximumFractionDigits: 2 })} ${normalizedCurrency || "Sin moneda"}`;
  }
}

export function formatClinicalPaymentTimestamp(value: string, timeZone: string, locale = "es-MX") {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone
    }).format(new Date(value));
  } catch {
    return "Sin registro";
  }
}

export function summarizeClinicalPayments(rows: ClinicalPaymentSummaryRow[]) {
  const summaries = new Map<string, ClinicalPaymentCurrencySummary>();

  for (const row of rows) {
    const currency = row.currency.trim().toUpperCase() || "Sin moneda";
    const summary = summaries.get(currency) ?? {
      currency,
      total: 0,
      paid: 0,
      pending: 0,
      refunded: 0,
      cancelled: 0,
      operations: 0
    };
    const amount = Number(row.amount) || 0;

    summary.total += amount;
    summary[row.status] += amount;
    summary.operations += 1;
    summaries.set(currency, summary);
  }

  return Array.from(summaries.values()).sort((left, right) => left.currency.localeCompare(right.currency));
}

export function mergeClinicalPaymentSummaries(
  current: ClinicalPaymentCurrencySummary[],
  incoming: ClinicalPaymentCurrencySummary[]
) {
  const merged = new Map(current.map((summary) => [summary.currency, { ...summary }]));

  for (const summary of incoming) {
    const existing = merged.get(summary.currency);

    if (!existing) {
      merged.set(summary.currency, { ...summary });
      continue;
    }

    existing.total += summary.total;
    existing.paid += summary.paid;
    existing.pending += summary.pending;
    existing.refunded += summary.refunded;
    existing.cancelled += summary.cancelled;
    existing.operations += summary.operations;
  }

  return Array.from(merged.values()).sort((left, right) => left.currency.localeCompare(right.currency));
}
