# MedControl Context

Este documento resume el contexto vigente de MedControl. No incluye credenciales reales, datos reales de pacientes ni secretos de producción.

## Objetivo

MedControl es un SaaS médico para doctores independientes y clínicas pequeñas de México. Su objetivo es ordenar la operación administrativa y clínica básica: pacientes, citas, pagos, notas médicas, consentimientos, miembros de clínica, planes comerciales, directorio público y recordatorios.

MedControl no reemplaza el juicio médico, diagnóstico, tratamiento, consentimiento legal ni revisión profesional. Antes de producción se requiere revisión legal, privacidad y seguridad.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth con `@supabase/ssr`
- Supabase SQL migrations y RLS
- ESLint 9 con `npm run lint`
- Node.js `>=20.9.0`

## Estado Actual

- La app está lista para staging público controlado, no para producción.
- Supabase Auth está implementado para login/signup y callback PKCE.
- `/dashboard` está protegido por sesión, onboarding y membresía de clínica.
- `/admin` existe como portal interno separado.
- Planes comerciales están centralizados en `config/plans.ts`.
- PayPal está preparado para suscripciones en sandbox, sin ampliar el producto ni cambiar planes.
- El directorio público y las reseñas por estrellas están en scaffolding.
- El dashboard incluye módulos reales de navegación, pero varios usan datos de ejemplo.
- Hay aviso visible en dashboard: no usar módulos con pacientes reales.
- `.env.local` está ignorado por Git y no debe subirse.
- La ruta principal de staging es GitHub + DonWeb + Supabase online + PayPal sandbox.
- La guía específica para DonWeb está en `docs/DONWEB_STAGING.md`.
- La guía operativa para deploy staging está en `docs/STAGING_DEPLOY.md`.

## Flujos

### Público

- `/` muestra landing en español con hero, features, planes y CTA.
- Los precios se muestran en MXN con `formatMXN`.
- El CTA de WhatsApp está centralizado en `config/contact.ts`.
- Mientras el teléfono siga como `521XXXXXXXXXX`, no se genera un enlace real de `wa.me`.

### Auth y Onboarding

- Login y registro usan Supabase Auth.
- La app prefiere `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` queda como fallback.
- No se usa `SUPABASE_SERVICE_ROLE_KEY` en cliente.
- Signup no debe modificarse sin una tarea explícita.

### Dashboard

- Sidebar responsive con módulos principales.
- Pacientes, citas y pagos muestran datos mock ficticios.
- Miembros/médicos permite revisar miembros de clínica y aplicar límites por plan server-side.
- Configuración e integraciones muestran estado demo/proximamente cuando no hay conexión real.

### Consentimientos

- La ruta pública `/consent/sign/[token]` está deshabilitada por defecto.
- Solo se muestra el flujo mock si `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=true`.
- Por defecto se muestra un mensaje seguro: “Este flujo de consentimiento todavía no está disponible públicamente.”
- No hay conexión real a consentimientos públicos ni políticas anon amplias.
- La firma pública real debe implementarse server-side en una fase futura.

### Integraciones

- Google Calendar, ICS, WhatsApp y email están marcados como demo/proximamente.
- No hay OAuth real, sincronización real, SMS, email real ni envío real de WhatsApp.
- Antes de producción, cualquier token de calendario debe almacenarse cifrado.
- Las invitaciones de calendario no deben incluir información clínica sensible.

## Planes Comerciales Vigentes

Los planes no deben cambiarse sin instrucción explícita.

- MedControl Básico: $349 MXN/mes + IVA, 1 médico.
- MedControl Plus: $799 MXN/mes + IVA, hasta 5 médicos por clínica.
- MedControl Pro: $1,299 MXN/mes + IVA, médicos ilimitados sujeto a uso razonable.

Reglas globales:

- Todos incluyen plantillas basadas en especialidad.
- Todos incluyen registro y consulta de pagos.
- Todos incluyen directorio médico público.
- Todos incluyen perfil público para médicos.
- Todos incluyen reseñas verificadas solo por estrellas.
- No se permiten comentarios escritos en reseñas.
- Todos están preparados para suscripción mensual vía PayPal.

## Supabase

Helpers principales:

- `lib/supabase/config.ts`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`
- `proxy.ts`
- `lib/supabase/data-access.ts`

Tablas principales:

- `profiles`
- `clinics`
- `clinic_members`
- `clinic_subscriptions`
- `patients`
- `appointments`
- `payments`
- `medical_note_templates`
- `medical_notes`
- `consents`
- `consent_signatures`
- `calendar_integrations`
- `appointment_invites`
- `bot_settings`
- `bot_logs`
- `audit_logs`

RLS:

- No hay policies anon amplias para datos sensibles.
- Miembros solo acceden a su clínica.
- Pacientes: owner, admin, doctor; assistant solo si se justifica por agenda.
- Citas: owner, admin, doctor, assistant.
- Pagos: owner/admin pueden leer/actualizar; doctor puede leer; assistant no lee por defecto.
- Notas médicas: owner/admin/doctor; assistant no lee por defecto.
- Consentimientos y firmas: owner/admin/doctor; assistant no lee texto completo ni firmas por defecto.
- Integraciones, bot settings, bot logs y audit logs: restringidos según rol.

## Variables de Entorno

Template seguro:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=
NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false
```

Notas:

- `NEXT_PUBLIC_SUPABASE_URL` debe ser la URL base del proyecto, sin `/rest/v1/`.
- No hardcodear llaves en código fuente.
- No imprimir secretos completos en scripts.
- `scripts/check-supabase-config.mjs` valida URL y key pública enmascarada.

## Errores Corregidos

- Migración a Next.js 16 y React 19.
- Migración de lint desde `next lint` hacia `eslint .`.
- Conflictos previos de `package.json` y `package-lock.json`.
- Validación de redirect interno en `/auth/callback`.
- Mensajes exactos para variables Supabase faltantes.
- URL Supabase corregida para no usar `/rest/v1/`.
- RLS endurecido para datos sensibles.
- Planes y precios centralizados.
- PayPal preparado sin instalar checkout/SDK innecesario en fases previas.
- Gestión de miembros con límites por plan server-side.
- Firma demo de consentimiento deshabilitada por defecto para staging.
- Aviso visible de datos demo en dashboard.

## Pendiente Antes de Producción

- Política de privacidad.
- Términos y condiciones.
- Aviso de privacidad para México.
- Revisión legal de consentimientos y firma.
- Revisión de seguridad de PayPal producción.
- Validación completa de RLS contra Supabase online.
- Cifrado de tokens de calendario y proveedores.
- Auditoría de logs y acceso admin.
- Revisión UX/legal de directorio y reseñas.
- Confirmar que no existan datos reales de pacientes en staging.
- Revisar todos los textos para evitar promesas de diagnóstico, tratamiento, automatización clínica o IA médica.
