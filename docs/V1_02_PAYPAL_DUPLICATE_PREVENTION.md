# V1-02 — Prevención de suscripciones PayPal duplicadas

Base local/remota verificada mediante fetch: `3e9ad9171c34a185a793fc57c19bcc431ff73de4`.
Rama: `codex/v1-02-paypal-duplicate-prevention`. Un commit local; sin push ni despliegue.

## Hallazgo y estados inspeccionados

La migración 0035 serializaba `begin` por clínica, pero sólo reutilizaba intenciones
pendientes no vencidas. Dos solicitudes podían recibir una intención sin ID y ambas
enviar un POST. Tras vencer la intención, otra operación podía usar otra clave aunque
el primer POST hubiera tenido éxito. Además, se consultaban detalles del proveedor
antes de guardar el ID recibido, ampliando la ventana de resultado incierto.

Se revisaron los estados reales del modelo versionado: suscripciones locales
`inactive/trialing/active/past_due/cancelled`, orígenes `paypal/demo/manual`,
intenciones `pending/completed`, vencimiento, ID de proveedor y asociación actor/clínica.
Los estados locales de onboarding/trial sin referencia externa pueden iniciar la
primera compra. `active`, `past_due` o cualquier referencia externa bloquean otra.

No se consultaron filas del Supabase remoto ni se usaron credenciales reales.
La cantidad actual de duplicados o de operaciones ambiguas en Staging/producción
es **UNKNOWN**; debe comprobarse en el proyecto autorizado antes del despliegue.

## Estrategia

- Un índice único mantiene como máximo una intención `pending` por clínica,
  incluyendo las vencidas. No se borran operaciones ni se crean reemplazos al vencer.
- `begin_paypal_billing_intent` conserva el lock transaccional por clínica, valida
  propietario activo, bloquea suscripciones existentes y referencias históricas,
  y reutiliza únicamente la operación compatible con actor, plan y plan PayPal.
- `claim_paypal_billing_creation` comprueba otra vez propietario/clínica, estado
  de suscripción e intención, y cambia atómicamente `creation_dispatched_at` de
  NULL a timestamp. Sólo una solicitud obtiene permiso para el POST.
- El adaptador obtiene OAuth antes del claim. Una falla de OAuth permite reintentar
  la misma intención todavía no enviada. El claim se confirma antes del POST;
  no se mantiene una transacción abierta durante una llamada a PayPal.
- Se conserva `PayPal-Request-Id=intent.id` y `custom_id=intent.id`. Una vez consumido
  el permiso, no hay otro POST automático, ni lease recuperable, reset ni flag de bypass.
- El ID de la respuesta se guarda antes del GET de detalles. Si el GET falla, un
  reintento consulta ese mismo ID. Si falla el guardado, se pierde su confirmación
  o se pierde la respuesta al POST, no se genera otra operación para compensar.
- Un resultado conocido sólo vuelve al checkout si corresponde al ID/plan/intent
  esperados, continúa `APPROVAL_PENDING` y no venció. `ACTIVE/APPROVED` devuelve
  conflicto; otros estados requieren revisión. Nunca se presenta un fallo como éxito.
- `complete_paypal_billing_intent` conserva el consumo idempotente y también impide
  que una aprobación antigua sustituya una suscripción actual. No cambia webhooks.

