# MedControl Staging Deploy

Esta guía prepara MedControl para un despliegue público de staging controlado con HTTPS. La ruta principal es GitHub + DonWeb + Supabase online + PayPal sandbox. Staging sirve para validar flujos, seguridad básica, Supabase online y PayPal sandbox; no es producción abierta.

## Objetivo

Validar en un dominio público controlado:

- Landing pública y pricing en `/#pricing`.
- Login/signup con Supabase Auth.
- Onboarding y dashboard protegido.
- Portal admin protegido por `platform_admins`.
- Directorio público y reseñas por estrellas.
- PayPal Subscriptions en sandbox.
- Webhook público de PayPal sandbox.

Para instrucciones específicas de DonWeb, usar `docs/DONWEB_STAGING.md`.

## Requisitos Previos

- Node.js `>=20.9.0`. Este repo incluye `.nvmrc` con `20.9.0` y `package.json` con `engines.node`.
- HTTPS en el hosting de staging.
- Proyecto Supabase online creado y migrado.
- Credenciales Supabase y PayPal sandbox configuradas como variables de entorno del hosting.
- No usar `.env.local` para deploy; solo para desarrollo local.
- No usar datos reales de pacientes en staging.

## Build y Runtime

Scripts actuales:

```bash
npm install
npm run lint
npm run build
npm run start
```

Comando de build:

```bash
npm run build
```

Comando de start para hosting Node tradicional:

```bash
npm run start
```

Notas:

- `next.config.mjs` no define configuración especial.
- Next.js App Router usa Server Components, route handlers y `proxy.ts`.
- `proxy.ts` refresca sesión con Supabase SSR helpers cuando las variables Supabase existen.
- Route handlers server-side incluyen PayPal approve y PayPal webhook.
- En DonWeb Cloud Server / CloudPanel / VPS, usar un proceso Node persistente con `npm run start`.
- En hosting Node/cPanel, confirmar que el plan soporta Next.js SSR, route handlers y webhooks antes de usarlo.

## Variables de Entorno

No hardcodear valores reales en archivos versionados. Configurar estas variables en el panel del hosting.

| Variable | Alcance | Obligatoria en staging | Uso |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Sí | URL base del proyecto Supabase, sin `/rest/v1/`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública | Sí, o usar anon fallback | Key pública preferida para Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | Solo si no se usa publishable key | Fallback legacy para Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Privada server-side | Sí para admin/webhooks/server helpers que usan admin client | Nunca usar en Client Components. |
| `APP_BASE_URL` | Privada/server env | Sí | URL absoluta de la app para callbacks y links generados. |
| `NEXT_PUBLIC_ENABLE_DEMO_CONSENT` | Pública | Sí | Mantener `false` en staging público controlado. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Pública | Sí para probar botón PayPal sandbox | Client ID público sandbox para SDK de PayPal. |
| `PAYPAL_CLIENT_ID` | Privada server-side | Sí para PayPal sandbox | Client ID server-side sandbox. |
| `PAYPAL_CLIENT_SECRET` | Privada server-side | Sí para PayPal sandbox | Secret server-side sandbox. |
| `PAYPAL_ENV` | Privada/server env | Sí | Debe ser `sandbox`. No usar `live` en staging. |
| `PAYPAL_WEBHOOK_ID` | Privada server-side | Sí para webhook sandbox | ID del webhook sandbox configurado en PayPal. |
| `PAYPAL_BASIC_PLAN_ID` | Privada/server env | Sí para probar Básico | Plan ID sandbox de MedControl Básico. |
| `PAYPAL_PLUS_PLAN_ID` | Privada/server env | Sí para probar Plus | Plan ID sandbox de MedControl Plus. |
| `PAYPAL_PRO_PLAN_ID` | Privada/server env | Sí para probar Pro | Plan ID sandbox de MedControl Pro. |
| `GOOGLE_CLIENT_ID` | Privada/server env | No | Placeholder. Integraciones Google están demo/proximamente. |
| `GOOGLE_CLIENT_SECRET` | Privada server-side | No | Placeholder. No usar credenciales productivas todavía. |
| `GOOGLE_REDIRECT_URI` | Privada/server env | No | Placeholder. No hay OAuth real. |
| `TWILIO_ACCOUNT_SID` | Privada server-side | No | Placeholder. Mensajería real no implementada. |
| `TWILIO_AUTH_TOKEN` | Privada server-side | No | Placeholder. No usar credenciales productivas todavía. |
| `TWILIO_MESSAGING_SERVICE_SID` | Privada/server env | No | Placeholder. Mensajería real no implementada. |

