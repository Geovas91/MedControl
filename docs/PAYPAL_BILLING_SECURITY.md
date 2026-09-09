# PayPal SaaS billing: autorización y entrega de webhooks

## Inventario previo a 0035

La aprobación consultaba `getOnboardingStatus()`, que seleccionaba la primera membresía activa. No exigía owner ni registraba una operación iniciada. Recibía plan e ID de suscripción desde el navegador, consultaba PayPal y hacía upsert por clínica con service role. Un ID ajeno del mismo plan podía asociarse a otra clínica.

El webhook verificaba firma, insertaba el receipt como `processed` antes de actualizar `clinic_subscriptions` y respondía éxito a cualquier conflicto de event ID. Una primera actualización fallida impedía reintentos. Los receipts existentes guardan metadatos mínimos, no payload raw; esta propiedad se conserva.

## Política de billing

Sólo **owner con membresía activa** puede iniciar y completar suscripciones. Admin, doctor y assistant no tienen permiso: el modelo existente no define un admin financiero. La página permite consultar el estado pero no muestra checkout a estos roles. La autorización HTTP es independiente de la interfaz y de los entitlements de escritura clínica, para permitir recuperar una suscripción inactiva.

La sesión se verifica con `auth.getUser()` mediante `getActiveTenantContext`. La selección de clínica es una preferencia contrastada con membresías activas consultadas en servidor. Si hay múltiples membresías se exige selección explícita válida; no se acepta el fallback a la primera membresía para cobrar. Ningún `clinic_id` del body determina el tenant.

## Intent y aprobación

1. `POST /api/paypal/subscription/create` autoriza owner y valida `planId` contra el catálogo existente y configuración PayPal del servidor.
2. La RPC interna crea/reutiliza un intent por clínica, bajo lock de transacción. Contiene usuario, clínica, plan comercial, plan proveedor, suscripción previa y expiración de 30 minutos. Un intent pendiente de otro usuario/plan produce conflicto, no se sustituye silenciosamente.
3. El servidor crea la suscripción PayPal con `custom_id = intent.id` y `PayPal-Request-Id = intent.id`. Consulta su representación autoritativa y liga el ID devuelto de forma inmutable. Los reintentos de creación utilizan el mismo intent. La respuesta entrega sólo intent ID y subscription ID para el SDK. No hay fuente de verdad en cookies o localStorage.
4. `POST /api/paypal/subscription/approve` reautoriza owner y comprueba intent, usuario, clínica, plan, ID proveedor y expiración antes de cualquier escritura. Para intents pendientes, consulta PayPal y exige ID, plan proveedor y custom_id coincidentes. Sólo acepta ACTIVE o APPROVED; APPROVED se persiste inactive, nunca concede acceso prematuro.
5. La RPC final vuelve a comprobar membresía activa/owner, identidad completa del intent y suscripción previa, y persiste suscripción + consumo en una sola transacción. El índice único existente impide compartir un provider ID entre clínicas. Un intent completado sólo admite replay si sigue asociado a la suscripción actual; no vuelve a escribir estado ni deshace cancelaciones recibidas por webhook.

La expiración deniega aprobación tardía. Una operación aprobada fuera de esa ventana requiere conciliación operativa, no ampliar automáticamente su validez desde el navegador. El cambio de un plan mientras existe un intent pendiente requiere esperar su expiración; no se añaden cancelaciones reales de proveedor ni cambios a precios.

## Webhook

La firma sigue verificándose con la API PayPal y credenciales/configuración del servidor. No se acepta un endpoint de proveedor suministrado por el cliente. Fallo de firma: 400 sin receipt; verificador indisponible: 503 sin receipt para permitir reentrega.

El estado sigue `received → processing → processed` o `processing → failed`. `claim_paypal_webhook` inserta de forma idempotente, bloquea la fila y entrega token de lease único por dos minutos. `processed` (y legacy `ignored`) responde 200 sin mutación. Lease vigente responde 503 para que la entrega se reintente; failed o lease vencido pueden reclamarse. Un worker antiguo no puede finalizar ni marcar failed el lease nuevo.

Para eventos de suscripción soportados se consulta el estado actual de PayPal, con timeout de 15 segundos por petición. Los eventos de pago denegado/fallido conservan past_due si PayPal aún indica ACTIVE; nunca reactivan una suscripción cancelada. La actualización de `clinic_subscriptions` y la finalización del receipt ocurren juntas en `finish_paypal_webhook`, comprobando lease y plan proveedor. No se crea una suscripción huérfana desde webhook. Si todavía no existe localmente, se marca failed y responde 503; una entrega posterior a la aprobación puede completar el trabajo.

