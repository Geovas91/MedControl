# Logging y errores de producción

El logger estructurado elimina claves sensibles como contraseñas, tokens, cookies, datos clínicos, nombres, correos y teléfonos. Los logs deben contener sólo componente, operación, código técnico y estado. No registrar payloads de formularios, notas, consentimientos, firmas ni respuestas completas de Supabase/PayPal.

`app/error.tsx`, `app/global-error.tsx` y `app/not-found.tsx` muestran mensajes genéricos. Las referencias de error son identificadores técnicos sin datos clínicos. Las rutas clínicas deben seguir usando `dynamic`/`no-store` según corresponda y nunca colocar información clínica en metadata o URLs. Los tokens y URL de invitación se tratan como secretos de corta duración: no se registran, no se incluyen en auditoría y no se adjuntan a mensajes de error.

La entrega de invitaciones registra únicamente `component=invitation_email`, operación, estado técnico seguro, `invitation_id`, `clinic_id` y proveedor. Los timeout se registran como entrega no confirmada (`delivery_unknown`), nunca como envío fallido confirmado. Para estado `disabled`, el proveedor es `null`. Nunca registra destinatario, token, hash, URL, HTML, texto, API key ni respuesta completa de Resend.
