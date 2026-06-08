import { Star } from "lucide-react";
import type { DoctorReviewSummary } from "@/types/reviews";

type ReviewSummaryProps = {
  summary: DoctorReviewSummary;
  compact?: boolean;
};

export function ReviewSummary({ summary, compact = false }: ReviewSummaryProps) {
  if (summary.reviewCount === 0 || summary.averageRating === null) {
    return <p className={compact ? "text-sm text-slate-500" : "text-sm text-slate-600"}>Sin reseñas todavía</p>;
  }

  return (
    <div className={compact ? "flex items-center gap-2 text-sm" : "grid gap-1 text-sm"}>
      <div className="flex items-center gap-1 font-semibold text-ink">
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        <span>{summary.averageRating.toFixed(1)} de 5</span>
      </div>
      <p className="text-slate-500">
        {summary.reviewCount} {summary.reviewCount === 1 ? "reseña verificada" : "reseñas verificadas"}
      </p>
    </div>
  );
}
