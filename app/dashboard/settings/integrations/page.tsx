import { CalendarDays, CircleAlert, CircleCheck, Link2Off, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { disconnectGoogleCalendarAction } from "@/app/dashboard/settings/integrations/actions";
import { getGoogleCalendarIntegrationPageData } from "@/lib/server/google-calendar-integration";

export const dynamic = "force-dynamic";

const messages: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar quedó conectado para tu usuario en esta clínica." },
  disconnected: { tone: "success", text: "Google Calendar quedó desconectado y el token local fue eliminado." },
  cancelled: { tone: "error", text: "La autorización de Google fue cancelada." },
  invalid_callback: { tone: "error", text: "El callback de Google no es válido." },
  invalid_state: { tone: "error", text: "La autorización expiró o no pertenece a esta sesión y clínica." },
  exchange_failed: { tone: "error", text: "Google no entregó una autorización válida. Intenta conectar nuevamente." },
  reconsent_required: { tone: "error", text: "Google no entregó un refresh token utilizable. Autoriza nuevamente el acceso para reconectar." },
  unavailable: { tone: "error", text: "La integración no está configurada en este entorno." },
  forbidden: { tone: "error", text: "Tu rol no permite conectar una cuenta de calendario." },
  error: { tone: "error", text: "No fue posible completar la operación de calendario." }
};

function formatDate(value: string | null) {
  if (!value) return "Sin sincronizaciones registradas";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  const [result, params] = await Promise.all([getGoogleCalendarIntegrationPageData(), searchParams]);
  if (result.state === "unauthenticated") redirect("/login");
  if (result.state === "no_active_membership") redirect("/onboarding");
  if (result.state !== "ready" || !result.data) {
    return <PageHeader title="Integraciones" description="No fue posible cargar las integraciones de la clínica activa." />;
  }
  const data = result.data;
  const messageKey = typeof params.google === "string" ? params.google : null;
  const message = messageKey ? messages[messageKey] : null;
  const connected = data.own?.status === "connected";
  const requiresReconnect = Boolean(data.own?.requiresReconnect);

  return (
    <>
      <PageHeader title="Integraciones" description="Conecta tu calendario personal de Google para reflejar de forma unidireccional las citas que tienes asignadas." />
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`mb-5 rounded-[var(--radius-md)] p-3 text-sm font-medium ${message.tone === "error" ? "bg-red-50 text-red-700" : "bg-[var(--success-soft)] text-[var(--success)]"}`}>{message.text}</p> : null}

      <section className="surface-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-teal-50 text-clinic"><CalendarDays className="h-5 w-5" /></span>
            <div><h2 className="font-bold text-ink">Google Calendar</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Crea, actualiza o elimina un evento privado con título neutral en el calendario principal del médico asignado. CliniControl continúa siendo la fuente primaria de la cita.</p></div>
          </div>
          <Badge variant={connected ? "green" : requiresReconnect ? "amber" : "slate"}>{connected ? "Conectado" : requiresReconnect ? "Requiere reconexión" : "No conectado"}</Badge>
        </div>

        {!data.configurationReady ? <div className="mt-5 flex gap-3 rounded-[var(--radius-md)] bg-amber-50 p-4 text-sm leading-6 text-amber-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>Este entorno no tiene configuradas las credenciales OAuth y la clave de cifrado de Google Calendar. La conexión permanece deshabilitada de forma segura.</p></div> : null}

        {!data.canConnectOwn ? (
          <div className="mt-5 flex gap-3 rounded-[var(--radius-md)] bg-slate-50 p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>El rol assistant no conecta ni administra cuentas de médicos. Solicita que cada profesional conecte su propia cuenta.</p></div>
        ) : (
          <div className="mt-5 grid gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] bg-slate-50 p-4"><dt className="font-semibold text-slate-700">Calendario</dt><dd className="mt-1 text-slate-600">Calendario principal de tu cuenta Google</dd></div>
              <div className="rounded-[var(--radius-md)] bg-slate-50 p-4"><dt className="font-semibold text-slate-700">Última sincronización correcta</dt><dd className="mt-1 text-slate-600">{formatDate(data.own?.lastSyncAt ?? null)}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-3">
              {connected ? <form action={disconnectGoogleCalendarAction}><Button type="submit" variant="secondary"><Link2Off className="h-4 w-4" />Desconectar mi cuenta</Button></form> : data.configurationReady ? <ButtonLink href="/api/integrations/google-calendar/connect"><CalendarDays className="h-4 w-4" />{requiresReconnect ? "Reconectar Google Calendar" : "Conectar Google Calendar"}</ButtonLink> : <Button type="button" disabled><CalendarDays className="h-4 w-4" />Conectar Google Calendar</Button>}
            </div>
          </div>
        )}
      </section>

      {data.clinicSummary ? <section className="surface-card mt-5 p-5"><h2 className="flex items-center gap-2 font-bold text-ink"><CircleCheck className="h-5 w-5 text-clinic" />Estado general de la clínica</h2><p className="mt-2 text-sm leading-6 text-slate-600">{data.clinicSummary.connected} cuenta(s) conectada(s) y {data.clinicSummary.requiresReconnect} que requieren reconexión. Este resumen no expone tokens ni permite administrar cuentas ajenas.</p></section> : null}

      <section className="mt-5 rounded-[var(--radius-md)] border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600"><h2 className="font-bold text-ink">Alcance y privacidad</h2><p className="mt-2">Se solicita únicamente permiso para administrar eventos en calendarios propiedad del usuario. No se solicitan Gmail, Contacts, Drive, Meet ni acceso completo al calendario. Los eventos no incluyen paciente, diagnóstico, notas clínicas ni consentimientos.</p></section>
    </>
  );
}
