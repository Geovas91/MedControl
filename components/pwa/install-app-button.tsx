"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari() {
  const userAgent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
}

export function InstallAppButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const standalone = isStandalone();
      setInstalled(standalone);
      setShowIosHelp(!standalone && isIosSafari());
    });

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  if (installed || (!deferredPrompt && !showIosHelp)) return null;

  return (
    <div className={cn("grid gap-2", className)}>
      {deferredPrompt ? (
        <button type="button" onClick={() => void install()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--foreground-soft)] shadow-xs transition hover:bg-[var(--surface-muted)]">
          <Download className="h-4 w-4" />
          Instalar CliniControl
        </button>
      ) : null}
      {showIosHelp ? <p className="text-xs leading-5 text-[var(--foreground-muted)]">Compartir -&gt; Agregar a pantalla de inicio</p> : null}
    </div>
  );
}
