# Entrega de correo de invitaciones

## Arquitectura

CliniControl usa exclusivamente Resend para correos de invitación. La Server Action crea o rota primero mediante las RPC existentes; después construye el correo y lo envía desde el servidor. Un error de Resend nunca revierte la invitación ni su enlace. La migración `0017_clinic_member_invitation_email_delivery.sql` agrega sólo estado técnico y una RPC protegida para registrarlo; debe aplicarse por un operador autorizado y es forward-only.

## Configuración

Variables server-only: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` opcional y `EMAIL_REQUIRED`. `EMAIL_FROM` debe usar un dominio verificado; staging puede usar `invitaciones@staging.clinicontrol.mx` y producción `invitaciones@clinicontrol.mx`. No se verifica DNS desde el código. SPF, DKIM y dominio se configurarán durante el bloque DonWeb.

`APP_BASE_URL` debe ser una URL absoluta sin slash final y HTTPS fuera de development. Readiness no envía correos: devuelve `disabled` si no es obligatorio y falta configuración, `ready` con Resend válido, o `required_unavailable` y HTTP 503 si `EMAIL_REQUIRED=true` sin integración válida.

## Datos y seguridad

El correo contiene sólo clínica, rol traducido, vencimiento, botón/enlace y avisos de seguridad. No incluye datos clínicos, pagos, datos de otros miembros, suscripción ni identidad del owner. HTML y texto escapan todos los valores dinámicos. El raw token sólo aparece dentro del enlace del cuerpo, nunca en logs, auditoría, metadatos del proveedor, almacenamiento del navegador o query params del dashboard.

La auditoría registra `invitation_email_sent`, `invitation_email_failed` o `invitation_email_disabled` con proveedor, estado técnico y rol. Las escrituras directas siguen revocadas; la RPC de resultado exige Auth y owner/admin de la clínica de la invitación, no recibe correo, token, URL ni cuerpo.

## Operación y pruebas

El auto-chequeo ligero `npm run test:invitation-email` valida configuración, URL, remitente, roles, escape HTML, plantilla y clasificación segura de errores sin llamar a Resend.

1. Sin correo: crear invitación, confirmar copia manual y estado `disabled`.
2. Resend válido: confirmar `messageId`, estado `sent` y auditoría segura.
3. Error de Resend: invitación continúa pending, enlace copia, estado `failed` y no se crea otra invitación.
4. Generar enlace nuevo: invalida el token anterior, incrementa `rotation_count` y sólo entonces intenta un nuevo correo.
5. Doble submit: el botón pendiente evita el segundo envío; no se manda correo al listar o revalidar.
6. RLS: anon y authenticated directo no escriben la tabla; owner/admin de otro tenant no registra resultados ajenos; `token_hash` no es accesible.
7. Trial vencido: las RPC de creación/rotación rechazan antes de llamar a Resend.

En cuentas de desarrollo sin dominio verificado, Resend puede limitar destinatarios. No hay bypass ni simulación de éxito; el enlace manual permanece disponible. No hay retry automático: si Resend confirma envío y la persistencia técnica falla, no se reenvía y se registra únicamente un error técnico seguro.

## Rollback

Para desactivar entrega, dejar `EMAIL_PROVIDER` vacío y `EMAIL_REQUIRED=false`, reiniciar el proceso y usar copia manual. No eliminar invitaciones, tokens ni historial técnico. Si 0017 ya se aplicó, no se revierte automáticamente.
