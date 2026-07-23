# Entitlements de suscripción

`lib/server/entitlements.ts` calcula siempre en servidor el plan y estado desde `clinic_subscriptions`; no usa datos del navegador. `active` y `trialing` permiten operación normal. `past_due` mantiene lectura clínica temporal pero bloquea administración de miembros. `inactive` y `cancelled` conservan lectura y facturación, pero bloquean altas nuevas de pacientes, citas y pagos mediante las funciones servidoras.

Los límites comerciales existentes de médicos siguen centralizados en `config/plans.ts` y la RPC existente los valida al agregar miembros. No se agregaron límites de pacientes ni precios nuevos. Las suscripciones SaaS continúan separadas de `public.payments`, que contiene sólo pagos paciente-clínica.

Pendiente: una política aprobada para expiración/cancelación, guardas equivalentes para todas las acciones de creación de notas y miembros, y una fuente productiva de cambios de estado validada por PayPal.
