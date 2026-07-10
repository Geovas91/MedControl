"use client";

import { Star } from "lucide-react";
import { useLanguage } from "@/components/i18n/language-provider";
import type { DoctorReviewSummary } from "@/types/reviews";

type ReviewSummaryProps = {
  summary: DoctorReviewSummary;
  compact?: boolean;
};

export function ReviewSummary({ summary, compact = false }: ReviewSummaryProps) {
  const { messages } = useLanguage();

  if (summary.reviewCount === 0 || summary.averageRating === null) {
    return <p className={compact ? "text-sm text-slate-500" : "text-sm text-slate-600"}>{messages.directory.reviewsEmpty}</p>;
  }

  return (
    <div className={compact ? "flex items-center gap-2 text-sm" : "grid gap-1 text-sm"}>
      <div className="flex items-center gap-1 font-semibold text-ink">
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        <span>
          {summary.averageRating.toFixed(1)} {messages.directory.ratingOutOf}
        </span>
      </div>
      <p className="text-slate-500">
        {summary.reviewCount}{" "}
        {summary.reviewCount === 1 ? messages.directory.verifiedReviewSingular : messages.directory.verifiedReviewPlural}
      </p>
    </div>
  );
}
