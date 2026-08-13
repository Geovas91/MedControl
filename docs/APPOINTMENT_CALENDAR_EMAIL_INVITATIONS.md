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

## Validación local y staging

- La migración 0020 fue aplicada mediante un reset completo 0001–0020 en Supabase local aislado. Las pruebas SQL
  verifican UID, secuencia, idempotencia, estados consumidos, roles, tenant, constraints y el fallo explícito ante
  duplicados históricos. La configuración local temporal no forma parte del repositorio.
- La migración 0020 fue aplicada correctamente en staging.
- Resend usa `mail.clinicontrol.mx` como dominio verificado y `EMAIL_REQUIRED=false` permanece configurado.
- Gmail/Google Calendar fue validado end-to-end: creación, reprogramación sobre el mismo evento, cancelación,
  restauración y ausencia de duplicados visibles.
- Outlook fue validado funcionalmente con datos ficticios/autorizados.
- Apple Calendar continúa pendiente por falta de una cuenta disponible. No se presenta como compatibilidad validada;
  esta ausencia de cobertura manual no invalida los resultados obtenidos en Gmail y Outlook.

## Hallazgos de revisión final pendientes

- La migración concede `SELECT`, `INSERT` y `UPDATE` de tabla a `authenticated` para una RPC `SECURITY INVOKER`.
  Las policies limitan por `clinic_id`, pero las FKs actuales de `appointment_invites` no vinculan de forma compuesta
  `clinic_id` con `appointment_id` y `patient_id`. Antes de sacar el PR de draft se debe impedir que una escritura
  directa pueda mezclar identificadores de otra clínica o bloquear su fila única de email.
- La edición de citas permite cambiar `patient_id`, pero el flujo de calendario no trata ese cambio como una operación
  de destinatario: no cancela el evento del paciente anterior ni solicita el evento para el nuevo. Debe definirse y
  probarse ese ciclo antes de habilitar el flujo como listo para merge.