Errores de API/DB responden 503 y se intenta marcar failed. Si también falla ese registro, el lease expirado permite recuperación. Eventos desconocidos se completan como no-op con `unsupported_event`; nunca se infiere una activación a partir de un `resource.status` arbitrario. No hay scheduler nuevo: la recuperación ocurre con la siguiente entrega del proveedor o replay autorizado de un evento firmado.

Los receipts históricos se conservan sin reinterpretar. Un legacy `processed` no prueba retrospectivamente que el handler anterior mutara la suscripción; su conciliación histórica queda pendiente y no debe resolverse borrando receipts indiscriminadamente.

## Datos y permisos

0035 agrega intents y columnas de lease, intentos, fallos y error allowlisted. RLS está habilitado; anon/authenticated no pueden leer/escribir tablas internas ni ejecutar las RPC proveedor. Sólo service_role puede ejecutar esas RPC, todas con search_path fijo. Las rutas de usuario sólo acceden al adaptador privilegiado después de autorizar; las escrituras de aprobación requieren además validar intent y proveedor. El webhook accede después de verificar firma.

No se almacenan payloads, emails, payer data ni errores raw. Las respuestas son genéricas y códigos internos; estos handlers no emiten logs de payload, errores proveedor ni headers. `public.payments` sigue reservado para pagos paciente-clínica; no participa en este flujo. Catálogo, precios, onboarding y lógica de entitlements no se modifican.

## Verificación

- `tests/unit/paypal-billing.test.ts`: handlers reales con proveedor/persistencia inyectados; autorización owner/admin/doctor/assistant, cruces de tenant, expiración, binding, replay y escenarios de reentrega/fallo. No son llamadas reales a PayPal ni E2E autenticado.
- `supabase/tests/0035_paypal_billing_hardening.sql`: RLS/grants, autorización repetida en SQL, consumo, rollback, retry y fencing de leases. Ejecutar tras `supabase db reset --local` con migraciones 0001–0035.
- Ejecutar también suites de tenant/entitlements, tests completos, lint, auditorías, build, typecheck y selección pública de navegador.

Referencias del contrato proveedor: [crear suscripciones](https://developer.paypal.com/subscriptions/integrate), [consultar custom_id](https://developer.paypal.com/api/subscriptions/v1/subscriptions-get/), [idempotencia](https://developer.paypal.com/reference/guidelines/idempotency/).

## Estado de validación local (2026-09-08)

Base: `8ca16155ed2fea06d67c36887812fd8b671c5256`, main actualizado y limpio. Rama: `codex/hardening-paypal-billing`.

- Unit tests: 334/334 PASS (40 nuevos casos PayPal, handlers/adaptador con mocks).
- Lint, auditorías internas, build, typecheck sin incremental y diff-check: PASS.
- Browser público existente: 31/31 PASS. Roles owner/admin/doctor/assistant cubiertos por handlers ejecutables con mocks; no E2E autenticado ni llamadas reales a PayPal.
- npm audit: 5 findings sin cambios (0 critical, 3 high tooling/transitivas, 1 moderate, 1 low); no audit fix.
- SQL: PASS. `supabase db reset --local` aplicó 0001–0035; la suite 0035 pasó 61/61, la suite de roles/tenant de Support pasó 39/39 y las suites transaccionales 0019/0027 pasaron. La prueba con conexiones PostgreSQL separadas pasó 4/4 y confirmó claim único, finalización cercada por token y una sola mutación.
- 0001–0034, catálogo/precios, entitlements, pagos clínicos e integraciones ajenas no cambiaron. Sin push, PR, merge, deploy ni operaciones remotas.

Archivos de este cambio:

- `app/api/paypal/subscription/create/route.ts`
- `app/api/paypal/subscription/approve/route.ts`
- `app/api/paypal/webhook/route.ts`
- `app/dashboard/billing/page.tsx`
- `components/dashboard/paypal-subscription-button.tsx`
- `lib/paypal/billing-policy.ts`
- `lib/paypal/billing-handlers.ts`
- `lib/paypal/billing-server.ts`
- `lib/paypal/webhook-handler.ts`
- `lib/paypal/server.ts`
- `types/database.ts`
- `supabase/migrations/0035_paypal_billing_hardening.sql`
- `supabase/tests/0035_paypal_billing_hardening.sql`
- `tests/unit/paypal-billing.test.ts`
- `tests/unit/paypal-provider.test.ts`
- `docs/PAYPAL_BILLING_SECURITY.md`
- `docs/SUBSCRIPTION_ENTITLEMENTS.md`
