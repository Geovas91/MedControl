# Entitlements de suscripción

`lib/server/entitlements.ts` calcula siempre en servidor el plan y estado desde `clinic_subscriptions`; no usa datos del navegador. Distingue una suscripción faltante de un error técnico: ambos fallan cerrado para escrituras, y el dashboard muestra un aviso genérico de configuración o indisponibilidad sin describirlo como deuda.

`active` y `trialing` permiten operación normal. `past_due` mantiene lectura clínica temporal pero bloquea operaciones nuevas. `inactive` y `cancelled` conservan lectura y facturación, pero bloquean altas nuevas de pacientes, citas, pagos, notas, consentimientos, plantillas y miembros. Finalizar o editar un draft también es una modificación clínica y queda bloqueado en estados de sólo lectura.

Los límites comerciales existentes de médicos siguen centralizados en `config/plans.ts` y la RPC existente los valida al agregar miembros. No se agregaron límites de pacientes ni precios nuevos. Las suscripciones SaaS continúan separadas de `public.payments`, que contiene sólo pagos paciente-clínica.

Las guardas se aplican en las funciones servidoras y la RPC de miembros, además de ocultar controles de gestión en la interfaz. Pendiente: una política aprobada para expiración/cancelación y una fuente productiva de cambios de estado validada por PayPal.

## Matriz manual

- Verificar `active` y `trialing`: crear paciente, cita, pago, nota, consentimiento, enlace de firma, plantilla, duplicado y miembro según rol/límite.
- Verificar `past_due`, `inactive` y `cancelled`: consultar históricos y facturación; cada operación anterior debe rechazar en servidor aunque se invoque directamente.
- Simular fallo temporal de lectura de suscripción: no se concede escritura, se registra sólo el código técnico y se muestra aviso genérico.
- Confirmar que una clínica no puede consultar ni cambiar la suscripción, límites o recursos de otra clínica.
