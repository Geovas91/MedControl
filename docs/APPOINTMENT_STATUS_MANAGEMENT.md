# Gestión de estados de citas

La gestión operativa se realiza desde `/dashboard/appointments/[id]` y actualiza únicamente `appointments.status`.
El enum real es `scheduled`, `confirmed`, `waiting`, `completed` y `cancelled`. No existe `no_show`; por ello este PR
no ofrece “Marcar inasistencia”, no reutiliza `waiting` con otro significado y no modifica el esquema.

## Transiciones y roles

| Estado actual | Destinos permitidos |
| --- | --- |
| `scheduled` | `confirmed`, `waiting`, `completed`, `cancelled` |
| `confirmed` | `waiting`, `completed`, `cancelled` |
| `waiting` | `completed`, `cancelled` |
| `completed` | ninguno; es terminal |
| `cancelled` | `scheduled`; se presenta como restauración |

La RLS permite `UPDATE` a `owner`, `admin` y `doctor`; `assistant` permanece en lectura. Los tres primeros pueden
aplicar transiciones normales. Solo `owner` y `admin` pueden restaurar. Página, Server Action y RLS validan permisos.

## Tiempo y conflictos

Las comparaciones usan timestamps UTC y `clinics.timezone` como autoridad:

- Confirmar requiere que la fecha local no sea anterior a hoy.
- Poner en espera requiere que la cita sea de la fecha local actual.
- Completar requiere que `starts_at` ya haya ocurrido.
- Cancelar se permite para estados no terminales, incluso como corrección administrativa pasada.
- Restaurar conserva paciente, profesional y horario.

Restaurar exige un profesional. Antes de activar se buscan superposiciones del mismo profesional, filtradas por
tenant, excluyendo la cita actual e ignorando citas canceladas. Un conflicto no revela la cita que ocupa el horario.

## Concurrencia y revalidación

El formulario envía solo `target_status` y `expected_current_status`; el ID proviene de la ruta. La acción vuelve a
leer por `id` y `clinic_id` y actualiza con filtros por `id`, `clinic_id` y estado anterior. Cero filas produce un
error de estado obsoleto sin revelar el nuevo valor.

Después se revalidan dashboard, agenda general, fecha local, detalle de cita y detalle del paciente. La redirección
usa solo valores autorizados de `status_updated`, con prioridad sobre `updated=1` y `created=1`.

## Edición, historial y alcance

Edición ya no cambia estados. Una cita completada mantiene fecha y horario; una cancelada puede reprogramarse sin
bloquear horario y solo vuelve a estar activa mediante restauración con conflicto. Creación continúa limitada a
`scheduled` o `confirmed`.

Existe `audit_logs`, pero `doctor` no puede insertar y no hay tabla dedicada de historial de estados. Para mantener
comportamiento uniforme no se escribe historial ni se crea migración. Tampoco se guarda razón de cancelación porque
no existe columna específica y `notes` no se usa para ese fin.

Quedan fuera eliminación, inasistencia hasta que exista un estado real, recurrencia, recordatorios, mensajería,
cobros, reembolsos, notas clínicas y cambios masivos. No existe runner de pruebas unitarias; las reglas quedan como
helpers puros para incorporarlas cuando haya infraestructura.
