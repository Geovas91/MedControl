import { Banknote, CreditCard, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { payments } from "@/lib/mock-data";

export default function PaymentsPage() {
  const paid = payments.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + payment.amount, 0);
  const pending = payments
    .filter((payment) => payment.status === "Pending")
    .reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <>
      <PageHeader title="Payments" description="Track collected income and pending patient balances with mock records." />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Collected income" value={formatCurrency(paid)} detail="Paid invoices in mock data" icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Pending balance" value={formatCurrency(pending)} detail="Outstanding patient payments" icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Total charges" value={formatCurrency(paid + pending)} detail="All tracked payment records" icon={<ReceiptText className="h-5 w-5" />} />
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid-cols-[1fr_0.8fr_0.5fr_0.5fr_auto]">
          <span>Patient</span>
          <span className="hidden md:block">Concept</span>
          <span className="hidden md:block">Date</span>
          <span className="hidden md:block">Amount</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-slate-200">
          {payments.map((payment) => (
            <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4 sm:px-5 md:grid-cols-[1fr_0.8fr_0.5fr_0.5fr_auto] md:items-center">
              <div>
                <p className="font-semibold text-ink">{payment.patientName}</p>
                <p className="text-sm text-slate-500 md:hidden">{payment.concept} · {formatCurrency(payment.amount)}</p>
                <p className="mt-1 text-xs text-slate-400 md:hidden">{formatDate(payment.date)}</p>
              </div>
              <p className="hidden text-sm text-slate-600 md:block">{payment.concept}</p>
              <p className="hidden text-sm text-slate-600 md:block">{formatDate(payment.date)}</p>
              <p className="hidden text-sm font-semibold text-ink md:block">{formatCurrency(payment.amount)}</p>
              <Badge variant={payment.status === "Paid" ? "green" : "amber"}>{payment.status}</Badge>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
