# Detalle de citas

La ruta `/dashboard/appointments/[id]` muestra una cita real del tenant activo. El UUID se valida y la cita se busca
por `id` y por el `clinic_id` resuelto mediante `getActiveTenantContext`. Se usa el cliente SSR autenticado y RLS;
el navegador nunca proporciona el tenant y no se usa `service_role`.

## Relaciones y campos

Paciente y profesional se consultan por separado con el mismo `clinic_id`. Una relación histórica ausente muestra
`Sin registro` sin perder una cita válida ni exponer identificadores. El profesional usa `doctor_public_profiles`.

La vista selecciona título, estado, paciente, profesional, fecha y horario, tipo, ubicación, videollamada y fecha de
creación. No muestra UUIDs, metadata, payloads, tokens ni datos de otras clínicas. `appointments.notes` se omite
porque su semántica no garantiza que sea exclusivamente administrativa.

## Fechas, navegación y mensajes

`starts_at`, `ends_at` y `created_at` se formatean con `Intl.DateTimeFormat` y `clinics.timezone`. La duración se
calcula desde UTC. Valores inválidos producen `Sin registro`. La fecha local genera un regreso seguro a la agenda;
no se acepta un `returnTo` arbitrario.

Agenda, dashboard y detalle del paciente enlazan a esta vista. Los parámetros exactos `created=1`, `updated=1` y
los valores autorizados de `status_updated` muestran un mensaje seguro. La prioridad es cambio de estado, edición y
creación, por lo que nunca aparecen dos mensajes.

## Permisos y errores

Todos los miembros activos pueden consultar conforme a RLS. `owner`, `doctor` y `admin` pueden editar y gestionar
transiciones normales; restaurar queda limitado a `owner` y `admin`. `assistant` permanece en lectura. No se añaden
eliminación, cobros, recordatorios, recurrencia ni notas clínicas.

Una sesión ausente redirige a `/login`. Una membresía ausente tiene un estado controlado. UUID inválido, cita
inexistente o cita de otra clínica producen el mismo `notFound()`. Los errores de Supabase muestran un mensaje
genérico y los logs se limitan a componente, estado y códigos técnicos seguros.
