# DonWeb Staging Deploy

Esta guía describe cómo preparar CliniControl para staging público controlado en DonWeb usando GitHub, Supabase online y PayPal sandbox. No es una guía de producción abierta.

## Ruta Principal

La ruta principal documentada para CliniControl es:

```text
GitHub -> DonWeb Cloud Server / CloudPanel / VPS -> Supabase online -> PayPal sandbox
```

CliniControl usa Next.js 16 con App Router, SSR, route handlers, proxy de sesión Supabase y webhook de PayPal. Por eso la opción recomendada en DonWeb es un servidor Node tradicional donde puedas ejecutar procesos persistentes.

## Opción A Recomendada: DonWeb Cloud Server / CloudPanel / VPS

Recomendada para staging porque permite:

- Correr `npm install`, `npm run build` y `npm run start`.
- Mantener un proceso Node persistente para Next.js SSR.
- Configurar variables privadas server-side.
- Configurar HTTPS con el dominio de staging.
- Exponer route handlers como `/api/paypal/webhook`.
- Revisar logs del servidor y reiniciar la app después de cambios.

Esta opción es la más compatible con:

- Dashboard protegido con SSR.
- Supabase Auth y Supabase SSR helpers.
- Admin protegido por `platform_admins`.
- PayPal sandbox y webhook público.
- Directorio público y rutas dinámicas.

## Opción B Alternativa: Hosting Node.js / cPanel

Usar solo si el plan contratado en DonWeb soporta correctamente:

- Node.js moderno compatible con `>=20.9.0`.
- App Node administrada o proceso persistente.
- Variables de entorno públicas y privadas.
- `npm run build`.
- `npm run start`.
- Rutas SSR de Next.js.
- Route handlers para APIs.
- Webhooks públicos con HTTPS.

Si el plan cPanel/hosting Node no soporta bien procesos persistentes, SSR de Next.js o webhooks, no es la opción recomendada para CliniControl.

## Docker

El proyecto no incluye Dockerfile en esta etapa.

Docker puede ser útil en DonWeb Cloud Server o VPS para aislar runtime, dependencias y reinicios, pero no es requisito para este staging. Para esta fase, priorizar deploy Node tradicional si DonWeb lo permite.

## Compatibilidad del Proyecto

Revisión del repo:

- `package.json` incluye `build`, `start`, `lint` y `check:supabase`.
- `package.json` incluye `engines.node` con `>=20.9.0`.
- `.nvmrc` fija `20.9.0`.
- `next.config.mjs` no requiere configuración especial ni Vercel.
- `proxy.ts` usa Supabase SSR helpers para refresco de sesión.
- Route handlers existen para PayPal approve y webhook.
- El webhook de PayPal puede operar en servidor Node tradicional.
- No se requiere filesystem persistente para funciones críticas de la app.
- No se requiere Vercel para operar.

Comandos:

```bash
npm install
npm run build
npm run start
```

Node recomendado:

```text
>=20.9.0
```

Build command:

```bash
npm run build
```

Start command:

```bash
npm run start
```

## Variables de Entorno en DonWeb

Configurar en el panel/app/servidor de DonWeb. No poner valores reales en documentación ni archivos versionados. No subir `.env.local` a GitHub.

### Públicas

| Variable | Obligatoria | Nota |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL base de Supabase, sin `/rest/v1/`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí, salvo que se use anon fallback | Key pública preferida. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Solo fallback | Usar si el proyecto todavía usa anon key legacy. |
| `NEXT_PUBLIC_ENABLE_DEMO_CONSENT` | Sí | Mantener `false` en staging público controlado. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Sí para PayPal sandbox | Client ID público sandbox para cargar el SDK de PayPal. |

### Privadas / Server-Side

| Variable | Obligatoria | Nota |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí para admin/webhooks/server admin client | Nunca debe tener prefijo `NEXT_PUBLIC`. |
| `APP_ENV` | Sí | Usar `staging`. |
| `APP_BASE_URL` | Sí | Dominio HTTPS de DonWeb, por ejemplo `https://TU-DOMINIO-DONWEB.com`. |
| `APP_STAGING_URL` | Recomendado | Fallback del dominio DonWeb staging. |
| `APP_PRODUCTION_URL` | No en staging | Dominio futuro de producción. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | Sí | Mantener `es` durante staging. |
| `PAYPAL_CLIENT_ID` | Sí para PayPal sandbox | Server-side. |
| `PAYPAL_CLIENT_SECRET` | Sí para PayPal sandbox | Nunca debe tener prefijo `NEXT_PUBLIC`. |
| `PAYPAL_ENV` | Sí | Debe ser `sandbox`. |
| `PAYPAL_WEBHOOK_ID` | Sí para webhook | ID del webhook sandbox en PayPal. |
| `PAYPAL_BASIC_PLAN_ID` | Sí para probar Básico | Plan ID sandbox. |
| `PAYPAL_PLUS_PLAN_ID` | Sí para probar Plus | Plan ID sandbox. |
| `PAYPAL_PRO_PLAN_ID` | Sí para probar Pro | Plan ID sandbox. |

