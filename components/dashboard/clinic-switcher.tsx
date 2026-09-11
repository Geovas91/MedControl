"use client";

import { switchActiveClinicAction } from "@/app/dashboard/tenant-actions";

type ClinicSwitcherProps = {
  activeClinicId: string;
  clinics: Array<{ id: string; name: string }>;
};

export function ClinicSwitcher({ activeClinicId, clinics }: ClinicSwitcherProps) {
  if (clinics.length < 2) return null;

  return (
    <form action={switchActiveClinicAction} className="glass-card mb-3 rounded-2xl p-3">
      <label className="block text-xs font-semibold text-[var(--foreground-muted)]" htmlFor="active-clinic">Clínica activa</label>
      <select id="active-clinic" name="clinic_id" defaultValue={activeClinicId} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="glass-input mt-2 min-h-10 w-full rounded-xl px-2.5 py-1.5 text-sm font-medium text-[var(--foreground-soft)] outline-none transition focus:border-clinic focus:ring-4 focus:ring-teal-100/80">
        {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
      </select>
    </form>
  );
}
