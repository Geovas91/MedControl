"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/types/subscriptions";
import { BillingError, billingErrorMessage } from "@/lib/paypal/billing-policy";
import { createBillingSubmissionClient } from "@/lib/paypal/creation-client";

type PaypalSubscriptionButtonProps = {
  clientId: string | null;
  planId: PlanId;
  paypalPlanId: string | null;
  label: string;
  disabledReason?: string | null;
};

type PaypalButtons = {
  render(container: HTMLElement): Promise<void>;
};

type PaypalNamespace = {
  Buttons(options: {
    style?: {
      layout?: "vertical" | "horizontal";
      shape?: "rect" | "pill";
      label?: "subscribe" | "paypal";
    };
    createSubscription(): Promise<string>;
    onApprove(data: { subscriptionID?: string }): Promise<void>;
    onError(error: unknown): void;
    onCancel(): void;
  }): PaypalButtons;
};

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

let paypalScriptPromise: Promise<void> | null = null;
const initiateSubscription = createBillingSubmissionClient((...args) => fetch(...args));

function loadPaypalScript(clientId: string) {
  if (window.paypal) {
    return Promise.resolve();
  }

  if (paypalScriptPromise) {
    return paypalScriptPromise;
  }

  paypalScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-clinicontrol-paypal-sdk='true']");

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("No se pudo cargar PayPal.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&vault=true&intent=subscription`;
    script.async = true;
    script.dataset.clinicontrolPaypalSdk = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("No se pudo cargar PayPal.")), { once: true });
    document.body.appendChild(script);
  });

  return paypalScriptPromise;
}

export function PaypalSubscriptionButton({ clientId, planId, paypalPlanId, label, disabledReason }: PaypalSubscriptionButtonProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const generatedId = useId();
  const [status, setStatus] = useState<"idle" | "loading" | "approved" | "error" | "blocked">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intentId: string | null = null;

    if (disabledReason || !clientId || !paypalPlanId || !containerRef.current || renderedRef.current) {
      return;
    }

    setStatus("loading");

    loadPaypalScript(clientId)
      .then(() => {
        if (cancelled || !containerRef.current || !window.paypal) {
          return;
        }

        renderedRef.current = true;

        return window.paypal
          .Buttons({
            style: {
              layout: "vertical",
              shape: "rect",
              label: "subscribe"
            },
            async createSubscription() {
              setStatus("loading");
              setMessage(null);
              try {
                const result = await initiateSubscription(planId);
                intentId = result.intentId;
                return result.subscriptionId;
              } catch (error) {
                const blocked = error instanceof BillingError && error.status === 409;
                setStatus(blocked ? "blocked" : "error");
                setMessage(billingErrorMessage(error instanceof BillingError ? error.message : "billing_unavailable"));
                if (blocked) router.refresh();
                throw error;
              }
            },
            async onApprove(data) {
              if (!data.subscriptionID || !intentId) {
                setStatus("error");
                setMessage("PayPal no devolvió un identificador de suscripción.");
                return;
              }

              setStatus("loading");

              const response = await fetch("/api/paypal/subscription/approve", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  subscriptionId: data.subscriptionID,
                  intentId,
                  planId
                })
              });
              const result = (await response.json()) as { message?: string; error?: string };

              if (!response.ok) {
                setStatus("error");
                setMessage(result.error ?? "No se pudo registrar la suscripción.");
                return;
              }

              setStatus("approved");
              setMessage(result.message ?? "Suscripción registrada correctamente.");
              router.refresh();
            },
            onError() {
              setStatus(previous => previous === "blocked" ? "blocked" : "error");
              setMessage(previous => previous ?? "No se pudo confirmar la solicitud. Recarga facturación para verificar su estado antes de iniciar otra.");
            },
            onCancel() {
              setStatus(previous => previous === "blocked" ? "blocked" : "idle");
              setMessage(previous => previous ?? "La aprobación no se completó. Puedes continuar la misma solicitud; no se creará otra suscripción.");
            }
          })
          .render(containerRef.current)
          .then(() => { if (!cancelled) setStatus("idle"); });
      })
      .catch(() => {
        setStatus("error");
        setMessage("No se pudo cargar el botón de PayPal.");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, paypalPlanId, planId, disabledReason, router]);

  if (disabledReason) return <p className="clinical-surface p-3 text-sm text-slate-600" role="status">{disabledReason}</p>;

  if (!clientId || !paypalPlanId) {
    return (
      <Button type="button" variant="secondary" className="w-full" disabled>
        Configura PayPal sandbox
      </Button>
    );
  }

  return (
    <div className="clinical-surface grid gap-2 p-3">
      <div id={`paypal-subscription-${generatedId}`} ref={containerRef} aria-label={label} aria-busy={status === "loading"}
        inert={status === "loading" || status === "approved" || status === "blocked"} />
      {status === "loading" ? <p className="text-xs text-slate-500">Preparando suscripción segura...</p> : null}
      {message ? (
        <p className={status === "approved" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>{message}</p>
      ) : null}
    </div>
  );
}
