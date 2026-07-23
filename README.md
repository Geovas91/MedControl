# CliniControl

CliniControl es una aplicación SaaS para médicos y clínicas pequeñas en México. Este repositorio está preparado para staging controlado y una beta privada sólo después de completar los bloqueantes documentados; no está aprobado para uso abierto con pacientes reales.

## Estado Actual

- Next.js 16 App Router, React 19, TypeScript y Tailwind CSS.
- Supabase Auth con `@supabase/ssr`, callback PKCE y dashboard protegido por onboarding/membresía.
- Admin interno separado en `/admin`.
- Planes comerciales centralizados en `config/plans.ts`.
- PayPal está preparado en modo sandbox para suscripciones, pero el cobro real sigue limitado a flujos controlados de prueba.
- Directorio público y reseñas por estrellas están en fase de scaffolding. No se permiten comentarios escritos en reseñas.
- Varios módulos del dashboard todavía muestran datos de ejemplo.
- La ruta principal de staging es GitHub + DonWeb + Supabase online + PayPal sandbox.

## Módulos

- Landing pública con planes, features y CTA comercial.
- Dashboard clínico con navegación responsive.
- Pacientes, citas, pagos, notas médicas, consentimientos, miembros, directorio, facturación, bot e integraciones.
- Gestión de miembros/médicos por clínica con límites por plan.
- Supabase SQL migrations, RLS y tipos base para clínicas, miembros, pacientes, citas, pagos, notas, consentimientos, integraciones, bot y auditoría.

## Seguridad y Staging

- No uses datos reales de pacientes en staging.
- CliniControl no reemplaza el juicio clínico, diagnóstico, tratamiento ni revisión profesional.
- El flujo público de firma de consentimientos está deshabilitado por defecto y solo puede activarse para demo con `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=true`.
- Las integraciones de calendario son demo/proximamente. Antes de producción, los tokens de calendario deben almacenarse cifrados.
- No subas credenciales reales al repositorio.
- `.env.local` debe permanecer ignorado por Git.
- `SUPABASE_SERVICE_ROLE_KEY` es server-only y nunca debe usarse en Client Components.
- Guía DonWeb staging: `docs/DONWEB_STAGING.md`.
- Runbook operativo DonWeb CloudPanel: `docs/DONWEB_CLOUDPANEL_RUNBOOK.md`.
- Guía de deploy staging: `docs/STAGING_DEPLOY.md`.
- Invitaciones de miembros: `docs/CLINIC_MEMBER_INVITATIONS.md`.
- Plan de ejecución DonWeb: `docs/DONWEB_STAGING_EXECUTION_PLAN.md`.
- Preparación de onboarding/producción: `docs/CLINIC_ONBOARDING_AND_MEMBERS.md`, `docs/SUBSCRIPTION_ENTITLEMENTS.md`, `docs/PRODUCTION_READINESS_CHECKLIST.md` y `docs/DONWEB_DEPLOYMENT.md`.

## Pendiente Antes de Producción

- Política de privacidad.
- Términos y condiciones.
- Aviso de privacidad para México.
- Revisión legal de consentimiento informado y firma.
- Validación final de RLS contra el proyecto Supabase online.
- Cifrado de tokens de calendario y proveedores externos.
- Revisión de seguridad del flujo PayPal en producción.
- Revisión manual de todos los textos visibles para evitar promesas clínicas indebidas.

## Variables de Entorno

Usa `.env.example` como plantilla. No agregues valores reales a archivos versionados.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_ENV=staging
APP_BASE_URL=
APP_STAGING_URL=
APP_PRODUCTION_URL=
NEXT_PUBLIC_DEFAULT_LOCALE=es
NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false
NEXT_PUBLIC_SITE_URL=
EMAIL_PROVIDER=
EMAIL_FROM=
EMAIL_REQUIRED=false
```

La entrega de correo aún no está implementada. `EMAIL_REQUIRED=true` mantiene readiness en `503` hasta que exista y se valide un proveedor real; configurar variables por sí solo no habilita correo.

También existen variables para PayPal sandbox, Google Calendar y proveedores de mensajería. Mantén `NEXT_PUBLIC_SUPABASE_URL` como URL base del proyecto, sin `/rest/v1/`.

## Setup Local

Requiere Node.js 20.9 o superior.

```bash
npm install
npm run check:supabase
npm run dev
```

Abrir:

```text
http://localhost:3000
```

Validar:

```bash
npm run lint
npm run build
```

## Estructura

```text
app/
  page.tsx                    Landing pública
  (auth)/                     Login/signup/register
  admin/                      Portal admin interno
  dashboard/                  Dashboard y módulos clínicos
  consent/sign/[token]/       Firma demo protegida por flag
components/
  dashboard/                  Shell y componentes de dashboard
  ui/                         Componentes reutilizables
config/
  plans.ts                    Planes comerciales centralizados
  contact.ts                  Contacto comercial centralizado
lib/
  supabase/                   Clientes SSR, config y acceso a datos
  mock-*.ts                   Datos demo ficticios
supabase/
  migrations/                 Esquema SQL y RLS
types/
  database.ts                 Tipos Supabase manuales
```
