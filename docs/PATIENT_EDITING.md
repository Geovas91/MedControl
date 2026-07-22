# Edición de pacientes

La ruta `/dashboard/patients/[id]/edit` permite actualizar datos reales de un paciente dentro de la clínica activa.
Solo las membresías activas `owner`, `doctor` y `admin` pueden editar, en concordancia con la RLS vigente. El rol
`assistant` permanece en modo de consulta. Tanto la página como la Server Action verifican autorización.

## Aislamiento y campos

El tenant se resuelve en servidor con `getActiveTenantContext`. La carga, validación de pertenencia y actualización
filtran simultáneamente por el UUID del paciente y el `clinic_id` del contexto. La acción no recibe ni acepta un ID
de clínica del formulario, usa el cliente SSR autenticado y conserva RLS.

Solo se actualizan `full_name`, `status`, `email`, `phone`, `date_of_birth`, `sex`, `relevant_history` y
`primary_doctor_id`. No se envían `id`, `clinic_id`, `created_at`, `updated_at` ni campos de citas, pagos, notas,
consentimientos o membresías. Un UUID inválido, ausente o perteneciente a otra clínica produce el mismo estado de
recurso no encontrado y no revela su existencia.

## Validación y médicos

Edición reutiliza `getPatientFormValues` y `validatePatientFormValues`, por lo que conserva las reglas de creación:
normalización de texto, correo y teléfono; enums de estado y sexo; fecha `YYYY-MM-DD` sin conversión horaria; edad
máxima de 120 años; y antecedentes limitados a 2,000 caracteres.

Las opciones de médico se comparten entre creación y edición. Se leen de `doctor_public_profiles`, se filtran por
la clínica activa, excluyen `profile_id` nulo, eliminan duplicados y se ordenan por nombre. La acción vuelve a
validar el médico seleccionado dentro del tenant; el valor nulo sigue permitido.

Los duplicados de correo y teléfono se buscan únicamente dentro de la clínica activa y con `id !=` al paciente
actual. Esta comprobación de aplicación evita conflictos habituales, pero no garantiza exclusión frente a dos
actualizaciones deliberadamente simultáneas sin una restricción única en base de datos.

## Resultado y alcance

Una actualización correcta redirige a `/dashboard/patients/[id]?updated=1` y muestra un mensaje genérico. Si llegan
`created=1` y `updated=1`, se presenta únicamente el mensaje de actualización. Se revalidan `/dashboard`, el listado
y detalle del paciente, además de los selectores en `/dashboard/appointments/new` y `/dashboard/payments/new`.

El flujo no elimina, archiva, duplica ni cambia de clínica al paciente. Tampoco modifica citas, pagos, notas,
diagnósticos, archivos, consentimientos, Auth, RLS, migraciones o seeds.
