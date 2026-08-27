"use server";

import { isReviewToken } from "@/lib/reviews/token";
import { isReviewRating, submitPublicVerifiedReview } from "@/lib/server/reviews";

type ReviewFormState = {
  error?: string;
  message?: string;
};

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function submitVerifiedDoctorReviewAction(
  _previousState: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const reviewToken = asString(formData.get("review_token"));
  const rating = Number(asString(formData.get("rating")));
  const commentValue = formData.get("comment");
  const rawComment = typeof commentValue === "string" ? commentValue : "";
  const comment = rawComment.trim() ? rawComment : null;
  if (!isReviewToken(reviewToken)) return { error: "El enlace de reseña ya no está disponible." };
  if (!isReviewRating(rating)) return { error: "Selecciona una calificación entre 1 y 5 estrellas." };
  if (comment && comment.length > 1000) return { error: "El comentario no puede superar 1000 caracteres." };
  const result = await submitPublicVerifiedReview({ token: reviewToken, rating, comment });
  if (result.error || result.data !== true) {
    return { error: "El enlace de reseña ya no está disponible." };
  }
  return { message: "Gracias. Tu reseña verificada fue enviada correctamente." };
}
