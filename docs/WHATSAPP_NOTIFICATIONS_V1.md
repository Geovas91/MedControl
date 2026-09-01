# WhatsApp Notifications v1

## Alcance de Phase 1

Esta fase crea únicamente fundamentos de datos, dominio y provider. No genera automáticamente jobs WhatsApp, no llama a Meta, no expone un webhook externo y no incorpora UI de consentimiento. `WHATSAPP_OUTBOUND_ENABLED` permanece desactivado por defecto y el provider Meta responde de forma controlada con `provider_not_enabled` o `provider_not_configured`.

La primera capacidad funcional futura será exclusivamente `appointment_reminder`. Quedan fuera: mensajes de cita creada/reprogramada/cancelada, chatbot, inbound general, Embedded Signup y números propios por clínica.

## Arquitectura

- `appointment_automation_jobs` continúa siendo el único scheduler persistente. Phase 1 agrega `reminder_whatsapp` y el canal `whatsapp`, pero no crea esos jobs automáticamente.
- `whatsapp_provider_accounts` representa una cuenta/número emisor compartido o, en el futuro, propio de una clínica.
- `whatsapp_integrations` vincula explícitamente una clínica con una cuenta emisora y mantiene toggles independientes de email.
- `whatsapp_templates` permite sólo `appointment_reminder`, `es_MX` y las variables `appointment_date` y `appointment_time`.
- `patient_communication_preferences` conserva consentimiento y teléfono E.164 separados de email y de `patients.phone`.
- `whatsapp_message_deliveries` registra únicamente estado técnico y relaciones internas.

La abstracción `WhatsAppProvider` define envío de template, readiness, verificación/parsing futuro de webhook y mapeo de estados. `MetaWhatsAppCloudProvider` es deliberadamente un skeleton sin `fetch` ni URL de Graph API.

## Job frente a delivery

El estado del job describe el trabajo del scheduler. En una fase futura, `job=succeeded` significará que el provider aceptó la solicitud; no significará que el mensaje fue entregado o leído.

La delivery usa:

`sending → accepted → sent → delivered → read`

`failed` y `delivery_unknown` son terminales. `delivery_unknown` se reserva para una llamada cuyo resultado no puede determinarse con seguridad y no debe reintentarse automáticamente. La base bloquea regresiones, el cambio de relaciones internas y un `failed` posterior a `delivered/read`.

## Consentimiento y E.164

Los estados son `not_set`, `opted_in` y `opted_out`. El opt-in exige teléfono E.164, fecha, fuente y versión de términos. Las fuentes v1 son `patient_portal`, `clinic_staff_written` y `clinic_staff_verbal`; las fuentes de clínica requieren actor.

El teléfono se guarda canónicamente con `+`, código de país explícito y un máximo de 15 dígitos. No se infiere `+52` ni otro país. Cambiar `phone_e164` invalida automáticamente el consentimiento anterior y vuelve a `not_set`. El opt-out de WhatsApp no modifica email.

Los futuros eventos de auditoría usarán metadata allowlisted (`channel`, estado, fuente y versión) sin incluir el teléfono.

## Templates y contenido

El cliente no elige nombre Meta, variables libres ni texto. El registry del servidor admite sólo:

- logical key: `appointment_reminder`
- idioma: `es_MX`
- variables: `appointment_date`, `appointment_time`

No se admiten nombre del paciente o médico, especialidad, tipo de cita, URL, PHI ni texto arbitrario.

## Entitlement y kill switch

`whatsapp_notifications` existe como capacidad tipada, pero vale `false` en Básico, Plus y Pro hasta que exista una decisión comercial. Esto es independiente del kill switch:

```text
WHATSAPP_OUTBOUND_ENABLED=false
```

Aunque se cambie accidentalmente a `true`, el skeleton actual continúa devolviendo `provider_not_configured` y no tiene implementación de red.

## Seguridad

- Las cinco tablas habilitan RLS y revocan todo acceso directo a `anon` y `authenticated`.
- Las relaciones de clínica, cita, job, integración, cuenta y template están protegidas por FKs compuestas y triggers con `search_path` fijo.
- Los tokens sólo pueden persistirse como un envelope cifrado versionado. Phase 1 espera el token compartido en configuración server-side futura y no almacena uno.
- Deliveries no contienen teléfono, cuerpo, variables, nombre del paciente ni payload de webhook.
- Los códigos de error están allowlisted y limitados a un formato seguro.
- No existe `service_role` en componentes cliente ni variables WhatsApp con prefijo `NEXT_PUBLIC`.

## Variables futuras

Todas son server-only y deben permanecer sin valores reales en el repositorio:

```text
WHATSAPP_PROVIDER
WHATSAPP_GRAPH_API_VERSION
META_WHATSAPP_ACCESS_TOKEN
META_WHATSAPP_APP_SECRET
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
META_WHATSAPP_WABA_ID
META_WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_TOKEN_ENCRYPTION_KEY
```

## Plan posterior de staging

Una fase autorizada posterior deberá implementar el cliente Meta y webhook firmado, aprobar un template real, configurar un WABA/número de prueba controlado, habilitar únicamente una clínica ficticia, capturar opt-in y ejecutar una cita futura. La validación deberá distinguir tests unitarios/SQL de aceptación, entrega y lectura reales del provider. Ningún teléfono de prueba debe quedar hardcodeado.

## No implementado

- llamadas a Meta o cualquier otro provider;
- enqueue automático de `reminder_whatsapp`;
- webhooks GET/POST;
- persistencia/rotación de credenciales reales;
- UI para opt-in, integración o toggles;
- lifecycle notifications, inbound, STOP/BAJA o chatbot;
- Embedded Signup, números propios o decisión comercial.
