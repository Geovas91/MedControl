import type { Database } from "@/types/database";

export type ReviewRating = 1 | 2 | 3 | 4 | 5;
export type DoctorReview = Database["public"]["Tables"]["doctor_reviews"]["Row"];
export type DoctorReviewInsert = Database["public"]["Tables"]["doctor_reviews"]["Insert"];
export type DoctorReviewUpdate = Database["public"]["Tables"]["doctor_reviews"]["Update"];

export type DoctorReviewSummary = {
  averageRating: number | null;
  reviewCount: number;
  ratingBreakdown: Record<ReviewRating, number>;
};

export type PublicDoctorReview = Pick<DoctorReview, "rating" | "comment" | "created_at">;
export type ReviewInvitationStatus = "pending" | "sent" | "completed" | "revoked" | "expired";

export type PublicReviewInvitation = {
  status: "valid" | "unavailable";
  doctorDisplayName: string | null;
  clinicName: string | null;
};
