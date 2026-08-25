import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { DoctorReview, DoctorReviewSummary, ReviewRating } from "@/types/reviews";

type ReviewTableClient = {
  update(values: { is_visible: boolean }): {
    eq(column: "id", value: string): Promise<{ error: PostgrestError | null }>;
  };
};

type ReviewRpcClient = {
  rpc(
    fn: "get_public_doctor_review_summary",
    args: {
      target_doctor_public_profile_id: string;
    }
  ): Promise<{
    data:
      | Array<{
          average_rating: number | null;
          review_count: number;
          rating_1: number;
          rating_2: number;
          rating_3: number;
          rating_4: number;
          rating_5: number;
        }>
      | null;
    error: PostgrestError | null;
  }>;
};

type ReviewsSupabaseClient = {
  from(table: "doctor_reviews"): ReviewTableClient;
} & ReviewRpcClient;

const emptyBreakdown: Record<ReviewRating, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0
};

export function isReviewRating(value: number): value is ReviewRating {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function summarizeDoctorReviews(reviews: Pick<DoctorReview, "rating">[]): DoctorReviewSummary {
  const ratingBreakdown = { ...emptyBreakdown };

  for (const review of reviews) {
    if (isReviewRating(review.rating)) {
      ratingBreakdown[review.rating] += 1;
    }
  }

  const reviewCount = reviews.length;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);

  return {
    averageRating: reviewCount > 0 ? Math.round((total / reviewCount) * 10) / 10 : null,
    reviewCount,
    ratingBreakdown
  };
}

export async function getDoctorReviewSummary(doctorPublicProfileId: string) {
  const supabase = (await createClient()) as unknown as ReviewsSupabaseClient;
  const { data, error } = await supabase.rpc("get_public_doctor_review_summary", {
    target_doctor_public_profile_id: doctorPublicProfileId
  });
  const row = data?.[0];

  if (!row) {
    return {
      data: summarizeDoctorReviews([]),
      error
    };
  }

  return {
    data: {
      averageRating: row.average_rating,
      reviewCount: row.review_count,
      ratingBreakdown: {
        1: row.rating_1,
        2: row.rating_2,
        3: row.rating_3,
        4: row.rating_4,
        5: row.rating_5
      }
    },
    error
  };
}

export async function getDoctorReviewSummaries(doctorPublicProfileIds: string[]) {
  const entries = await Promise.all(
    doctorPublicProfileIds.map(async (profileId) => {
      const { data } = await getDoctorReviewSummary(profileId);
      return [profileId, data] as const;
    })
  );

  return Object.fromEntries(entries) as Record<string, DoctorReviewSummary>;
}

export async function hideDoctorReview(reviewId: string) {
  const supabase = (await createClient()) as unknown as ReviewsSupabaseClient;

  return supabase.from("doctor_reviews").update({ is_visible: false }).eq("id", reviewId);
}