Valores de referencia:

```bash
APP_BASE_URL=http://localhost:3000
APP_BASE_URL=https://TU-DOMINIO-DONWEB.com
NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false
PAYPAL_ENV=sandbox
```

## APP_BASE_URL

`APP_BASE_URL` se usa para URLs absolutas cuando aplica:

- Redirect de email Auth en signup: `${APP_BASE_URL}/auth/callback?next=/dashboard`.
- URL pública de perfil en dashboard directory.
- Fallback de hosting: si `APP_BASE_URL` falta y existe `VERCEL_URL`, el código lo puede usar como alternativa técnica. Para DonWeb, configurar siempre `APP_BASE_URL`.
- Fallback local: `http://localhost:3000`.

Para staging, configurar:

```bash
APP_BASE_URL=https://TU-DOMINIO-DONWEB.com
```

También puede usarse un dominio temporal del hosting mientras no exista dominio real. No hardcodear ese dominio en el código.

## Supabase Online Checklist

Antes del deploy:

1. Confirmar que todas las migraciones están en el repo:
   - `0001_initial_medcontrol_schema.sql`
   - `0002_platform_admins.sql`
   - `0003_clinic_subscriptions.sql`
   - `0004_onboarding_personal_clinic.sql`
   - `0005_clinic_plan_limits.sql`
   - `0006_clinic_member_management.sql`
   - `0007_paypal_subscription_events.sql`
   - `0008_doctor_public_profiles.sql`
   - `0009_doctor_reviews.sql`
2. Ejecutar migraciones en Supabase online antes de desplegar staging.
3. Confirmar que RLS está activo en tablas sensibles.
4. Confirmar que no existen policies anon amplias para pacientes, pagos, notas, consentimientos, firmas, bot logs o audit logs.
5. Crear o confirmar el usuario platform admin en `platform_admins`.
6. Configurar Supabase Auth Site URL con el dominio staging o el dominio temporal del hosting.
7. Agregar redirect URLs permitidas:
   - `https://TU-DOMINIO-DONWEB.com/auth/callback`
   - dominio temporal equivalente del hosting si aplica.
   - `http://localhost:3000/auth/callback` solo para local.
8. Confirmar que `NEXT_PUBLIC_SUPABASE_URL` apunta a la URL base `https://project-ref.supabase.co`, sin `/rest/v1/`.
9. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` solo está configurada como variable server-side del hosting.

No ejecutar acciones externas desde este repo durante esta preparación.

## PayPal Sandbox Checklist

Mantener `PAYPAL_ENV=sandbox`. No cambiar PayPal a live en staging.

1. Crear o confirmar producto de suscripción en PayPal sandbox.
2. Crear o confirmar planes sandbox para:
   - MedControl Básico.
   - MedControl Plus.
   - MedControl Pro.
3. Configurar variables:
   - `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_BASIC_PLAN_ID`
   - `PAYPAL_PLUS_PLAN_ID`
   - `PAYPAL_PRO_PLAN_ID`
4. Configurar webhook sandbox con URL pública:

```text
https://TU-DOMINIO-DONWEB.com/api/paypal/webhook
```

5. Guardar `PAYPAL_WEBHOOK_ID`.
6. Confirmar eventos requeridos por la implementación actual:
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - `PAYMENT.SALE.COMPLETED`
   - `PAYMENT.SALE.DENIED`
7. Confirmar que el webhook rechaza eventos sin verificación de firma.

## Hosting Checklist

1. Configurar DonWeb Cloud Server / CloudPanel / VPS como ruta recomendada, o hosting Node/cPanel solo si soporta procesos persistentes, SSR y webhooks.
2. Configurar Node.js `>=20.9.0`.
3. Configurar variables de entorno del apartado anterior.
4. Ejecutar build con `npm run build`.
5. Si el hosting requiere start command, usar `npm run start`.
6. Habilitar HTTPS.
7. Configurar dominio staging o dominio temporal.
8. Configurar `APP_BASE_URL` con ese dominio.
9. Actualizar Supabase Auth Site URL y redirect URLs con ese dominio.
10. Configurar PayPal webhook sandbox con ese dominio.

## Rutas de Smoke Test

Públicas:

| Ruta | Esperado |
| --- | --- |
| `/` | Landing responde en español. |
| `/#pricing` | Pricing visible con planes vigentes. |
| `/directorio` | Directorio público responde. |
| `/directorio/[slug]` | Perfil público responde si existe slug publicado. |
| `/login` | Form de login responde. |
| `/signup` | Form de signup responde. |

