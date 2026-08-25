import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildAdminListHref } from "@/lib/admin/query";

export function AdminPagination({
  path,
  filters,
  page,
  pageCount,
  total,
  noun
}: {
  path: string;
  filters: Record<string, string | null>;
  page: number;
  pageCount: number;
  total: number;
  noun: string;
}) {
  if (total === 0) return null;

  const linkClass = "inline-flex h-10 items-center justify-center gap-1 rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50";
  const disabledClass = "inline-flex h-10 items-center justify-center gap-1 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-400";

  return (
    <nav className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" aria-label={`Paginación de ${noun}`}>
      <p className="text-sm text-slate-600">Página {page} de {pageCount} · {total} {noun}</p>
      <div className="grid grid-cols-2 gap-2">
        {page > 1 ? (
          <Link href={buildAdminListHref(path, filters, page - 1)} className={linkClass}><ChevronLeft className="h-4 w-4" />Anterior</Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}><ChevronLeft className="h-4 w-4" />Anterior</span>
        )}
        {page < pageCount ? (
          <Link href={buildAdminListHref(path, filters, page + 1)} className={linkClass}>Siguiente<ChevronRight className="h-4 w-4" /></Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}>Siguiente<ChevronRight className="h-4 w-4" /></span>
        )}
      </div>
    </nav>
  );
}
