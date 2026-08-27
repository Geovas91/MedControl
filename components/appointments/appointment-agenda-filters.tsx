"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useState } from "react";
import { appointmentStatuses, getAppointmentStatusLabel, type AppointmentPeriod, type AppointmentQuery } from "@/lib/appointments/query";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

type DoctorOption = { id: string; name: string };

const periodOptions: { value: AppointmentPeriod; label: string }[] = [
  { value: "day", label: "Día seleccionado" },
  { value: "month", label: "Mes seleccionado" },
  { value: "upcoming", label: "Próximas citas" },
  { value: "past", label: "Citas pasadas" },
  { value: "all", label: "Todas las citas" },
  { value: "range", label: "Rango personalizado" }
];

export function AppointmentAgendaFilters({
  query,
  doctors
}: {
  query: AppointmentQuery;
  doctors: DoctorOption[];
}) {
  const [period, setPeriod] = useState<AppointmentPeriod>(query.period);

  return (
    <form className="filter-toolbar print-hidden mb-5 grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
      <input type="hidden" name="date" value={query.date} />
      <label className="grid gap-1.5 text-sm font-medium text-slate-700">
        <span>Buscar</span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={query.search} placeholder="Paciente o título" className="w-full pl-10" />
        </span>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-700">
        <span>Periodo</span>
        <Select name="period" value={period} onChange={(event) => setPeriod(event.target.value as AppointmentPeriod)} className="w-full">
          {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-700">
        <span>Estado</span>
        <Select name="status" defaultValue={query.status ?? ""} className="w-full">
          <option value="">Todos</option>
          {appointmentStatuses.map((status) => <option key={status} value={status}>{getAppointmentStatusLabel(status)}</option>)}
        </Select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-700">
        <span>Médico</span>
        <Select name="doctor" defaultValue={query.doctor ?? ""} className="w-full">
          <option value="">Todos</option>
          {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
        </Select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Aplicar filtros</Button>
        <Link href="/dashboard/appointments" className="inline-flex h-11 items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          Limpiar filtros
        </Link>
      </div>
      {period === "range" ? (
        <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-5" aria-label="Rango personalizado">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Desde</span>
            <Input type="date" name="from" defaultValue={query.from ?? query.date} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Hasta</span>
            <Input type="date" name="to" defaultValue={query.to ?? query.date} required />
          </label>
        </fieldset>
      ) : null}
    </form>
  );
}
