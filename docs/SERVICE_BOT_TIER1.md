# Service Bot Tier 1

## Alcance

Service Bot es el dominio de ayuda técnica y funcional para usuarios autenticados de CliniControl. Es independiente del Appointment Assistant de `/dashboard/bot`, que opera citas, recordatorios y solicitudes de reseña. Ninguna foundation de Service Bot reutiliza `bot_settings`, `bot_logs`, `appointment_automation_jobs` ni tablas clínicas.

Phase 1 implementa modelo de datos, RLS, contratos, contenido canónico, diagnósticos determinísticos, servicios de tickets, auditoría estructurada y rate limiting durable. Phase 2 incorpora la experiencia tenant en `/dashboard/support` con el nombre visible **Ayuda y soporte**.

## Tenant UI

La interfaz es server-first y está disponible dentro del dashboard autenticado:

- `/dashboard/support`: búsqueda KB, temas frecuentes, asistente guiado, diagnósticos, creación y listas de tickets.
- `/dashboard/support/articles/[slug]`: artículo canónico publicado y elegible para el rol y features activos.
- `/dashboard/support/tickets/[id]`: detalle tenant-safe, actividad visible y respuesta sin attachments.

La navegación distingue **Asistente de agenda** (`/dashboard/bot`) de **Ayuda y soporte**. Los estados de carga, lista vacía, búsqueda sin resultados, error seguro, diagnóstico no disponible, rate limit, respuesta no resuelta y ticket creado tienen mensajes explícitos sin errores internos.

### Búsqueda y contenido

La búsqueda es lexical, limitada y opera exclusivamente sobre Markdown canónico validado con `status: published`. Prioriza coincidencias en título, luego resumen derivado y finalmente el documento. Los borradores, artículos en revisión, retirados, roles no elegibles y features no disponibles quedan fuera antes de buscar. La página de artículo valida el slug y renderiza un AST limitado sin HTML crudo ni `dangerouslySetInnerHTML`; las rutas son dinámicas y no se cachean.

### Asistente y diagnósticos

El asistente es un formulario guiado que usa `DeterministicSupportAssistantProvider`; no mantiene chat libre. Devuelve intent, estado, texto controlado, artículos, un diagnóstico allowlisted cuando corresponde y la opción de crear un ticket. Las preguntas médicas reciben rechazo seguro y no ejecutan diagnósticos ni ofrecen escalación automática.

La UI sólo presenta IDs del registry estático. El servidor vuelve a validar el ID, aplica rate limiting PostgreSQL y reduce el resultado a estado, código seguro, `verifiedAt` y slugs. Nunca muestra raw errors, tokens, provider IDs, IDs de citas, pacientes, emails completos ni secretos.

### Lifecycle tenant de tickets

El formulario acepta únicamente categoría, impacto, asunto y resumen con límites estrictos. `clinic_id`, usuario, author kind, visibilidad y severidad se derivan o calculan en servidor; todas las mutaciones usan los RPCs allowlisted de 0034. La UI advierte explícitamente que no se incluya información clínica.

Doctor y assistant ven sólo **Mis tickets**. Owner y admin ven además **Tickets de la clínica**, sin adquirir capacidades internas de soporte. El detalle combina ID y tenant derivado; un ticket ajeno o cross-tenant produce un 404 genérico. La proyección no muestra asignación interna y la consulta de mensajes excluye `internal` tanto por RLS como por filtro explícito.

El tenant puede responder mientras el ticket no esté cerrado. Sólo el requester puede cerrar su propio ticket cuando ya está `resolved`; no puede hacer triage, cambiar severidad, asignar, marcar `in_progress` ni crear notas internas.

## Arquitectura

El flujo previsto es pregunta, clasificación allowlisted, búsqueda de Knowledge Base, diagnóstico allowlisted opcional, respuesta estructurada y oferta de ticket. `DeterministicSupportAssistantProvider` es la única implementación inicial. No existe proveedor AI, llamada a LLM, RAG ni tool calling dinámico.

Las preguntas identificadas inequívocamente como diagnóstico, tratamiento, medicamentos o dosis se rechazan con una respuesta estructurada, sin diagnóstico técnico, ticket automático ni acceso a datos clínicos.

`SupportContext` se deriva en servidor de la sesión y clínica activa. Contiene exclusivamente IDs de usuario/clínica, rol, plan, estado efectivo y feature entitlements. Nunca acepta un `clinic_id` confiado desde el cliente.

## Knowledge Base

La fuente canónica inicial vive en `content/support/es`. Cada Markdown tiene frontmatter estricto con slug, título, categoría, versión, estado, roles, features y `clinical_content: false`.

El validador rechaza campos desconocidos, contenido clínico, HTML crudo, imágenes, esquemas `javascript:`, `data:` o `vbscript:`, enlaces externos no permitidos y contenido fuera de límites. Phase 1 no publica automáticamente el contenido a PostgreSQL.

El catálogo PostgreSQL se compone de:

- `support_article_categories`
- `support_articles`
- `support_article_versions`

Usuarios autenticados sólo pueden leer versiones activas y publicadas para sus roles. No tienen escritura directa.

