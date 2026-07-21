# Pagos clínicos

`public.payments` representa cobros clínicos realizados por pacientes a una clínica. No almacena la suscripción
SaaS de la clínica a CliniControl: esa responsabilidad corresponde a `clinic_subscriptions` y sus eventos. Los
cobros SaaS de PayPal o Stripe nunca deben escribirse en `public.payments`.

## Lectura y aislamiento

`/dashboard/payments` resuelve el tenant con `getActiveTenantContext` y usa el cliente SSR autenticado de
Supabase. Todas las consultas filtran por el `clinic_id` resuelto en servidor y mantienen RLS. La vista selecciona
solo `id`, relaciones, monto, moneda, estado, método, concepto y fechas necesarias; no muestra UUIDs, payloads,
metadata, tokens, datos bancarios ni información de tarjetas.

La relación de paciente se limita también a la clínica activa y no genera consultas N+1. No existe una referencia
comercial visible distinta del UUID técnico, por lo que el listado no muestra una referencia de pago. Tampoco se
enlaza a un detalle de pago porque no existe una ruta real para ese recurso.

## Filtros, totales y paginación

Los filtros `status`, `patient`, `method`, `date_from`, `date_to` y `q` se normalizan en servidor. El paciente y el
método se validan contra valores de la clínica. La búsqueda combina concepto con IDs de pacientes encontrados
dentro del tenant mediante filtros PostgREST controlados, sin SQL manual.

Las fechas locales se convierten a intervalos UTC semiabiertos con la zona IANA de la clínica. La fecha operativa
es `paid_at`; cuando está vacía se usa `created_at`. Un rango invertido o valores inválidos se ignoran de forma
segura. La paginación usa 20 registros y conserva los filtros en la URL.

Los totales respetan los filtros actuales y se agrupan por moneda y estado. Los agregados PostgREST están
deshabilitados en el proyecto (`PGRST123`), así que el servidor lee únicamente `amount`, `currency` y `status` en
lotes de 1,000 filas, acumula cada lote y lo descarta antes de solicitar el siguiente. El listado visible permanece
paginado a 20 y nunca carga filas completas para calcular resúmenes. Las monedas no se suman ni convierten entre sí.

`amount` es `numeric(12,2)` y los seeds usan valores como `650.00`, por lo que representa unidades monetarias
completas, no centavos; el formato usa `Intl.NumberFormat` sin dividir ni multiplicar el valor.

## Alcance

Este módulo es exclusivamente de lectura. No crea, edita, elimina o reembolsa pagos y no modifica RLS, tablas,
migraciones o seeds. Una futura aceptación de pagos clínicos en línea necesita una arquitectura separada de la
suscripción SaaS, probablemente con cuentas conectadas como Stripe Connect. PayPal, Stripe, webhooks y facturación
fiscal quedan fuera de este flujo.
