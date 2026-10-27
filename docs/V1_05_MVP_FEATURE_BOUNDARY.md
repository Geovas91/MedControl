# V1-05 — Frontera MVP de CliniControl v1.0

Base verificada: `72f26cedfd28816fb7108db8b1bce16fc6da407e`.
Rama: `codex/v1-05-mvp-feature-boundary`.
Alcance: implementación local para revisión; sin push, integración ni despliegue.

## Política del release

`lib/release-boundary.ts` es una política fija, compartida por presentación y
servidor. Excluye Asistente de agenda (determinista y conversacional), sus
automatizaciones de recordatorios/reseñas, sincronización Google Calendar,
mensajería automática WhatsApp/SMS y el proveedor LLM experimental. No lee
variables, flags, JSON, suscripciones ni valores del navegador para habilitarlos.
Las capacidades desconocidas también se rechazan. Una futura habilitación
requiere otro cambio de código revisado y la revisión correspondiente de SQL.
Las implementaciones se conservan.

## Puntos de control

| Entrada | Comportamiento MVP |
| --- | --- |
| `/dashboard/bot`, `/dashboard/settings/integrations` | `notFound()` antes de consultar datos; sus enlaces desaparecen de navegación/configuración. |
| Planes, landing y facturación que consume el catálogo | Sin oferta de Assistant, Google Calendar o mensajería automática; entitlements efectivos deshabilitados para todos los planes. |
| Acciones Assistant de planificación/confirmación/configuración | Rechazo previo al planner, escritura o ejecución. |
| Otras acciones de conversación, selección, sugerencias y lectura | Denegadas mediante el contexto central real del registro de herramientas, antes de búsquedas/RPC. |
| Registro de herramientas | Contexto, preparación y confirmación de mutaciones denegados. Un `actionId` antiguo tampoco puede ejecutarse. |
| Cancelación de una propuesta pendiente | Se conserva como descarte administrativo con las comprobaciones existentes de actor/tenant. No cancela una cita. No permite ejecutar la propuesta. |
| Servicio de configuración Assistant | Rechazo antes de resolver contexto o guardar opciones. |
| Cron `/api/internal/appointment-automations/run` | Conserva autenticación: 401 sin credencial válida; 403 con credencial válida. No importa el runner tras el rechazo. |
| Runner importado directamente | Cero claims, jobs, heartbeat o envíos. Una configuración outbound inválida conserva su error previo. |
| API de estado de automatizaciones | 403 sin consultar la base. |
| OAuth Google connect/callback | 403 antes de sesión, estado OAuth, tokens o llamadas externas. |
| Hook de agenda para Google | `disabled` antes de lecturas, mappings o jobs de sincronización. |
| Adaptadores Google y desconexión | Sin intercambio/renovación/revocación de tokens ni creación/edición/borrado de eventos. |
| WhatsApp servidor | Deshabilitado aunque su variable diga `true`. El adaptador Meta existente es un stub sin transporte; Twilio/SMS sólo tienen placeholders, sin emisor implementado. |
| Proveedor y transporte LLM, incluido smoke QA opt-in | Rechazo antes de usar credenciales o fetch; el smoke informa `BLOCKED/release_unavailable`. |

El soporte determinista Service Bot sigue separado del Appointment Assistant.
La ayuda del Asistente informa su indisponibilidad y enlaza a la agenda manual.
La guía Google requiere un entitlement que este release no concede.

## Producto y comunicaciones conservados

Sin cambios de implementación en registro/login, OAuth de Supabase Auth,
onboarding, miembros, permisos/RLS clínicos, pacientes, expediente, notas,
documentos PDF, agenda manual, disponibilidad, pagos o ciclo PayPal.
La creación/reprogramación/cancelación manual conserva sus RPC, autorización,
tenant y validación de estado originales. El hook opcional de Google se vuelve
un no-op; no bloquea la operación clínica.

Precios mensuales: Básico $349, Plus $799, Pro $1299 MXN más IVA. Límites de
profesionales: 1 / 5 / sin límite; las reglas existentes de personal se conservan.
No hay modificación de precios, upgrades ni billing lifecycle.

