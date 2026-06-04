import { Badge } from "@/components/ui/badge";
import type { BotActivityLogItem } from "@/types/appointment-bot";

const resultVariant = {
  Confirmed: "green",
  "Needs follow-up": "amber",
  "Reschedule requested": "amber",
  Cancelled: "slate",
  "No response": "slate"
} as const;

export function BotActivityLog({ items }: { items: BotActivityLogItem[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-ink">Mock bot activity log</h2>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="grid gap-3 rounded-md border border-slate-200 p-4 lg:grid-cols-[1fr_1fr_auto]">
            <div>
              <p className="font-semibold text-ink">{item.appointment}</p>
              <p className="text-sm text-slate-500">{item.patient}</p>
            </div>
            <div className="text-sm text-slate-600">
              <p>{item.messageSent}</p>
              <p>Response: {item.patientResponse}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Badge variant={resultVariant[item.result]}>{item.result}</Badge>
              <span className="text-xs text-slate-500">{item.timestamp}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
