"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import { submitVerifiedDoctorReviewAction } from "@/app/reviews/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";

type StarRatingFormProps = {
  reviewToken: string;
};

export function StarRatingForm({ reviewToken }: StarRatingFormProps) {
  const [state, formAction] = useActionState(submitVerifiedDoctorReviewAction, {});

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="review_token" value={reviewToken} />
      <div>
        <h2 className="font-bold text-ink">Califica tu atención</h2>
        <p className="mt-1 text-sm text-slate-500">El comentario es opcional. No incluyas información médica o sensible.</p>
      </div>
      <fieldset className="flex gap-2" aria-label="Calificación por estrellas">
        {[1, 2, 3, 4, 5].map((rating) => (
          <label key={rating} className="grid cursor-pointer place-items-center rounded-md border border-slate-200 p-2">
            <input type="radio" name="rating" value={rating} className="sr-only" required />
            <Star className="h-6 w-6 text-amber-400" />
            <span className="sr-only">{rating} estrellas</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="review-comment" className="text-sm font-semibold text-ink">Comentario opcional</label>
        <textarea id="review-comment" name="comment" maxLength={1000} rows={5} className="mt-2 w-full rounded-md border border-slate-300 p-3 text-sm" placeholder="Cuéntanos brevemente sobre tu experiencia." />
        <p className="mt-1 text-xs text-slate-500">Máximo 1000 caracteres. El comentario podrá mostrarse públicamente.</p>
      </div>
      {state.error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p> : null}
      {!state.message ? <AuthSubmitButton idleLabel="Enviar reseña" pendingLabel="Enviando reseña..." /> : null}
    </form>
  );
}