Protegidas:

| Ruta | Esperado sin sesión |
| --- | --- |
| `/dashboard` | Redirige a `/login`. |
| `/dashboard/members` | Redirige a `/login`. |
| `/dashboard/directory` | Redirige a `/login`. |
| `/dashboard/billing` | Redirige a `/login`. |
| `/onboarding` | Redirige a `/login`. |
| `/admin` | Redirige a `/login`. |
| `/admin/clinics` | Redirige a `/login`. |
| `/admin/doctors` | Redirige a `/login`. |
| `/admin/subscriptions` | Redirige a `/login`. |

Protegidas con sesión:

- `/dashboard` debe permitir acceso solo si el usuario completó onboarding y tiene membresía.
- `/dashboard` debe redirigir a `/onboarding` si falta clínica/membresía.
- `/admin` debe redirigir a `/dashboard` si el usuario no es platform admin.

APIs:

| Ruta | Esperado |
| --- | --- |
| `/api/paypal/subscription/approve` | Requiere sesión y onboarding completo. Valida plan y suscripción contra PayPal sandbox. |
| `/api/paypal/webhook` | Rechaza payloads inválidos o eventos sin firma verificada. Procesa eventos sandbox verificados. |

Consentimiento público:

| Ruta | Esperado |
| --- | --- |
| `/consent/sign/[token]` | Con `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false`, muestra página segura de no disponibilidad pública. |

## Mocks y Seguridad de Staging

Confirmar antes de publicar:

- El dashboard muestra la advertencia de ambiente de demostración.
- No se invita a usar datos reales.
- Los datos mock no se presentan como operación real.
- `/consent/sign/[token]` no muestra el flujo legal demo por defecto.
- Integraciones de calendario están marcadas como demo/proximamente.
- No se usan tokens reales de calendario.
- El botón/flujo PayPal sigue en sandbox.

## Qué NO Hacer en Staging

- No usar pacientes reales.
- No activar PayPal live.
- No activar consentimientos reales.
- No usar tokens reales de calendario.
- No usar credenciales productivas de Google/Twilio.
- No presentar staging como producción final.
- No cambiar planes, precios ni límites comerciales.
- No exponer `SUPABASE_SERVICE_ROLE_KEY` en cliente.

## Checklist Post-Deploy

1. Abrir `/` y validar landing.
2. Abrir `/#pricing` y validar precios/planes.
3. Probar `/login` y `/signup`.
4. Completar onboarding con usuario de prueba.
5. Validar acceso a `/dashboard`.
6. Validar `/dashboard/members`, `/dashboard/directory` y `/dashboard/billing`.
7. Validar que `/admin` bloquea usuarios no platform admin.
8. Validar que un platform admin puede entrar a `/admin`.
9. Probar PayPal sandbox con un plan.
10. Confirmar que PayPal webhook sandbox recibe y verifica eventos.
11. Confirmar que `/consent/sign/demo-token` no muestra firma demo con la flag apagada.
12. Confirmar que no hay datos reales ni secrets impresos en logs.

## Estado Recomendado

El repo queda listo a nivel técnico para deploy de staging si:

- `npm run lint` pasa.
- `npm run build` pasa.
- Supabase online tiene migraciones aplicadas.
- Variables de entorno están configuradas en hosting.
- PayPal sandbox tiene planes y webhook configurados.
- HTTPS está activo.