La clave de idempotencia del proveedor no sustituye el journal durable: PayPal
documenta retención de 72 horas para creación de suscripciones y posibles errores
en solicitudes simultáneas con la misma clave. No se depende de esa ventana para
autorizar reintentos inciertos:
[Create subscription](https://developer.paypal.com/api/subscriptions/v1/subscriptions-create),
[Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).

## Concurrencia y recuperación

| Situación | Resultado |
| --- | --- |
| Clicks repetidos en el documento | Comparten la promesa en curso; otra tarjeta/plan recibe conflicto. |
| Pestañas o procesos simultáneos | SQL serializa begin y sólo un claim puede enviar POST. |
| Error OAuth antes del claim | Puede reintentarse la misma intención, sin otro ID de operación. |
| Claim confirmado pero respuesta perdida | Bloqueo conservador, aun si no llegó a enviarse el POST. |
| POST fallido, timeout o respuesta perdida | 503 inicial; luego conflicto/resultado incierto, sin nuevo POST. |
| ID guardado; respuesta del bind o GET perdida | Relectura del ID durable y GET, sin otra creación. |
| Intención nunca enviada y vencida | Se extiende el vencimiento de la misma intención; mantiene su UUID. |
| Intención enviada o ligada, vencida | Permanece bloqueada; no se genera reemplazo. |
| Activa, pago pendiente o referencia externa | Conflicto. Upgrade/downgrade/reemplazo quedan para V1-03. |

No existe endpoint para liberar una operación incierta. Los timeouts pueden dejar
la clínica bloqueada hasta conciliación autorizada en V1-03, incluso si PayPal no
creó nada. Es una pérdida de disponibilidad deliberada para evitar dobles cobros.
Una respuesta GET puede quedar obsoleta frente a cambios posteriores del proveedor;
esto no autoriza otro POST y la aprobación conserva su verificación existente.

## Migración 0067 — preparada, NO ejecutada

Añade `creation_dispatched_at` a `paypal_billing_intents`. Las filas existentes
reciben un valor conservador de operación posiblemente enviada, sin asumir que
una fila sin ID representa un fallo definitivo. Sólo `begin` crea nuevas filas con NULL.

Antes de agregar el índice, la migración aborta si ya hay varias intenciones
pendientes por clínica. No elige una automáticamente ni elimina datos para continuar.
Restringe `service_role` a SELECT directo del journal; toda escritura pasa por RPC
SECURITY DEFINER con search_path fijo. Clientes/anon conservan sus restricciones.
No modifica RLS, pagos clínicos, precios, V1-05, credenciales ni configuración.

Preflight operativo de sólo lectura, en el proyecto confirmado y sin imprimir IDs:

```sql
select count(*) as clinics_with_multiple_pending
from (select clinic_id from public.paypal_billing_intents
      where status='pending' group by clinic_id having count(*) > 1) conflicts;
select status, count(*) as operations,
       count(*) filter (where provider_subscription_id is null) as without_provider_id,
       count(*) filter (where expires_at <= now()) as expired
from public.paypal_billing_intents group by status;
select status, billing_provider, count(*) as clinics,
       count(*) filter (where provider_subscription_id is not null) as with_provider_reference
from public.clinic_subscriptions group by status,billing_provider;
```

Comprobar historial hasta 0066, propiedad/ACL de tabla y funciones, grants efectivos
(también por herencia) y ausencia de wrappers que permitan borrar/resetear el journal.
Si hay conflictos históricos, detener el despliegue y resolverlos con evidencia del
proveedor y autorización específica. No cambiar status/expiry ni borrar filas sólo
para hacer pasar el preflight.

Orden recomendado, sólo tras autorización separada: respaldar release y metadatos;
detener todos los writers de billing antiguos y proteger el tráfico; aplicar sólo
0067 con abort-on-error; verificar índice, ACL y claim; arrancar el código nuevo.
El backend nuevo falla cerrado si falta la migración. No mantener backend antiguo
activo con la nueva semántica ni restaurarlo sin protección: no conoce el claim.
Un rollback no debe eliminar el journal ni restaurar la creación sin estas guardas.

## Interfaz y alcance conservado

El propietario ve un mensaje en lugar del botón si ya existe una suscripción o hay
una operación incierta. Una pendiente compatible permite continuar sólo ese plan.
Los botones usan estado ocupado/inert; al aprobar se refresca la página para que
las otras tarjetas dejen de ofrecer una nueva contratación. Cancelar el popup no
cancela una suscripción en PayPal. No se implementa cancelación ni cambio de plan.

Precios Básico/Plus/Pro y límites permanecen sin cambios. Autorización owner-only,
tenant derivado del servidor, consentimiento/validación de aprobación, webhooks y
flujos clínicos se conservan. No se modifican las restricciones V1-05.

## Validación

Node.js 22.23.2, Next.js 16.4.3; dependencias y lockfile sin cambios.

| Comprobación | Resultado |
| --- | --- |
| Tests relevantes de billing/proveedor/duplicación | 71 PASS, 0 FAIL. |
| Suite unitaria completa | 873 PASS, 0 FAIL, 0 SKIP. |
| TypeScript `--noEmit --incremental false` | PASS. |
| `npm run build` | PASS, con configuración sintética del proceso y Supabase en loopback. |
| `npm run lint` | PASS; dos advertencias preexistentes en `tests/assistant-browser/patient-actions.ts`. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades de producción. |
| `git diff --check` | PASS. |

Se ejecutan los handlers y adaptadores reales con dobles de PayPal/DB; la concurrencia HTTP usa un
modelo atómico del borde SQL. Esa prueba **no demuestra concurrencia PostgreSQL**.

Preparadas sin ejecutar:

- `supabase/tests/0067_paypal_duplicate_subscription_prevention.sql`: permisos,
  scope/owner, claim único, vencimiento ambiguo, bind tardío y aprobación antigua.
- `scripts/test-paypal-creation-concurrency.mjs`: dos conexiones PostgreSQL al
  contenedor local fijo, un begin por clínica y un solo permiso. No aplica migraciones
  ni lee dotenv/credenciales; necesita 0067 ya aplicada bajo autorización separada.
- Ajuste del fixture 0035 para adquirir el permiso antes de bind.

No se ejecutó ninguna migración, fixture de base, pago, llamada PayPal real ni
conciliación remota. La validación SQL y el estado de datos desplegados quedan
pendientes; no son PASS ni se confunden con los tests unitarios.

V1-03 debe conciliar operaciones inciertas/antiguas, aprobación ya realizada sin
persistencia local, cancelación, reemplazo y cambios de plan. V1-02 los bloquea,
sin inventar resultados del proveedor ni implementar esa conciliación.

## Archivos cambiados

```text
app/dashboard/billing/page.tsx
components/dashboard/paypal-subscription-button.tsx
docs/V1_02_PAYPAL_DUPLICATE_PREVENTION.md
lib/paypal/billing-handlers.ts
lib/paypal/billing-policy.ts
lib/paypal/billing-server.ts
lib/paypal/creation-client.ts
lib/paypal/server.ts
scripts/test-paypal-creation-concurrency.mjs
supabase/migrations/0067_paypal_duplicate_subscription_prevention.sql
supabase/tests/0035_paypal_billing_hardening.sql
supabase/tests/0067_paypal_duplicate_subscription_prevention.sql
tests/unit/paypal-billing.test.ts
tests/unit/paypal-duplicate-prevention.test.ts
tests/unit/paypal-provider.test.ts
```

Recomendación: revisar e integrar el commit como cambio acotado. El despliegue
requiere preflight de datos, validación real de SQL/concurrencia y autorización
separada. `V1_02_IMPLEMENTATION=PASS` se refiere a implementación y pruebas locales;
no certifica aplicación de 0067, datos remotos, pagos reales ni aceptación de Staging.
