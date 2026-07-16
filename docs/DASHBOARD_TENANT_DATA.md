# Datos de tenant en el dashboard

El resumen del dashboard resuelve el tenant exclusivamente en servidor a partir del usuario autenticado y `clinic_members`. Sólo considera membresías con `status = 'active'`; después consulta la clínica y todos los datos operativos mediante el cliente SSR normal de Supabase, RLS y un filtro explícito por `clinic_id`.

## Selección temporal de clínica

Todavía no existe un selector multi-clínica. Si un usuario tiene más de una membresía activa, se elige de forma determinista la membresía más antigua por `created_at`; `clinic_id` ascendente funciona como desempate. Esta limitación debe sustituirse por una selección explícita de tenant en una entrega futura.

El `clinic_id` nunca se recibe desde query params, localStorage ni componentes cliente.

## Métricas

- Pacientes: total de registros del tenant, conservando la semántica previa de `patients.length`.
- Citas: registros cuyo `starts_at` cae dentro del día local de `clinics.timezone`.
- Ingresos: suma histórica de pagos `paid` en MXN.
- Pendiente: suma histórica de pagos `pending` en MXN.

La agenda sólo selecciona hora, paciente, título/tipo y estado. La antigua sección mock de seguimientos se reemplaza por un estado vacío porque no existe una fuente de actividad reciente segura y claramente definida.

## Pruebas

El repositorio todavía no tiene un runner de pruebas unitarias. El cálculo del rango diario IANA, formato horario, agregación/formato MXN y estado vacío se mantienen como funciones puras en `lib/dashboard/` para facilitar pruebas futuras. En este PR se validan mediante TypeScript, lint y build; no se añade una infraestructura de tests nueva.
