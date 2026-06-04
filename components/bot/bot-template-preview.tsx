import { MessageSquareText } from "lucide-react";

export function BotTemplatePreview({ template }: { template: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-clinic">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-ink">Message template preview</h2>
          <p className="text-xs text-slate-500">Variables are placeholders only.</p>
        </div>
      </div>
      <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">{template}</p>
      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
        <span className="rounded-md bg-slate-50 p-3">1 = Confirm</span>
        <span className="rounded-md bg-slate-50 p-3">2 = Reschedule</span>
        <span className="rounded-md bg-slate-50 p-3">3 = Cancel</span>
      </div>
    </div>
  );
}