Ejemplo sin secretos:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_DEFAULT_LOCALE=es
NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENV=staging
APP_BASE_URL=https://TU-DOMINIO-DONWEB.com
APP_STAGING_URL=https://TU-DOMINIO-DONWEB.com
APP_PRODUCTION_URL=https://TU-DOMINIO-PRODUCCION.com
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=sandbox
PAYPAL_WEBHOOK_ID=
PAYPAL_BASIC_PLAN_ID=
PAYPAL_PLUS_PLAN_ID=
PAYPAL_PRO_PLAN_ID=
```

## Flujo GitHub a DonWeb

Los pasos exactos pueden variar entre CloudPanel, cPanel, VPS, app Node administrada o Docker. Usar esta secuencia como guía:

1. Confirmar que el repositorio principal está en GitHub.
2. Crear servidor, Cloud Server, VPS o app Node en DonWeb.
3. Configurar acceso Git o subir el código desde GitHub.
4. Seleccionar Node.js `>=20.9.0`.
5. Instalar dependencias:

```bash
npm install
```

6. Configurar variables de entorno públicas y privadas en DonWeb.
7. Ejecutar build:

```bash
npm run build
```

8. Configurar start command:

```bash
npm run start
```

9. Configurar dominio staging.
10. Activar HTTPS.
11. Configurar `APP_BASE_URL` con el dominio HTTPS de DonWeb.
12. Reiniciar la app después de cambios.
13. Revisar logs del servidor.

## Supabase para Dominio DonWeb

Antes de abrir staging:

1. Ejecutar migraciones `0001` a `0009` en Supabase online.
2. Confirmar RLS activo.
3. Confirmar que no existen policies anon amplias para datos sensibles.
4. Crear o confirmar usuario platform admin en `platform_admins`.
5. Configurar Supabase Auth Site URL con el dominio HTTPS de DonWeb:

```text
https://TU-DOMINIO-DONWEB.com
```

6. Configurar redirect URLs:

```text
https://TU-DOMINIO-DONWEB.com/auth/callback
http://localhost:3000/auth/callback
```

7. Confirmar que `NEXT_PUBLIC_SUPABASE_URL` usa URL base de Supabase sin `/rest/v1/`.
8. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` solo está en variables server-side de DonWeb.

## PayPal Sandbox para Dominio DonWeb

Mantener `PAYPAL_ENV=sandbox`.

1. Crear o confirmar productos/planes PayPal sandbox:
   - Básico.
   - Plus.
   - Pro.
2. Configurar:
   - `PAYPAL_BASIC_PLAN_ID`
   - `PAYPAL_PLUS_PLAN_ID`
   - `PAYPAL_PRO_PLAN_ID`
3. Configurar webhook sandbox con URL pública HTTPS:

```text
https://TU-DOMINIO-DONWEB.com/api/paypal/webhook
```

4. Copiar `PAYPAL_WEBHOOK_ID` a variables privadas del servidor DonWeb.
5. Confirmar que PayPal sandbox apunta al dominio HTTPS real de DonWeb.
6. Confirmar eventos:
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - `PAYMENT.SALE.COMPLETED`
   - `PAYMENT.SALE.DENIED`

## Checklist Post-Deploy DonWeb

Públicas:

- `/`
- `/#pricing`
- `/directorio`
- `/login`
- `/signup`

Protegidas:

- `/dashboard`
- `/dashboard/members`
- `/dashboard/directory`
- `/dashboard/billing`
- `/onboarding`

Admin:

- `/admin`
- `/admin/clinics`
- `/admin/doctors`
- `/admin/subscriptions`

APIs:

- `/api/paypal/subscription/approve`
- `/api/paypal/webhook`

Consentimiento:

- `/consent/sign/demo-token` debe mostrar la página segura si `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false`.

Validar:

- HTTPS activo.
- Login funciona.
- Onboarding funciona.
- Dashboard bloquea usuarios sin sesión.
- Admin bloquea usuarios no admin.
- Directorio muestra solo perfiles publicados.
- PayPal sandbox carga.
- Webhook no acepta eventos sin firma válida.
- No hay datos reales de pacientes.
- No hay secrets impresos en logs.

## Qué No Hacer en Staging

- No usar pacientes reales.
- No activar PayPal live.
- No activar consentimientos reales.
- No usar tokens reales de calendario.
- No cambiar planes, precios ni límites.
- No exponer secrets.
- No subir `.env.local` a GitHub.
