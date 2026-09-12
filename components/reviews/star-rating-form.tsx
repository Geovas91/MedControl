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
    <form action={formAction} className="glass-card-strong grid gap-4 p-5">
      <input type="hidden" name="review_token" value={reviewToken} />
      <div>
        <h2 className="font-bold text-ink">Califica tu atención</h2>
        <p className="mt-1 text-sm text-slate-500">El comentario es opcional. No incluyas información médica o sensible.</p>
      </div>
      <fieldset className="flex gap-2" aria-label="Calificación por estrellas">
        {[1, 2, 3, 4, 5].map((rating) => (
          <label key={rating} className="glass-control grid cursor-pointer place-items-center p-2 focus-within:border-clinic focus-within:ring-4 focus-within:ring-teal-100/80">
            <input type="radio" name="rating" value={rating} className="peer sr-only" required />
            <Star className="h-6 w-6 text-amber-500 transition peer-checked:fill-amber-400 peer-checked:drop-shadow-[0_4px_8px_rgba(245,158,11,0.28)]" />
            <span className="sr-only">{rating} estrellas</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="review-comment" className="text-sm font-semibold text-ink">Comentario opcional</label>
        <textarea id="review-comment" name="comment" maxLength={1000} rows={5} className="glass-input mt-2 w-full rounded-xl p-3 text-sm text-ink outline-none focus:border-clinic focus:ring-4 focus:ring-teal-100/80" placeholder="Cuéntanos brevemente sobre tu experiencia." />
        <p className="mt-1 text-xs text-slate-500">Máximo 1000 caracteres. El comentario podrá mostrarse públicamente.</p>
      </div>
      {state.error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p> : null}
      {!state.message ? <AuthSubmitButton idleLabel="Enviar reseña" pendingLabel="Enviando reseña..." /> : null}
    </form>
  );
}
