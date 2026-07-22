import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  CreditCard,
  Search,
  UserRound
} from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { hasClinicalPaymentCreatedMessage } from "@/lib/payments/create";
import {
  formatClinicalPaymentCurrency,
  formatClinicalPaymentTimestamp
} from "@/lib/payments/format";
import {
  buildClinicalPaymentsHref,
  clinicalPaymentStatuses,
  getClinicalPaymentMethodLabel,
  getClinicalPaymentStatusLabel,
  type ClinicalPaymentSearchParams,
  type ClinicalPaymentStatus
} from "@/lib/payments/query";
import { getClinicalPaymentsForActiveTenant } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

type PaymentsPageProps = {
  searchParams: Promise<ClinicalPaymentSearchParams>;
};

function paymentStatusVariant(status: ClinicalPaymentStatus) {
  if (status === "paid") return "green" as const;
  if (status === "pending") return "amber" as const;
  return "slate" as const;
}

function PaymentsUnavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">No hay datos disponibles para mostrar en este momento.</p>
      </section>
    </>
  );
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const params = await searchParams;
  const result = await getClinicalPaymentsForActiveTenant(params);

  if (result.state === "unauthenticated") redirect("/login");

  if (result.state === "no_active_membership") {
    return (
      <PaymentsUnavailable
        title="Sin clínica activa"
        description="Tu cuenta no tiene una membresía activa para consultar pagos clínicos."
      />
    );
  }

  if (result.state === "error") {
    return (
      <PaymentsUnavailable
        title="No fue posible cargar los pagos"
        description="La información de pagos no está disponible temporalmente. Intenta nuevamente más tarde."
      />
    );
  }

  const { data } = result;
  const hasFilters = Boolean(
    data.query.status ||
      data.query.patient ||
      data.query.method ||
      data.query.dateFrom ||
      data.query.dateTo ||
      data.query.search
  );

  return (
    <>
      <PageHeader
        title="Pagos clínicos"
        description="Consulta los cobros de pacientes registrados por la clínica activa."
        action={
          data.canCreatePayments
            ? {
                label: "Registrar pago",
                href: "/dashboard/payments/new",
                icon: <CirclePlus className="h-4 w-4" />
              }
            : undefined
        }
      />

      {hasClinicalPaymentCreatedMessage(params.created) ? (
        <p role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          El pago se registró correctamente.
        </p>
      ) : null}

      {data.query.filtersWereNormalized ? (
        <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Algunos filtros no eran válidos y se ignoraron de forma segura.
        </p>
      ) : null}

      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 xl:items-end">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-2">
          <span>Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={data.query.search} placeholder="Concepto o paciente" className="w-full pl-10" />
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Estado</span>
          <Select name="status" defaultValue={data.query.status ?? ""} className="w-full">
            <option value="">Todos</option>
            {clinicalPaymentStatuses.map((status) => (
              <option key={status} value={status}>{getClinicalPaymentStatusLabel(status)}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Paciente</span>
          <Select name="patient" defaultValue={data.query.patient ?? ""} className="w-full">
            <option value="">Todos</option>
            {data.patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.name}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Método</span>
          <Select name="method" defaultValue={data.query.method ?? ""} className="w-full">
            <option value="">Todos</option>
            {data.methods.map((method) => (
              <option key={method} value={method}>{getClinicalPaymentMethodLabel(method)}</option>
            ))}
          </Select>
        </label>
        <Button type="submit">Aplicar filtros</Button>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Desde</span>
          <Input name="date_from" type="date" defaultValue={data.query.dateFrom ?? ""} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          <span>Hasta</span>
          <Input name="date_to" type="date" defaultValue={data.query.dateTo ?? ""} />
        </label>
        {hasFilters ? (
          <Link href="/dashboard/payments" className="inline-flex h-11 items-center justify-center text-sm font-semibold text-clinic hover:underline">
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      <section className="mt-6" aria-labelledby="payment-summary-title">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="payment-summary-title" className="font-bold text-ink">Totales filtrados</h2>
            <p className="text-sm text-slate-500">Cada moneda se resume por separado, sin conversiones.</p>
          </div>
          <p className="text-sm text-slate-500">{data.filteredTotal} operaciones</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.summaries.map((summary) => (
            <article key={summary.currency} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{summary.currency}</p>
                  <p className="mt-2 text-2xl font-bold text-ink">{formatClinicalPaymentCurrency(summary.total, summary.currency)}</p>
                  <p className="mt-1 text-xs text-slate-500">{summary.operations} operaciones</p>
                </div>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-50 text-clinic">
                  <Banknote className="h-5 w-5" />
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500">Pagado</dt><dd className="font-semibold text-ink">{formatClinicalPaymentCurrency(summary.paid, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Pendiente</dt><dd className="font-semibold text-ink">{formatClinicalPaymentCurrency(summary.pending, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Reembolsado</dt><dd className="font-semibold text-ink">{formatClinicalPaymentCurrency(summary.refunded, summary.currency)}</dd></div>
                <div><dt className="text-slate-500">Cancelado</dt><dd className="font-semibold text-ink">{formatClinicalPaymentCurrency(summary.cancelled, summary.currency)}</dd></div>
              </dl>
            </article>
          ))}
          {data.summaries.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 p-5 text-sm text-slate-500">No hay totales para los filtros actuales.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Listado de pagos clínicos">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600 sm:px-5">
          {data.filteredTotal > 0
            ? `Mostrando ${data.visibleFrom}-${data.visibleTo} de ${data.filteredTotal} resultados`
            : `0 resultados de ${data.totalPayments} pagos`}
        </div>
        <div className="divide-y divide-slate-200">
          {data.payments.map((payment) => (
            <article key={payment.id} className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] lg:items-center">
              <div className="min-w-0">
                {payment.patient_id && payment.patientName ? (
                  <Link href={`/dashboard/patients/${payment.patient_id}`} className="inline-flex min-w-0 items-center gap-2 font-semibold text-clinic hover:underline">
                    <UserRound className="h-4 w-4 shrink-0" />
                    <span className="truncate">{payment.patientName}</span>
                  </Link>
                ) : (
                  <p className="font-semibold text-ink">Sin registro</p>
                )}
                <p className="mt-2 break-words text-sm text-slate-600">{payment.concept ?? "Sin registro"}</p>
              </div>
              <div className="min-w-0 text-sm text-slate-600">
                <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-clinic" />{formatClinicalPaymentTimestamp(payment.paid_at ?? payment.created_at, data.timeZone)}</p>
                <p className="mt-1 text-xs text-slate-500">Creado: {formatClinicalPaymentTimestamp(payment.created_at, data.timeZone)}</p>
              </div>
              <div>
                <p className="font-bold text-ink">{formatClinicalPaymentCurrency(payment.amount, payment.currency)}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><CreditCard className="h-4 w-4 shrink-0" />{getClinicalPaymentMethodLabel(payment.payment_method)}</p>
              </div>
              <Badge variant={paymentStatusVariant(payment.status)} className="w-fit">{getClinicalPaymentStatusLabel(payment.status)}</Badge>
            </article>
          ))}
          {data.payments.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              {data.totalPayments === 0
                ? "Esta clínica todavía no tiene pagos clínicos registrados."
                : "Hay pagos registrados, pero ninguno coincide con los filtros actuales."}
            </div>
          ) : null}
        </div>
      </section>

      {data.filteredTotal > 0 ? (
        <nav className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de pagos">
          <p className="text-sm text-slate-600">Página {data.page} de {data.pageCount}</p>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Link href={buildClinicalPaymentsHref(data.query, data.page - 1)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" />Anterior</Link>
            ) : <span aria-disabled="true" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400"><ChevronLeft className="h-4 w-4" />Anterior</span>}
            {data.page < data.pageCount ? (
              <Link href={buildClinicalPaymentsHref(data.query, data.page + 1)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Siguiente<ChevronRight className="h-4 w-4" /></Link>
            ) : <span aria-disabled="true" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400">Siguiente<ChevronRight className="h-4 w-4" /></span>}
          </div>
        </nav>
      ) : null}
    </>
  );
}
