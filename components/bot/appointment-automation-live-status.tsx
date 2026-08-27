"use client";

import Link from "next/link";
import { RefreshCw, Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  APPOINTMENT_AUTOMATION_LIVE_POLL_INTERVAL_MS,
  parseAppointmentAutomationLiveStatus,
  type AppointmentAutomationLiveStatus
} from "@/lib/appointment-automation-live-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const jobLabels = {
  reminder_email: "Recordatorio por email",
  review_request_email: "Solicitud de reseña"
} as const;

function dateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(value));
}

function refreshedTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone
  }).format(new Date(value));
}

type Props = {
  initialStatus: AppointmentAutomationLiveStatus;
  timeZone: string;
  assistantEnabled: boolean;
  reminderEnabled: boolean;
  reviewRequestEnabled: boolean;
  googleCalendarAvailable: boolean;
  emailCalendarConfigured: boolean;
};

export function AppointmentAutomationLiveStatusPanel({
  initialStatus,
  timeZone,
  assistantEnabled,
  reminderEnabled,
  reviewRequestEnabled,
  googleCalendarAvailable,
  emailCalendarConfigured
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current || document.visibilityState !== "visible") return;
    inFlightRef.current = true;
    setRefreshing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/appointment-automations/live-status", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) return;
      const nextStatus = parseAppointmentAutomationLiveStatus(await response.json());
      if (nextStatus && mountedRef.current) setStatus(nextStatus);
    } catch {
      // A transient failure keeps the last valid operational snapshot visible.
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      inFlightRef.current = false;
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    };
    const startPolling = () => {
      stopPolling();
      if (document.visibilityState === "visible") {
        intervalId = setInterval(refresh, APPOINTMENT_AUTOMATION_LIVE_POLL_INTERVAL_MS);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      stopPolling();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return (
    <>
      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Estado operacional">
        <div className="surface-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Scheduler</p>
          <p className="mt-2 font-bold text-ink">{status.scheduler.label}</p>
          <p className="mt-1 text-xs text-slate-500">Último heartbeat: {status.scheduler.lastStartedAt ? dateTime(status.scheduler.lastStartedAt, timeZone) : "sin ejecuciones"}</p>
        </div>
        <div className="surface-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recordatorios</p><p className="mt-2 font-bold text-ink">{assistantEnabled && reminderEnabled ? "ON" : "OFF"}</p></div>
        <div className="surface-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Reviews automáticas</p><p className="mt-2 font-bold text-ink">{assistantEnabled && reviewRequestEnabled ? "ON" : "OFF"}</p></div>
        <div className="surface-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Google Calendar</p><p className="mt-2 font-bold text-ink">{googleCalendarAvailable ? "Disponible" : "Disponible en Plus y Pro"}</p></div>
        <div className="surface-card p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Provider email</p><p className="mt-2 font-bold text-ink">{emailCalendarConfigured ? "Listo" : "No configurado"}</p></div>
      </section>

      <section className="surface-card mt-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-ink"><Star className="h-5 w-5 text-clinic" />Jobs recientes y próximos</h2>
            <p className="mt-1 text-sm text-slate-500">Estado operativo seguro; los jobs no almacenan destinatarios, mensajes ni datos clínicos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span role="status" aria-live="polite" className="text-xs text-slate-500">
              {refreshing ? "Actualizando..." : `Actualizado ${refreshedTime(status.refreshedAt, timeZone)}`}
            </span>
            <Button type="button" variant="secondary" className="min-h-9 px-3" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          {status.jobs.length ? status.jobs.map((job) => (
            <article key={job.id} className="rounded-[var(--radius-md)] border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-ink">{jobLabels[job.type]}</p><Link href={`/dashboard/appointments/${job.appointmentId}`} className="mt-1 inline-flex text-sm font-semibold text-clinic hover:underline">Ver cita</Link></div>
                <Badge variant={job.status === "succeeded" ? "green" : job.status === "failed" || job.status === "retry_pending" ? "amber" : "slate"}>{job.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">Programado: {dateTime(job.scheduledFor, timeZone)} · intento {job.attempts}/{job.maxAttempts}{job.lastErrorCode ? ` · ${job.lastErrorCode}` : ""}</p>
            </article>
          )) : <p className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-5 text-center text-sm text-slate-500">No hay jobs registrados para esta clínica.</p>}
        </div>
      </section>
    </>
  );
}
