# Registro manual de pagos clínicos

`/dashboard/payments/new` registra en `public.payments` cobros que la clínica ya recibió fuera de CliniControl. No
procesa dinero, tarjetas o transferencias y no representa la suscripción SaaS almacenada en `clinic_subscriptions`.
PayPal, Stripe, Apple Pay, Google Pay, webhooks y facturación fiscal quedan fuera de este flujo.

## Autorización y aislamiento

La página y la Server Action resuelven nuevamente el tenant con `getActiveTenantContext`, usan el cliente SSR
autenticado y mantienen RLS. La política vigente permite insertar pagos únicamente a membresías activas `owner` y
`admin`; por eso `doctor` y `assistant` conservan acceso de solo lectura. El botón no es el control de seguridad: la
acción también valida el rol y siempre obtiene `clinic_id` del contexto servidor.

El selector consulta solo `id`, `full_name` y `status` de pacientes de la clínica activa. Antes de insertar, el
servidor confirma de nuevo que el paciente pertenece al mismo `clinic_id`. No se aceptan IDs de clínica enviados
por el formulario o la URL.

## Campos y validación

- `amount` es `numeric(12,2)` en unidades monetarias completas. Se acepta únicamente decimal canónico positivo,
  sin exponentes ni separadores, con hasta 10 enteros y 2 decimales. La validación de límites usa centavos enteros.
- Las monedas iniciales son `MXN` y `USD`; no hay conversión.
- Los métodos manuales son `cash`, `card`, `transfer`, `deposit` y `other`. Los valores históricos siguen siendo
  texto válido para lectura y filtros, pero el formulario solo crea estos valores normalizados.
- Los únicos estados iniciales son `paid` y `pending`. Para `paid`, la fecha y hora local se convierten a UTC usando
  `clinics.timezone` y no pueden estar en el futuro. Horas DST ambiguas o inexistentes se rechazan.
- Para `pending`, `paid_at` siempre es `null`; la interfaz deshabilita fecha y hora porque no existe `due_date`.
- El concepto es texto libre normalizado, de 3 a 200 caracteres y debe contener letras o números.

La inserción envía solo `clinic_id`, `patient_id`, `amount`, `currency`, `status`, `payment_method`, `concept` y
`paid_at`. No incluye proveedor, payloads, metadata, datos bancarios, identificadores SaaS ni fechas técnicas.

## Alcance y limitaciones

No se incluye `appointment_id` en esta fase. Aunque la columna existe, asociarla exige un selector dependiente del
paciente y validación adicional de citas; no se acepta un UUID oculto sin esa interfaz segura.

El botón se deshabilita mientras la acción está pendiente y el flujo redirige después del éxito, evitando reenvíos
accidentales al refrescar. Dos solicitudes HTTP deliberadamente simultáneas aún podrían duplicar un registro; una
garantía fuerte requeriría una clave idempotente y un cambio de esquema futuro.

Después de insertar se revalidan el dashboard, el listado de pagos y el detalle del paciente. El resultado vuelve a
`/dashboard/payments?created=1&patient=<uuid>` y muestra una confirmación genérica sin nombre, monto, concepto o ID.