## Diagnósticos

El registry es estático y sólo admite:

- `session_status`
- `current_role`
- `subscription_access`
- `appointment_write_readiness`
- `member_management_readiness`
- `google_calendar_status`
- `appointment_automation_status`
- `email_provider_readiness`
- `feature_entitlement`

Cada resultado contiene `diagnosticId`, estado, código seguro, fecha de verificación y slugs sugeridos. Calendar usa la proyección segura existente: doctor sólo su conexión, assistant ninguna conexión ajena y owner/admin un resumen agregado. Appointment Assistant se reduce al estado agregado del scheduler; no expone jobs, citas, pacientes ni `appointmentId`. Email se reduce a readiness.

No existen SQL dinámico, imports derivados del input, shell, nombres de tabla dinámicos ni acciones correctivas.

## Tickets y tenant isolation

Las tablas son:

- `support_tickets`
- `support_ticket_messages`
- `support_ticket_events`
- `support_interaction_metrics`

Los RPCs reciben el tenant resuelto por el servicio server-only y vuelven a comprobar membresía activa. La severidad se calcula en PostgreSQL desde categoría e impacto; el cliente nunca la establece. No existe severidad `critical`.

Owner/admin pueden leer todos los tickets de su clínica. Doctor/assistant sólo los creados por ellos. Todas las consultas de aplicación combinan ID de ticket con el `clinic_id` derivado. Mensajes `internal` nunca son visibles para usuarios tenant.

Las tablas no aceptan escritura directa de `authenticated`; las mutaciones pasan por RPCs allowlisted. `platform_admin` tampoco obtiene acceso directo desde un cliente. La futura `/admin/support` deberá validar primero el guard de plataforma y usar servicios server-only separados.

Subject, summary y body son texto no confiable con límites de 140, 2,000 y 4,000 caracteres. La UI futura debe advertir que no se incluya información clínica. CliniControl no afirma poder detectar automáticamente toda PHI.

## Auditoría y logging

Los RPCs escriben eventos estructurados. El diagnóstico usa `support_diagnostic_executed` con sólo ID y código allowlisted. No se guardan preguntas, respuestas, subject, summary, body, paciente, email ni teléfono en `audit_logs`.

Los logs usan `component=support_bot` y operaciones `kb_search`, `diagnostic`, `ticket_create` o `ticket_update`. Los contextos se construyen con claves y códigos cerrados. No se pasa texto libre al logger y no se depende únicamente de la redacción genérica del logger.

## Rate limiting

`support_rate_limit_counters` implementa ventanas durables en PostgreSQL, compartidas entre procesos PM2:

- diagnósticos: 10 por minuto;
- creación de tickets: 3 por hora;
- mensajes: 20 por hora.

Son límites iniciales, centralizados en el contrato TypeScript y la función SQL. Cambiarlos requiere mantener ambos contratos y sus pruebas sincronizados. No hay contadores en `Map` o memoria local.

## Entitlement

`service_bot_tier1` está habilitado para Basic, Plus y Pro. Phase 1 no implementa SLA ni prioridad comercial diferente.

## Retención inicial

- `support_interaction_metrics`: 90 días.
- datos operativos de diagnóstico: máximo 90 días.
- tickets y mensajes cerrados: 12 meses.
- auditoría: política general de auditoría de CliniControl.
- versiones KB: lifecycle de contenido.

Phase 1 no crea jobs de purga. La automatización de retención requiere una fase posterior con validación local y staging.

## Interfaz futura de LLM

`SupportAssistantProvider` permite otra implementación futura sin cambiar contratos. Un proveedor LLM sólo podría recibir intent normalizado, fragmentos KB publicados, rol/plan/entitlements generales y diagnósticos seguros. Nunca recibiría pacientes, expediente, notas, diagnósticos clínicos, citas, emails, teléfonos, tokens, secretos ni raw provider errors.

## Fuera de alcance

- `/admin/support`
- chat o persistencia de conversaciones
- LLM/RAG
- notificaciones Resend de tickets
- attachments
- realtime
- acciones correctivas
- publicación automática Markdown a PostgreSQL
- jobs automáticos de retención

## Phase 3 — soporte humano interno

La bandeja /admin/support está protegida por platform_admin y ofrece triage allowlisted, asignación únicamente a administradores de plataforma, notas internas no visibles al tenant y respuestas públicas. Las lecturas usan proyecciones seguras sin acceso a expedientes clínicos.

SupportNotificationService usa Resend de forma best-effort. Configurar SUPPORT_EMAIL_TO=soporte@clinicontrol.mx como variable server-only; si falta el destinatario o Resend no está disponible, el ticket permanece persistido y se registra sólo un código sanitizado. Los correos contienen referencia, estado y enlaces seguros, nunca cuerpos, PHI ni datos clínicos. No hay reintentos automáticos.

Auditoría registra únicamente acciones estructuradas y metadatos allowlisted; no se guardan textos de tickets, notas, correos ni errores del proveedor. Fuera de alcance: LLM/RAG, attachments, realtime, helpdesk externo, WhatsApp, impersonación y acciones correctivas automáticas.
