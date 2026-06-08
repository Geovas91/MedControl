import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminDoctors } from "@/lib/admin/mock-admin-data";

const statusVariant = {
  Activo: "green",
  Invitado: "amber",
  "En revisión": "slate"
} as const;

export default function AdminDoctorsPage() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-ink">Médicos</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Lista mock de médicos y administradores clínicos registrados.
          </p>
        </div>
        <Button type="button">
          <UserPlus className="h-4 w-4" />
          Nuevo médico
        </Button>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 font-semibold">Nombre</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Clínica</th>
                <th className="px-5 py-3 font-semibold">Rol</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {adminDoctors.map((doctor) => (
                <tr key={doctor.email}>
                  <td className="px-5 py-4 font-semibold text-ink">{doctor.name}</td>
                  <td className="px-5 py-4 text-slate-600">{doctor.email}</td>
                  <td className="px-5 py-4 text-slate-600">{doctor.clinic}</td>
                  <td className="px-5 py-4 text-slate-600">{doctor.role}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant[doctor.status as keyof typeof statusVariant] ?? "slate"}>
                      {doctor.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <button type="button" className="font-semibold text-clinic">
                      Revisar
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
