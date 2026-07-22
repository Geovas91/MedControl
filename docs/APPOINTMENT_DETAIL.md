# Detalle de citas

La ruta `/dashboard/appointments/[id]` muestra una cita real del tenant activo. El UUID se valida antes de consultar
y la cita se busca por `id` y por el `clinic_id` resuelto mediante `getActiveTenantContext`. Se usa el cliente SSR
autenticado y la RLS vigente; el navegador nunca proporciona el tenant y no se usa `service_role`.

## Relaciones y campos

Paciente y profesional se consultan por separado con el mismo `clinic_id`. Esto permite mostrar `Sin registro` si
una relación histórica dejó de estar disponible, sin perder el detalle de una cita válida ni exponer identificadores.
El paciente disponible enlaza a su detalle. El profesional usa `doctor_public_profiles`, igual que creación y edición.

La vista selecciona título, estado, paciente, profesional, fecha y horario, tipo, ubicación, enlace de videollamada y
fecha de creación. No selecciona UUIDs para mostrarlos, metadata, payloads, tokens ni datos de otras clínicas. Aunque
el esquema contiene `appointments.notes`, se omite porque su semántica no garantiza que sea exclusivamente
administrativa; las notas clínicas permanecen fuera de este alcance.

## Fechas y navegación

`starts_at`, `ends_at` y `created_at` se formatean con `Intl.DateTimeFormat` y `clinics.timezone`, nunca con la zona
horaria del navegador. La duración se calcula desde los timestamps UTC. Valores o zonas horarias inválidos producen
`Sin registro`. La fecha local válida genera un regreso seguro a
`/dashboard/appointments?date=YYYY-MM-DD`; no se acepta un `returnTo` arbitrario.

La agenda y las citas del detalle del paciente enlazan a esta vista. Tras crear o editar, la aplicación redirige al
detalle real. Los parámetros exactos `created=1` y `updated=1` muestran un mensaje seguro; `updated=1` tiene prioridad
si ambos están presentes.

## Permisos y errores

Todos los miembros activos pueden consultar conforme a RLS. Solo `owner`, `doctor` y `admin` ven `Editar cita`;
`assistant` permanece en lectura. La vista no añade eliminación, cancelación, cambios rápidos de estado, cobros,
recordatorios, recurrencia ni notas clínicas.

Una sesión ausente redirige a `/login`. Una membresía ausente tiene un estado controlado. UUID inválido, cita
inexistente o cita de otra clínica producen el mismo `notFound()`. Los errores de Supabase muestran un mensaje
genérico y los logs se limitan a componente, estado y códigos técnicos seguros.
