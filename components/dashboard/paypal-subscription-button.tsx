"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlanId } from "@/types/subscriptions";

type PaypalSubscriptionButtonProps = {
  clientId: string | null;
  planId: PlanId;
  paypalPlanId: string | null;
  label: string;
};

type PaypalButtonActions = {
  subscription: {
    create(options: { plan_id: string }): Promise<string>;
  };
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
    createSubscription(data: unknown, actions: PaypalButtonActions): Promise<string>;
    onApprove(data: { subscriptionID?: string }): Promise<void>;
    onError(error: unknown): void;
  }): PaypalButtons;
};

declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

let paypalScriptPromise: Promise<void> | null = null;

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

export function PaypalSubscriptionButton({ clientId, planId, paypalPlanId, label }: PaypalSubscriptionButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const generatedId = useId();
  const [status, setStatus] = useState<"idle" | "loading" | "approved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!clientId || !paypalPlanId || !containerRef.current || renderedRef.current) {
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
            createSubscription(_data, actions) {
              return actions.subscription.create({
                plan_id: paypalPlanId
              });
            },
            async onApprove(data) {
              if (!data.subscriptionID) {
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
            },
            onError() {
              setStatus("error");
              setMessage("PayPal no pudo iniciar la suscripción. Intenta de nuevo.");
            }
          })
          .render(containerRef.current);
      })
      .catch(() => {
        setStatus("error");
        setMessage("No se pudo cargar el botón de PayPal.");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, paypalPlanId, planId]);

  if (!clientId || !paypalPlanId) {
    return (
      <Button type="button" variant="secondary" className="w-full" disabled>
        Configura PayPal sandbox
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      <div id={`paypal-subscription-${generatedId}`} ref={containerRef} aria-label={label} />
      {status === "loading" ? <p className="text-xs text-slate-500">Preparando suscripción segura...</p> : null}
      {message ? (
        <p className={status === "approved" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>{message}</p>
      ) : null}
    </div>
  );
}
