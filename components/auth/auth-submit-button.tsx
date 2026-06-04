"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function AuthSubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="mt-2 w-full disabled:cursor-not-allowed disabled:opacity-70">
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
