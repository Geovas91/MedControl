# Google Calendar v1

CliniControl sincroniza de forma unidireccional las citas hacia el calendario principal del médico asignado. La relación es por `(clinic_id, user_id)`: una misma persona puede autorizar calendarios distintos por clínica y owner/admin sólo obtiene un resumen sin tokens. CliniControl sigue siendo la fuente primaria.

## Alcance OAuth

La integración usa un cliente OAuth 2.0 de tipo **Web application** separado de Supabase Auth/Google Login. Solicita exactamente:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

Este scope permite crear, modificar y borrar eventos en calendarios propiedad del usuario. No se solicitan Gmail, Contacts, Drive, Meet, Calendar completo, calendar list ni lectura de identidad/email. La aplicación usa el identificador especial `primary`, por lo que no necesita consultar la lista de calendarios.

El flujo Authorization Code ocurre sólo en el servidor con `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, state aleatorio de un solo uso ligado a usuario, clínica y hash de la sesión autenticada, y redirect URI exacto. `offline` solicita un refresh token; `consent` fuerza una pantalla de consentimiento para maximizar que Google lo entregue al conectar o reconectar; `include_granted_scopes` conserva autorización incremental sin solicitar scopes adicionales. La respuesta se valida igualmente contra el único scope permitido.

Google puede omitir `refresh_token` en autorizaciones posteriores. En ese caso sólo se conserva un secreto existente si pertenece al mismo usuario/clínica, usa la versión de cifrado soportada, descifra correctamente y la fila continúa en estado reutilizable. La actualización compara el ciphertext esperado en una sola sentencia para no resucitar un secreto desconectado concurrentemente. Sin secreto válido, la integración no se marca conectada y se solicita nuevo consentimiento. Un refresh token nuevo reemplaza el anterior mediante un único UPSERT.

Referencias oficiales:

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/identity/protocols/oauth2/policies
- https://developers.google.com/workspace/calendar/api/guides/errors

## Configuración manual en Google Cloud Console

1. Crear o seleccionar un proyecto controlado por la organización.
2. Habilitar **Google Calendar API**.
3. Configurar **OAuth consent screen**, datos de contacto y usuarios de prueba mientras la aplicación no esté verificada.
4. Declarar únicamente el scope `https://www.googleapis.com/auth/calendar.events.owned`.
5. Crear un OAuth Client ID de tipo **Web application** exclusivo para Calendar.
6. Registrar como Authorized redirect URIs, según el entorno:

```text
http://localhost:3000/api/integrations/google-calendar/callback
https://staging.clinicontrol.mx/api/integrations/google-calendar/callback
https://<dominio-publico-de-produccion-confirmado>/api/integrations/google-calendar/callback
```

La URI futura de producción debe usar el dominio público definitivo configurado también como origen de la aplicación; no debe inventarse antes de confirmar ese dominio. Google exige coincidencia exacta de esquema, host, puerto y path.

## Variables server-only

```text
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
CALENDAR_TOKEN_ENCRYPTION_KEY=
```

`CALENDAR_TOKEN_ENCRYPTION_KEY` debe ser una clave aleatoria de 32 bytes codificada en base64 y administrada por el secret manager del entorno. No reutilizar el client secret ni una key de Supabase. Este repositorio no genera ni contiene valores reales. Si falta cualquier variable o la key no mide exactamente 32 bytes, conectar y sincronizar fallan de forma segura.

### Limitación de rotación en v1

`token_encryption_version=1` identifica el formato AES-256-GCM, no una versión de clave ni un KMS. La aplicación acepta una sola `CALENDAR_TOKEN_ENCRYPTION_KEY`; por tanto, cambiarla directamente hace que los tokens anteriores fallen cerrado y requieran reconexión. Para una rotación planificada se debe mantener la clave anterior hasta desconectar/reconectar todas las integraciones, o ejecutar una migración controlada server-side que descifre con la clave anterior y vuelva a cifrar con la nueva antes del cambio. V1 no implementa dual-key ni rotación automática y no debe presentarse como si lo hiciera.

## Sincronización y fallos

Después de crear, reprogramar, cancelar o restaurar una cita, el servidor intenta sincronizar Google Calendar sin bloquear la mutación clínica. El evento usa título `Cita CliniControl`, visibilidad privada, horario y timezone de la clínica; no incluye paciente, diagnóstico, notas, consentimientos ni datos clínicos.

La relación local appointment/event es tenant-safe e idempotente. Los IDs de Google provienen exclusivamente de la relación persistida y nunca del cliente. Un refresh rechazado elimina el token local, marca `expired` y permite reconectar. Fallos temporales se registran con códigos sanitizados y la cita permanece intacta. Esta v1 no incluye cron, webhooks/watch, sincronización bidireccional, importación, Outlook, Apple OAuth, Gmail, Contacts, Meet, WhatsApp ni SMS.
