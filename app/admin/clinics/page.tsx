import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminClinics } from "@/lib/admin/mock-admin-data";

const statusVariant = {
  Activa: "green",
  "En revisión": "amber",
  Pendiente: "slate"
} as const;

export default function AdminClinicsPage() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-ink">Clínicas</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Supervisión mock de clínicas registradas en la plataforma CliniControl.
          </p>
        </div>
        <Button type="button">
          <Plus className="h-4 w-4" />
          Nueva clínica
        </Button>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Clínica</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Médicos</th>
                <th className="px-5 py-3 font-semibold">Fecha de alta</th>
                <th className="px-5 py-3 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {adminClinics.map((clinic) => (
                <tr key={clinic.name}>
                  <td className="px-5 py-4 font-semibold text-ink">{clinic.name}</td>
                  <td className="px-5 py-4 text-slate-600">{clinic.plan}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant[clinic.status as keyof typeof statusVariant] ?? "slate"}>
                      {clinic.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{clinic.doctors}</td>
                  <td className="px-5 py-4 text-slate-600">{clinic.createdAt}</td>
                  <td className="px-5 py-4">
                    <button type="button" className="font-semibold text-clinic">
                      Ver detalle
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
