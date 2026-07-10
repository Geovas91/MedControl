# CliniControl DonWeb CloudPanel Runbook

Guía operativa para desplegar CliniControl desde GitHub en DonWeb Cloud Server, CloudPanel o un VPS equivalente, usando Supabase online y PayPal sandbox. Este ambiente es staging controlado, no producción abierta.

## 1. Requisitos Previos

- Cuenta DonWeb activa.
- Cloud Server, CloudPanel o VPS con soporte para procesos Node.js persistentes.
- Dominio o subdominio de staging, por ejemplo `https://TU-DOMINIO-DONWEB.com`.
- Repositorio GitHub actualizado: `https://github.com/Geovas91/MedControl.git`.
- Proyecto Supabase online.
- Cuenta y aplicación PayPal sandbox.
- Node.js `>=20.9.0`.
- npm y Git instalados.
- PM2 si el servidor no administra el proceso Node automáticamente.
- HTTPS activo antes de probar Auth o el webhook PayPal.

Comprueba el runtime:

```bash
node -v
npm -v
git --version
```

## 2. Crear Servidor o App en DonWeb

Las pantallas pueden variar entre CloudPanel, Cloud Server, cPanel y VPS. La configuración debe lograr lo siguiente:

1. Crear un Cloud Server o VPS Linux en DonWeb.
2. Acceder por SSH o desde la terminal de CloudPanel.
3. Crear un sitio o aplicación Node.js para CliniControl.
4. Asociar el dominio o subdominio de staging.
5. Activar SSL/HTTPS.
6. Definir una carpeta de aplicación, por ejemplo `/home/cloudpanel/htdocs/clinicontrol`.
7. Confirmar que el usuario de despliegue puede ejecutar Git, Node y npm en esa carpeta.
8. Reservar o identificar el puerto interno de la app. Next.js usa `3000` por defecto, pero CloudPanel puede asignar otro.

No publiques todavía el sitio como producción ni cargues datos reales de pacientes.

## 3. Clonar el Repo desde GitHub

Desde la carpeta donde vivirá la aplicación:

```bash
git clone https://github.com/Geovas91/MedControl.git CliniControl
cd CliniControl
git checkout main
git pull origin main
```

Para un repositorio privado, configura previamente una deploy key, token de acceso o integración Git autorizada. No guardes tokens dentro del repo.

## 4. Instalar Dependencias y Compilar

Confirma que Node cumple el requisito y ejecuta:

```bash
node -v
npm -v
npm install
npm run lint
npm run build
```

La versión de Node debe ser `>=20.9.0`. El repo incluye `.nvmrc` con `20.9.0`.

Las variables `NEXT_PUBLIC_*` deben estar configuradas antes de `npm run build`, porque Next.js incorpora valores públicos en el bundle durante la compilación.

## 5. Variables de Entorno

Usa el administrador de variables de CloudPanel/DonWeb, variables de PM2 o un archivo `.env.production` accesible solo por el usuario del proceso. No pongas valores reales en GitHub.

Ejemplo sin valores reales:

```bash
# Públicas
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_DEFAULT_LOCALE=es
NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false
NEXT_PUBLIC_PAYPAL_CLIENT_ID=

# Privadas / server-side
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

# Runtime Node, si el panel no asigna puerto
PORT=3000
```

Reglas obligatorias:

- Nunca subir `.env.production`, `.env.staging` o `.env.local` a GitHub.
- Nunca agregar el prefijo `NEXT_PUBLIC` a `SUPABASE_SERVICE_ROLE_KEY`.
- Nunca agregar el prefijo `NEXT_PUBLIC` a `PAYPAL_CLIENT_SECRET`.
- `SUPABASE_SERVICE_ROLE_KEY` solo puede existir en el servidor.
- `PAYPAL_CLIENT_SECRET` solo puede existir en el servidor.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` es la key pública preferida; `NEXT_PUBLIC_SUPABASE_ANON_KEY` es fallback.
- `NEXT_PUBLIC_SUPABASE_URL` debe ser la URL base de Supabase, sin `/rest/v1/`.
- `APP_BASE_URL` debe coincidir exactamente con el dominio HTTPS de DonWeb.
- `APP_ENV=staging` y `NEXT_PUBLIC_DEFAULT_LOCALE=es` mantienen staging en español y con el dominio correcto.
- Si cambias una variable `NEXT_PUBLIC_*`, vuelve a ejecutar `npm run build` y reinicia la app.

Protege un archivo creado manualmente en el servidor:

```bash
chmod 600 .env.production
```

## 6. Arranque con PM2

Si DonWeb o CloudPanel no administra el proceso Node, instala PM2:

```bash
npm install -g pm2
pm2 start npm --name clinicontrol-staging -- start
pm2 save
pm2 startup
```

`pm2 startup` mostrará un comando adicional que normalmente debe ejecutarse con permisos administrativos. Ejecútalo y vuelve a usar `pm2 save`.

Comandos útiles:

```bash
pm2 status
pm2 logs clinicontrol-staging
pm2 restart clinicontrol-staging
pm2 stop clinicontrol-staging
```

Si cambias código o variables:

```bash
git checkout main
git pull origin main
npm install
npm run lint
npm run build
pm2 restart clinicontrol-staging --update-env
```

## 7. Reverse Proxy y CloudPanel

- El dominio HTTPS debe apuntar al proceso Node de Next.js.
- Next.js escucha en `3000` por defecto; usa el puerto asignado por CloudPanel si es diferente.
- Configura Nginx/CloudPanel como reverse proxy hacia `http://127.0.0.1:PUERTO`.
- No expongas directamente el puerto Node a Internet si el reverse proxy ya termina HTTPS.
- Conserva los headers `Host`, `X-Forwarded-For`, `X-Forwarded-Proto` y `X-Forwarded-Host`.
- Asegura que `/api/paypal/webhook` llegue al mismo proceso Next.js sin cache ni redirecciones inesperadas.

Esquema esperado:

```text
Internet HTTPS -> dominio DonWeb -> Nginx/CloudPanel -> 127.0.0.1:3000 -> Next.js
```

No hardcodees `3000` si DonWeb asigna automáticamente otro puerto.

## 8. Supabase Después del Deploy

En Supabase Dashboard:

1. Configura Site URL:

```text
https://TU-DOMINIO-DONWEB.com
```

2. Agrega Redirect URLs:

```text
https://TU-DOMINIO-DONWEB.com/auth/callback
http://localhost:3000/auth/callback
```

3. Confirma que las migraciones `0001` a `0009` estén aplicadas en Supabase online.
4. Confirma RLS activo en las tablas sensibles.
5. Confirma el platform admin requerido en `platform_admins`.
6. Prueba login, callback, onboarding y cierre de sesión con un usuario ficticio de staging.

## 9. PayPal Sandbox Después del Deploy

Mantén:

```bash
PAYPAL_ENV=sandbox
```

En PayPal Developer Dashboard:

1. Confirma productos y planes sandbox para Básico, Plus y Pro.
2. Copia sus IDs a `PAYPAL_BASIC_PLAN_ID`, `PAYPAL_PLUS_PLAN_ID` y `PAYPAL_PRO_PLAN_ID`.
3. Configura el webhook sandbox:

```text
https://TU-DOMINIO-DONWEB.com/api/paypal/webhook
```

4. Copia el ID del webhook a `PAYPAL_WEBHOOK_ID` en el servidor.
5. Reinicia la app con las variables actualizadas.
6. Confirma que PayPal sandbox apunta al dominio HTTPS real de DonWeb.
7. Verifica eventos de suscripción y pago soportados por la implementación actual.

No cambies `PAYPAL_ENV` a `live` en staging.

## 10. Smoke Test Post-Deploy

