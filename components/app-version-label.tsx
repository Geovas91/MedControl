import { getPublicVersionLabel } from "@/config/app";
import { cn } from "@/lib/utils";

export function AppVersionLabel({ className }: { className?: string }) {
  return <p className={cn("break-words text-xs leading-5 text-slate-500", className)}>{getPublicVersionLabel()}</p>;
}
