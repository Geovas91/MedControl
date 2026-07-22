# Edición de citas

La ruta `/dashboard/appointments/[id]/edit` actualiza citas reales de la clínica activa. Solo membresías activas
`owner`, `doctor` y `admin` pueden editar, de acuerdo con la RLS vigente; `assistant` permanece en lectura. La
autorización se valida al cargar, al mostrar accesos y nuevamente dentro de la Server Action.

## Tenant y campos

La cita se resuelve mediante `getActiveTenantContext` y consultas filtradas por `id` y `clinic_id`. Paciente,
profesional, conflictos y actualización también se limitan al tenant. Se usa el cliente SSR autenticado y RLS, sin
aceptar un ID de clínica desde el formulario.

Solo se actualizan `patient_id`, `doctor_id`, `title`, `appointment_type`, `location`, `starts_at`, `ends_at` y
`status`. Se preservan `meeting_url`, `notes`, invitaciones, recordatorios, IDs, auditoría y recursos relacionados.
No se incluyen eliminación, cancelación especializada, recurrencia, pagos, recordatorios o notas clínicas.

## Horario, estados y conflictos

Los timestamps UTC se muestran como fecha y hora local usando `clinics.timezone`. Al guardar, `date` y `start_time`
se convierten con `combineClinicDateTime`; horas DST inexistentes o ambiguas se rechazan. La duración usa los mismos
valores de creación (15, 30, 45, 60, 90 y 120 minutos), conserva precisión de minutos y garantiza fin posterior.

La edición acepta únicamente los estados reales `scheduled`, `confirmed`, `waiting`, `completed` y `cancelled`.
Una cita pasada puede corregirse. Una cita `completed` no puede moverse al futuro manteniendo ese estado; cambiarlo
en el selector constituye una transición explícita. Una cita cancelada puede conservarse o cambiarse explícitamente,
sin añadir un flujo especializado de cancelación.

La disponibilidad usa la misma regla de creación: mismo profesional, intervalos superpuestos y citas no canceladas.
La consulta excluye el ID actual, por lo que una cita no entra en conflicto consigo misma. Una cita que se guarda
como cancelada no bloquea horario.

## Relaciones y resultado

Pacientes y profesionales se consultan desde las mismas fuentes tenant-scoped de creación. Si el perfil público del
profesional histórico ya no aparece, el formulario conserva la relación como `Profesional actual`; solo puede
mantenerse sin sustituirla por una identidad no validada. Todo nuevo profesional se valida contra
`doctor_public_profiles` de la clínica.

Tras actualizar, se revalidan el dashboard, la agenda, las fechas anterior y nueva, y los detalles del paciente
anterior y nuevo. `/dashboard/payments/new` no se revalida porque actualmente no consume citas. El destino es
`/dashboard/appointments?date=<fecha>&updated=1`; si también llega `created=1`, se muestra solo el mensaje de
actualización.

Errores de UUID, pertenencia, relaciones, fecha, DST, conflicto, RLS o Supabase producen estados genéricos sin
exponer IDs ni información de otras citas. Guardar sin cambios sigue el mismo flujo de actualización normal.
