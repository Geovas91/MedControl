import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-clinic" />
        Loading clinic data...
      </div>
    </div>
  );
}
