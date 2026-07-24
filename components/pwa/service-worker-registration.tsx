"use client";

import { useEffect } from "react";

const pwaEnabled = process.env.NEXT_PUBLIC_PWA_ENABLED === "true";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!pwaEnabled || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // PWA support is progressive. Registration errors must not interrupt clinical workflows.
      }
    };

    if (document.readyState === "complete") {
      void register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
