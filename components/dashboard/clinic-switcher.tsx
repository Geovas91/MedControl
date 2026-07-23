"use client";

import { switchActiveClinicAction } from "@/app/dashboard/tenant-actions";

type ClinicSwitcherProps = {
  activeClinicId: string;
  clinics: Array<{ id: string; name: string }>;
};

export function ClinicSwitcher({ activeClinicId, clinics }: ClinicSwitcherProps) {
  if (clinics.length < 2) return null;

  return (
    <form action={switchActiveClinicAction} className="mb-3">
      <label className="block text-xs font-medium text-slate-500" htmlFor="active-clinic">Clínica activa</label>
      <select id="active-clinic" name="clinic_id" defaultValue={activeClinicId} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700">
        {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
      </select>
    </form>
  );
}