No se modifica `lib/outbound-policy.ts`, Resend ni la configuración de correo
transaccional: Auth de Supabase sigue independiente, y se conservan invitaciones
de miembros, correo/ICS de agenda y notificaciones esenciales de soporte. Los
flujos manuales de reseñas y enlaces de WhatsApp iniciados por personas no son
automatizaciones y permanecen. El modo Staging `isolated` y los rechazos por
configuración inválida conservan su comportamiento; no se habilitan envíos para
obtener un test PASS.

## Frontera de base de datos: preparada, NO aplicada

Ocultar una ruta Next no protege llamadas directas a PostgREST ni los triggers
existentes. `supabase/migrations/0066_mvp_feature_boundary.sql` prepara una
corrección limitada que requiere autorización de despliegue independiente:

- Revoca EXECUTE de creación, claim y ejecución de propuestas Assistant y de
  guardado de su configuración a PUBLIC, anon, authenticated y service_role.
- Deshabilita únicamente `appointments_enqueue_automation_jobs`,
  `bot_settings_refresh_appointment_automation` y
  `clinics_refresh_appointment_automation_timezone`.
- Revoca las entradas de rebuild/claim/begin-delivery/issue-review de
  automatizaciones a esos mismos roles.
- Conserva funciones, datos, propuestas, jobs, histórico y operaciones de
  finish/cancel/cleanup. No reescribe RPC de agenda, RLS ni datos clínicos.

Las firmas y nombres se cotejaron con las migraciones versionadas. Su test local
es una comprobación estática de alcance, **no una ejecución SQL ni una prueba de
permisos en una base desplegada**. No se ejecutó ninguna migración, local o remota.
El estado efectivo de grants/triggers en Staging/producción es UNKNOWN.
No afirmar cierre de las vías directas de base de datos hasta aplicar y verificar
este control en un despliegue autorizado.
No se requieren variables de entorno nuevas.

## Dependencias operativas antes de aceptación de producción

1. En un cambio autorizado separado, revisar/aplicar 0066 sobre la base realmente
   desplegada y verificar las ocho firmas revocadas y los tres triggers. Verificar
   además que no exista otro rol/grant o wrapper SECURITY DEFINER que las exponga.
2. Detener o retirar runners antiguos/in-flight antes del cambio. No reactivar
   Cron ni reprocesar automáticamente jobs/propuestas históricos. Un emisor que
   ya obtuvo datos/credenciales o atravesó begin-delivery no se detiene con un
   rechazo posterior de la aplicación ni con una revocación de EXECUTE.
3. Inventariar PM2/systemd/Cron, pg_cron/Edge Functions/webhooks, otros despliegues
   y emisores de terceros. Confirmar qué código ejecutan y quién conserva
   credenciales service-role/proveedor. Este cambio no atesta su aislamiento.
4. Los propietarios/superusuarios de PostgreSQL y procesos externos con acceso
   privilegiado no quedan contenidos por esta política. Su control requiere
   verificación operativa independiente, sin apagar el correo esencial.
5. Los tokens/configuración Google almacenados no se borran ni revocan externamente.
   Cualquier tratamiento operativo posterior requiere autorización específica.

No se amplía este trabajo a ASSISTANT-002.4I/J. No hay atestación de infraestructura
ni aceptación de producción derivada de mocks. La recuperación o reversión no
debe restaurar grants/triggers experimentales automáticamente: requiere revisión
explícita, aun cuando se revierta el código de aplicación.

## Validación local

Node.js 22.23.2, Next.js 16.4.3; dependencias/lockfile sin modificaciones.

| Validación | Resultado |
| --- | --- |
| `npm run test:unit` | 840 PASS, 0 FAIL, 0 SKIP; incluye 17 casos nuevos de frontera MVP. |
| `npm run test:assistant:qa` | 292 PASS; subconjunto de la suite completa. |
| `npm run test:assistant:qa:browser` | 14 PASS, harness local aislado, persistencia/proveedores simulados. |
| `npm run test:auth-oauth` | PASS: redirecciones del OAuth de autenticación. |
| `npm run build` | PASS: compilación, TypeScript y generación de rutas. |
| TypeScript `--noEmit --incremental false` | PASS. |
| `npm run lint` | PASS, 0 errores; dos advertencias preexistentes en `tests/assistant-browser/patient-actions.ts`. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades de producción. Sin cambios de dependencias. |
| `git diff --check` | PASS. |

