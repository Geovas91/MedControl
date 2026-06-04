import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  className?: string;
};

export function StatCard({ label, value, detail, icon, className }: StatCardProps) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-md bg-teal-50 text-clinic">{icon}</div>
      </div>
      <p className="mt-4 text-sm text-slate-500">{detail}</p>
    </section>
  );
}
