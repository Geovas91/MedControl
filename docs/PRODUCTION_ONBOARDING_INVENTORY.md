# Inventario de preparación para producción

## Ya funcionaba

- Auth de Supabase, callback PKCE, logout, dashboard con sesión y tenant activo.
- Clínica, membresías owner/admin/doctor/assistant, RLS y planes/suscripciones separados de pagos clínicos.
- Pacientes, citas, pagos clínicos, expediente, notas, plantillas y consentimientos con filtros server-side por tenant.
- PayPal sandbox y webhook server-side existentes.

## Parcial antes de este PR

- Onboarding mínimo de clínica personal y alta de usuarios existentes como miembros.
- Health endpoint que exponía versión/entorno y sin readiness.
- Sin estados de error globales ni recuperación de contraseña en la interfaz.

## Implementado aquí

- Migración 0015 pendiente de aplicar con RPC de onboarding atómica y campos operativos de clínica.
- Formulario de onboarding en tres pasos, sin cobrar ni crear pagos clínicos.
- Entitlements de servidor y bloqueo de altas de pacientes, citas y pagos cuando no hay trial/estado activo.
- `/api/health` mínimo, `/api/ready`, cabeceras HTTP básicas y páginas de error.
- Recuperación de contraseña, documentación operativa, inventario demo y revisión estática de aislamiento.

## Fuera de alcance / bloqueantes

- No hay invitaciones por correo seguras ni proveedor de correo configurado.
- No se cambiaron precios, PayPal productivo, RLS, seeds, datos demo, ni arquitectura de pagos clínicos.
- Falta validar RLS y migraciones contra el entorno Supabase autorizado, smoke tests remotos, backups, legal y seguridad.

## Clasificación de demo/mock

Los UUIDs deterministas, `demo1`, `demo2` y contenido ficticio están limitados a `supabase/seeds/`; no se ejecutan automáticamente. Las menciones de demo en el dashboard son advertencias visibles y se mantienen hasta que la beta deje de depender de módulos incompletos. Placeholders de WhatsApp e integraciones siguen deshabilitados; no se envían mensajes ni se muestran como configurados.
