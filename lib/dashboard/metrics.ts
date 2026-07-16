export type DashboardPayment = {
  amount: number;
  currency: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
};

export function aggregateMxnPayments(payments: DashboardPayment[]) {
  return payments.reduce(
    (totals, payment) => {
      if (payment.currency !== "MXN") {
        return totals;
      }

      if (payment.status === "paid") {
        totals.paid += payment.amount;
      } else if (payment.status === "pending") {
        totals.pending += payment.amount;
      }

      return totals;
    },
    { paid: 0, pending: 0 }
  );
}

export function formatMxnCurrency(value: number, locale = "es-MX") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(value);
}

export function getAgendaState<T>(appointments: T[]) {
  return appointments.length === 0 ? "empty" : "ready";
}
