# Creación de citas

La ruta `/dashboard/appointments/new` crea citas con el cliente SSR autenticado de Supabase. No usa
`service_role` ni acepta un `clinic_id` desde el formulario.

## Aislamiento y permisos

- La página y la Server Action resuelven nuevamente el tenant activo con `getActiveTenantContext`.
- Todas las consultas de pacientes, médicos, conflictos e inserción usan el `clinic_id` resuelto en servidor.
- Los roles `owner`, `doctor` y `admin` pueden crear citas, en correspondencia con la política RLS vigente.
- El rol `assistant` conserva acceso de lectura a la agenda, pero no ve ni puede usar el formulario de creación.
- El paciente y el médico se vuelven a validar contra la clínica activa antes de insertar.
- Los médicos disponibles provienen de los perfiles profesionales de la misma clínica. Su `profile_id` es el
  identificador almacenado actualmente en `appointments.doctor_id`.

## Fecha, hora y disponibilidad

La fecha y la hora ingresadas se interpretan en la zona horaria IANA configurada para la clínica y se guardan
como instantes UTC. Se rechazan de forma segura las horas inexistentes o ambiguas durante cambios de horario.
La duración se limita a 15, 30, 45, 60, 90 o 120 minutos.

Antes de insertar se busca cualquier cita no cancelada del mismo médico donde
`starts_at < nuevo_ends_at` y `ends_at > nuevo_starts_at`. Esta verificación evita cruces normales, pero sigue
siendo una comprobación de aplicación: dos solicitudes estrictamente simultáneas podrían competir porque este
PR no añade un constraint de exclusión ni modifica el esquema.

## Alcance

Este flujo solo crea citas con estado inicial `scheduled` o `confirmed`. No edita, cancela ni elimina citas,
no envía invitaciones y no activa integraciones externas. Después de crear, revalida el dashboard, la agenda y
el detalle del paciente, y redirige a la fecha correspondiente con un mensaje genérico de éxito.

El repositorio no tiene un comando ni runner de pruebas configurado. Este PR mantiene las validaciones de fecha,
hora, duración y zona horaria en funciones puras para facilitar pruebas futuras, sin incorporar un framework nuevo.