Públicas:

- [ ] `/`
- [ ] `/#pricing`
- [ ] `/directorio`
- [ ] `/login`
- [ ] `/signup`

Protegidas:

- [ ] `/dashboard` redirige a login sin sesión.
- [ ] `/dashboard/members`
- [ ] `/dashboard/directory`
- [ ] `/dashboard/billing`
- [ ] `/onboarding`

Admin:

- [ ] `/admin` bloquea usuarios no platform admin.
- [ ] `/admin/clinics`
- [ ] `/admin/doctors`
- [ ] `/admin/subscriptions`

APIs:

- [ ] `/api/paypal/subscription/approve` exige sesión y onboarding.
- [ ] `/api/paypal/webhook` rechaza payloads o firmas inválidas.

Consentimiento:

- [ ] `/consent/sign/demo-token` muestra la página segura con `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false`.

Validaciones generales:

- [ ] HTTPS activo sin errores de certificado.
- [ ] Login y callback Supabase funcionan.
- [ ] Onboarding funciona con datos ficticios.
- [ ] Directorio muestra únicamente perfiles publicados.
- [ ] PayPal sandbox carga.
- [ ] No hay datos reales ni secrets en logs.

## 11. Troubleshooting

### Build falla por versión de Node

Ejecuta `node -v`. Instala o selecciona Node `>=20.9.0` y repite `npm install && npm run build`.

### Faltan variables

Revisa el administrador de variables del proceso y `.env.example`. Las variables públicas deben existir antes del build. Reinicia PM2 con `--update-env`.

### APP_BASE_URL sigue en localhost

Configura `APP_BASE_URL=https://TU-DOMINIO-DONWEB.com`, recompila y reinicia el proceso.

### Supabase Auth redirige a una URL incorrecta

Revisa Site URL, Redirect URLs y `APP_BASE_URL`. La URL debe usar HTTPS y coincidir con el dominio real.

### PayPal webhook no usa HTTPS

Activa SSL y registra de nuevo la URL HTTPS en PayPal sandbox. No uses una URL HTTP pública.

### PAYPAL_WEBHOOK_ID incorrecto

Confirma que el ID corresponde exactamente al webhook sandbox configurado para el dominio actual.

### Service role expuesta

Retira inmediatamente la variable del cliente, rota la key en Supabase y vuelve a desplegar. Nunca uses prefijo `NEXT_PUBLIC`.

### Dominio o puerto no conecta

Confirma DNS, firewall, puerto del proceso, estado PM2 y reverse proxy. Ejecuta `pm2 status` y revisa logs.

### PM2 no reinicia después del reboot

Ejecuta el comando generado por `pm2 startup`, después `pm2 save`, y reinicia el servidor para comprobarlo.

### SSL no está activo

Confirma DNS resuelto, certificado emitido y virtual host correcto en CloudPanel/Nginx.

### Webhook PayPal responde 404 o 500

- Confirma la ruta exacta `/api/paypal/webhook`.
- Revisa `pm2 logs clinicontrol-staging` sin compartir secrets.
- Confirma `PAYPAL_WEBHOOK_ID`, credenciales sandbox y migración `0007_paypal_subscription_events.sql`.
- Confirma que Nginx no cachea ni bloquea solicitudes POST.

## 12. Seguridad

- No usar pacientes reales en staging.
- No activar PayPal live.
- No activar consentimientos reales.
- No guardar tokens reales de calendario.
- No subir archivos `.env*` con secrets.
- No compartir logs que contengan secrets o datos personales.
- Verificar `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false` antes del build.
- Mantener `.env.local`, `.env.production` y `.env.staging` fuera de Git.
- Restringir permisos SSH, archivos env y acceso al panel DonWeb.

## 13. Validación Final

Antes de considerar el deploy listo:

```bash
npm run lint
npm run build
```

Después del deploy, completa todo el smoke test y revisa logs de PM2/CloudPanel.
