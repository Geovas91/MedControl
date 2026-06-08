"use server";

import { createVerifiedDoctorReview, isReviewRating } from "@/lib/server/reviews";

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
  // TODO: expose this only after adding a signed, expiring patient review-token flow.
  // The token must bind appointment_id, patient_id, doctor_public_profile_id, and completed appointment status.
  const reviewToken = asString(formData.get("review_token"));

  if (!reviewToken) {
    return { error: "Se requiere un enlace seguro de reseña para enviar la calificación." };
  }

  return { error: "El flujo público de reseñas estará disponible cuando exista el enlace seguro para pacientes." };
}

export async function createVerifiedDoctorReviewForTrustedFlow({
  doctorPublicProfileId,
  appointmentId,
  patientId,
  rating
}: {
  doctorPublicProfileId: string;
  appointmentId: string;
  patientId: string;
  rating: number;
}) {
  if (!isReviewRating(rating)) {
    return { data: null, error: new Error("La calificación debe estar entre 1 y 5 estrellas.") };
  }

  return createVerifiedDoctorReview({
    doctorPublicProfileId,
    appointmentId,
    patientId,
    rating
  });
}
