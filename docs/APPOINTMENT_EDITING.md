# Edición de citas

La ruta `/dashboard/appointments/[id]/edit` actualiza citas reales de la clínica activa. Solo membresías activas
`owner`, `doctor` y `admin` pueden editar, conforme a RLS; `assistant` permanece en lectura. La autorización se
valida al cargar y nuevamente en la Server Action.

## Tenant y campos

La cita se resuelve mediante `getActiveTenantContext`. Cita, paciente, profesional, conflictos y actualización se
filtran por el `clinic_id` activo usando el cliente SSR autenticado. El formulario nunca proporciona el tenant.

Solo se actualizan `patient_id`, `doctor_id`, `title`, `appointment_type`, `location`, `starts_at` y `ends_at`.
`status` se administra exclusivamente desde las acciones del detalle. Se preservan `meeting_url`, `notes`,
invitaciones, recordatorios, IDs y recursos relacionados.

## Horario y conflictos

Los timestamps UTC se muestran en `clinics.timezone`. Al guardar, fecha y hora local se convierten con
`combineClinicDateTime`; horas DST inexistentes o ambiguas se rechazan. Las duraciones permitidas siguen siendo 15,
30, 45, 60, 90 y 120 minutos.

El formulario no incluye selector de estado. Una cita pasada puede recibir correcciones administrativas. Una cita
`completed` conserva su fecha y horario, aunque permite corregir título, paciente, profesional, tipo o ubicación.
Una cita `cancelled` puede reprogramarse sin reservar horario; restaurarla desde el detalle vuelve a comprobar
conflictos antes de activarla.

La disponibilidad usa la misma regla de creación: mismo profesional, intervalos superpuestos y citas no canceladas.
La consulta excluye el ID actual. Una cita que permanece cancelada no bloquea horario.

## Relaciones y resultado

Pacientes y profesionales usan las fuentes tenant-scoped de creación. Si el perfil público del profesional histórico
ya no aparece, puede conservarse como `Profesional actual`; cualquier profesional nuevo se valida contra
`doctor_public_profiles` de la clínica.

Tras actualizar, se revalidan dashboard, agenda, fechas anterior y nueva, detalle de cita y pacientes anterior y
nuevo. El destino es `/dashboard/appointments/[id]?updated=1`. Errores de UUID, pertenencia, relaciones, fecha, DST,
conflicto, RLS o Supabase producen mensajes genéricos sin exponer identificadores ni otras citas.