Los casos nuevos ejecutan módulos reales con la política MVP real y dobles sólo
en los bordes de IO: intentos de mutación/propuestas antiguas, acciones directas,
handlers HTTP, runner, transportes, páginas/navegación, catálogo, email esencial y
lifecycle manual con tenant derivado del servidor. Las suites existentes cubren
además creación manual, disponibilidad, permisos/tenant, PDF y comunicaciones.
Los errores de autorización de las RPC se simulan para comprobar su propagación;
esto no demuestra RLS/grants remotos.

Las pruebas antiguas de lógica conservada usan fixtures explícitos sólo en VM o
en el webpack del harness de tests para representar un futuro release revisado.
No existe override de producción para activarlos. Los 14 tests browser prueban
esa lógica conservada, **no acceso al Asistente en el MVP**. Los bloqueos reales
se comprueban por separado en `mvp-feature-boundary.test.ts`.

Build realizado con configuración sintética del proceso y Supabase apuntando a
loopback, sin tocar archivos de entorno. El arranque opcional adicional de
`next start` local fue rechazado por el control automático (`blocked by policy`);
no se reintentó. La cobertura HTTP consiste en invocación de handlers reales con
Request/Response y dobles de IO, no un smoke sobre un servidor Next de producción.

Sin pruebas clínicas/remotas, migraciones ejecutadas, pagos reales, envíos reales,
conexión al VPS, modificación de secretos/entorno ni certificación de CI remoto.
Riesgos pendientes: cierre SQL aún no validado en PostgreSQL, emisores externos o
procesos antiguos, y verificación real de workflows después de un despliegue
autorizado. Recomendada revisión del commit y de 0066 antes de integrar.

## Archivos de implementación

El commit contiene exclusivamente estos archivos, incluyendo documentación y
adaptaciones de fixtures para conservar cobertura de código excluido:

```text
app/api/appointment-automations/live-status/route.ts
app/api/integrations/google-calendar/callback/route.ts
app/api/integrations/google-calendar/connect/route.ts
app/api/internal/appointment-automations/run/route.ts
app/dashboard/bot/actions.ts
app/dashboard/bot/page.tsx
app/dashboard/settings/integrations/actions.ts
app/dashboard/settings/integrations/page.tsx
app/dashboard/settings/page.tsx
app/page.tsx
components/dashboard/dashboard-shell.tsx
config/plans.ts
content/support/es/asistente-de-agenda.md
docs/V1_05_MVP_FEATURE_BOUNDARY.md
lib/assistant/llm/provider.ts
lib/assistant/llm/transport.ts
lib/assistant/tools/registry.ts
lib/release-boundary.ts
lib/server/appointment-assistant-access.ts
lib/server/appointment-assistant.ts
lib/server/appointment-automation-runner.ts
lib/server/appointment-google-calendar.ts
lib/server/google-calendar-integration.ts
lib/server/google-calendar-provider.ts
lib/server/whatsapp/config.ts
scripts/qa/assistant-openai-smoke.ts
supabase/migrations/0066_mvp_feature_boundary.sql
tests/assistant-browser/boundaries.ts
tests/assistant-browser/server.mjs
tests/helpers/retained-planner-transport.ts
tests/unit/appointment-assistant-confirm-eligibility.test.ts
tests/unit/appointment-assistant-context-reliability.test.ts
tests/unit/appointment-assistant-live-gates.test.ts
tests/unit/appointment-assistant-outbound-protection.test.ts
tests/unit/appointment-assistant-plan-authority.test.ts
tests/unit/appointment-assistant-read-tools.test.ts
tests/unit/commercial-plan-entitlements.test.ts
tests/unit/financial-access-containment.test.ts
tests/unit/google-calendar-integration.test.ts
tests/unit/google-calendar-persistence.test.ts
tests/unit/missing-subscription-authorization.test.ts
tests/unit/mvp-feature-boundary.test.ts
tests/unit/professional-plan-capacity.test.ts
```

`V1_05_IMPLEMENTATION=PASS` se limita al código y pruebas locales. La frontera
completa de una instalación requiere el control SQL y operativo pendiente.
