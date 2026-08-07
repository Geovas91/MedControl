# Invitaciones de calendario por correo v1

## Alcance

La versión v1 envía un archivo iCalendar desde el servidor después de confirmar una escritura de cita. Creación,
reprogramación y restauración usan `METHOD:REQUEST`; cancelación usa `METHOD:CANCEL` y `STATUS:CANCELLED`. Un fallo de
correo nunca revierte la cita.

Sólo los cambios de horario, ubicación o profesional generan una actualización. Cambios administrativos como título
o tipo de cita no envían correo. Una cita cancelada puede editarse, pero no envía otro evento hasta que se restaura.

## Migración 0020

`0020_appointment_calendar_email_invitations.sql` amplía `appointment_invites` con UID, secuencia, método, estado de
entrega, message ID, último intento e idempotencia. La función `prepare_appointment_email_invite` usa un advisory lock
por cita, bloquea la fila existente y conserva una sola fila para el canal `email`.

La misma clave de operación devuelve `should_send=false` sin incrementar `sequence`. Una operación nueva conserva
`ics_uid` e incrementa `sequence`. El índice único de cita/canal evita duplicados físicos y el índice de idempotencia
evita reutilizar una operación. La migración falla de forma explícita si existieran duplicados históricos; no elimina
datos automáticamente. Antes de aplicarla, un operador debe comprobar:

```sql
select appointment_id, count(*)
from public.appointment_invites
where channel = 'email'
group by appointment_id
having count(*) > 1;
```

No se ejecuta esta migración desde la aplicación ni desde CI.

## Correo e ICS

Se reutiliza Resend. El wrapper admite adjuntos y envía una idempotency key formada por cita, secuencia y método. El
ICS usa UTC, CRLF, folding de 75 octetos, UID estable, secuencia monotónica, organizador, asistente y contenido
administrativo mínimo. No incluye título de la cita, diagnóstico, notas, tratamiento, pagos ni consentimientos.

Las plantillas HTML y texto formatean la fecha con `clinics.timezone`. Destinatario ausente (`missing_recipient`) y
configuración incompleta (`disabled`) se resuelven antes de preparar la fila: no consumen la clave de idempotencia, no
reservan ni incrementan `sequence` y pueden reintentarse con la misma operación cuando se corrija la precondición.
Errores confirmados quedan como `failed`; timeout como `delivery_unknown`. No existe retry automático para estados ya
consumidos porque un timeout puede terminar en entrega y repetirlo duplicaría el evento.

## Variables de entorno

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY` server-only
- `EMAIL_FROM` con dominio verificado
- `EMAIL_REPLY_TO` opcional
- `EMAIL_REQUIRED`
- `APP_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` server-only, requerido por la infraestructura de correo ya existente
- configuración SSR de Supabase existente

No se requieren credenciales de Google Calendar para adjuntos `.ics`.

## Riesgos y validación pendiente fuera del repositorio

- Aplicar 0020 primero en una base aislada y luego en staging mediante un operador autorizado.
- Verificar SPF, DKIM y dominio de Resend.
- Probar entrega real únicamente con cuentas ficticias/autorizadas en Gmail, Outlook y Apple Calendar.
- Confirmar que reprogramar reemplaza el evento y cancelar lo retira usando el mismo UID.
- Mantener `EMAIL_REQUIRED=false` hasta completar la validación de staging.
