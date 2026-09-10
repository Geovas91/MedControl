# Entitlements de suscripción

La autorización owner-only, intents y reentrega segura de PayPal se documentan en [PAYPAL_BILLING_SECURITY.md](./PAYPAL_BILLING_SECURITY.md). Esta política de billing no modifica la matriz de entitlements clínicos.

`lib/server/entitlements.ts` calcula siempre en servidor el plan y estado desde `clinic_subscriptions`; no usa datos del navegador. Distingue una suscripción faltante de un error técnico: ambos fallan cerrado para escrituras, y el dashboard muestra un aviso genérico de configuración o indisponibilidad sin describirlo como deuda.

El estado persistido se conserva como `persistedStatus`. El acceso se calcula como `effectiveStatus`: un `trialing` sólo permite escritura cuando `current_period_end` existe y es estrictamente posterior a `now()`. Si es nulo, igual a `now()` o anterior, el acceso efectivo es `trial_expired`; no se muta la suscripción durante la lectura, se preservan históricos y se bloquean escrituras sin afirmar que exista una deuda. Un `active` sigue activo aunque su periodo histórico haya terminado, conforme a la política actual.

`active` y `trialing` válido permiten operación normal. `past_due` mantiene lectura clínica temporal pero bloquea operaciones nuevas. `inactive`, `cancelled` y `trial_expired` conservan lectura y facturación, pero bloquean altas nuevas de pacientes, citas, pagos, notas, consentimientos, plantillas y miembros. Finalizar o editar un draft también es una modificación clínica y queda bloqueado en estados de sólo lectura.

Los límites comerciales existentes de médicos siguen centralizados en `config/plans.ts` y la RPC existente los valida al agregar miembros. No se agregaron límites de pacientes ni precios nuevos. Las suscripciones SaaS continúan separadas de `public.payments`, que contiene sólo pagos paciente-clínica.

Las capacidades por plan también se declaran de forma tipada en `config/plans.ts`. `google_calendar`, `additional_staff` y `appointment_assistant` están excluidas de Básico e incluidas en Plus y Pro. `service_bot_tier1` está incluido en todos los planes y `whatsapp_notifications` permanece deshabilitado en todos. `canUseFeature` exige a la vez que el plan incluya la capacidad y que la suscripción permita escritura efectiva; los permisos de rol y el tenant se validan adicionalmente en cada flujo servidor.

Las invitaciones ICS por email, los consentimientos personalizados por especialidad y las reseñas verificadas no tienen entitlement de plan porque están incluidos en Básico, Plus y Pro. Google Calendar es una integración distinta de las invitaciones ICS.

Una clínica sin fila en `clinic_subscriptions` se representa como `missing` y la interfaz muestra "Sin plan configurado"; nunca se presenta como Básico ni recibe permisos. Las guardas de staff y Appointment Assistant se aplican en servidor y SQL, además de ocultar los controles correspondientes.

Al bajar a Básico, los admins y assistants existentes permanecen activos, pero no pueden crearse, aceptarse ni reactivarse otros. Los jobs del Appointment Assistant que ya existen conservan su lifecycle, lease y fencing para poder finalizar o reconciliarse sin reenvío ciego; el plan Básico no puede guardar configuración ni generar jobs nuevos.

No se anuncian tiers base/completo del Appointment Assistant, roles avanzados, reportes ni prioridad/SLA de soporte porque esas diferencias no existen en el producto actual.

## Matriz manual

- Verificar `active` y `trialing`: crear paciente, cita, pago, nota, consentimiento, enlace de firma, plantilla, duplicado y miembro según rol/límite.
- Verificar trial futuro, trial que vence exactamente ahora, trial vencido y trial sin `current_period_end`; sólo el futuro permite escritura. Verificar que `active` conserva acceso aunque el periodo sea anterior.
- Verificar `past_due`, `inactive`, `cancelled` y `trial_expired`: consultar históricos y facturación; cada operación anterior debe rechazar en servidor aunque se invoque directamente.
- Simular fallo temporal de lectura de suscripción: no se concede escritura, se registra sólo el código técnico y se muestra aviso genérico.
- Confirmar que una clínica no puede consultar ni cambiar la suscripción, límites o recursos de otra clínica.
