"use client";

import { useActionState } from "react";
import { setClinicMemberProfessionalCapabilityAction, type InvitationActionState } from "@/app/dashboard/members/actions";
import { Button } from "@/components/ui/button";

const initialState: InvitationActionState = {};

export function MemberProfessionalCapability({
  memberId,
  role,
  isProfessional,
  isCurrentMember,
  canManage
}: {
  memberId: string;
  role: "owner" | "admin" | "doctor" | "assistant";
  isProfessional: boolean;
  isCurrentMember: boolean;
  canManage: boolean;
}) {
  const [state, action] = useActionState(setClinicMemberProfessionalCapabilityAction, initialState);
  const fixed = role === "doctor" || role === "assistant";
  const disabled = !canManage || fixed || isCurrentMember;
  const label = role === "doctor" ? "Obligatorio" : role === "assistant" ? "No permitido" : isProfessional ? "Profesional" : "No profesional";

  if (disabled) return <span className="text-sm text-slate-600">{label}</span>;

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="is_professional" value={String(!isProfessional)} />
      <Button type="submit" variant={isProfessional ? "secondary" : "ghost"} className="min-h-9 px-3 text-xs">
        {isProfessional ? "Quitar profesional" : "Marcar profesional"}
      </Button>
      {state.error ? <span className="text-xs text-rose-700" role="alert">{state.error}</span> : null}
      {state.message ? <span className="text-xs text-emerald-700" role="status">{state.message}</span> : null}
    </form>
  );
}
