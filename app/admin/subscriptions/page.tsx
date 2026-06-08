import { Badge } from "@/components/ui/badge";
import { adminSubscriptions } from "@/lib/admin/mock-admin-data";

const statusVariant = {
  Activa: "green",
  "Pago pendiente": "amber",
  Prueba: "teal"
} as const;

export default function AdminSubscriptionsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-normal text-ink">Suscripciones</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Vista mock de planes, próximos cobros y métodos de pago. PayPal y pagos reales no están implementados.
        </p>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Clínica</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Próximo cobro</th>
                <th className="px-5 py-3 font-semibold">Método de pago</th>
                <th className="px-5 py-3 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {adminSubscriptions.map((subscription) => (
                <tr key={subscription.clinic}>
                  <td className="px-5 py-4 font-semibold text-ink">{subscription.clinic}</td>
                  <td className="px-5 py-4 text-slate-600">{subscription.plan}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant[subscription.status as keyof typeof statusVariant] ?? "slate"}>
                      {subscription.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{subscription.nextCharge}</td>
                  <td className="px-5 py-4 text-slate-600">{subscription.paymentMethod}</td>
                  <td className="px-5 py-4">
                    <button type="button" className="font-semibold text-clinic">
                      Ver suscripción
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
