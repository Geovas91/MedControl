# Instalacion PWA y seguridad

CliniControl ofrece una PWA minima para staging controlado. Es instalable en navegadores Chromium compatibles, pero no ofrece expedientes ni trabajo clinico sin conexion.

## Arquitectura

- `app/manifest.ts` genera `/manifest.webmanifest` con nombre CliniControl, inicio en `/dashboard`, modo `standalone`, idioma `es-MX` e iconos PNG.
- `components/pwa/service-worker-registration.tsx` registra `/sw.js` una sola vez cuando `NEXT_PUBLIC_PWA_ENABLED=true`.
- `components/pwa/install-app-button.tsx` conserva el evento `beforeinstallprompt` solamente en memoria y nunca muestra un control deshabilitado.
- `public/sw.js` tiene el cache versionado `clinicontrol-static-v1`; no hace reload forzado ni usa Background Sync o notificaciones push.
- `app/offline/page.tsx` es publico, no indexable y no contiene ni recupera datos previos.

El antecedente historico fue una implementacion PWA agregada al commit de rebranding `941d840` en una linea anterior que no forma parte de la base actual. Esta restauracion formaliza el mecanismo en el PR #35 y agrega el boton, las pruebas y la auditoria de cache.

## Cache permitido

El worker precarga solamente la pagina offline generica, manifest, favicon e iconos. En tiempo de ejecucion solo puede guardar activos same-origin de `/_next/static/`, `/icons/`, `/icon.svg` y `/manifest.webmanifest`, siempre que sean respuestas `basic`, exitosas, sin `Set-Cookie` y sin query string.

Las navegaciones siempre usan red. Cuando la red no esta disponible, reciben la pagina offline generica; no se guarda HTML de ninguna navegacion.

## Cache prohibido

Nunca se cachean ni se reponen desde cache:

- dashboard, admin, onboarding, pacientes, citas, pagos, notas, miembros o consentimientos;
- invitaciones y enlaces de firma con token;
- Auth, callbacks, APIs, RPC, health o readiness;
- respuestas con cookies, Authorization, `Set-Cookie`, query strings, respuestas opaque o no exitosas;
- solicitudes que no sean GET.

No se usa Cache Storage, IndexedDB o localStorage para sesiones, cookies, tokens ni datos clinicos. Al activar una nueva version se eliminan caches anteriores; la actualizacion se adopta en una navegacion posterior, sin recarga automatica.

## Instalacion

En Chrome o Edge compatibles, el boton interno aparece solo despues de que el navegador emite `beforeinstallprompt`. Tambien puede usarse el control de instalar del navegador. En Android, usa el menu de Chrome y selecciona instalar/agregar a pantalla principal.

Safari en iOS no emite `beforeinstallprompt`. En ese caso, abre el sitio en Safari y usa **Compartir -> Agregar a pantalla de inicio**. Se entregan `apple-touch-icon`, nombre y metadata standalone; esto no implica un comportamiento identico al de Chrome.

## Prueba local de produccion

La PWA no se registra por defecto en desarrollo. Para una prueba local explicita, en PowerShell:

```powershell
$env:NEXT_PUBLIC_PWA_ENABLED="true"
npm run build
npm run start -- --port 3100
```

Abre `http://localhost:3100`; localhost es un contexto seguro valido para workers. En otra consola, con la misma variable:

```powershell
$env:NEXT_PUBLIC_PWA_ENABLED="true"
npm run test:pwa
```

`test:pwa` usa el build de produccion local, valida manifest, iconos, headers, registro y los estados del boton. Antes de una nueva prueba, si hay un worker previo: Chrome DevTools -> Application -> Service Workers -> Unregister; despues Application -> Storage -> Clear site data.

## QA y privacidad

La prueba manual pendiente con sesion demo debe abrir un expediente, cerrar la pestana, poner el navegador offline y volver a intentar pacientes, citas, notas, pagos y enlaces de consentimiento. El resultado aceptable es error de red o la pagina offline generica, nunca contenido clinico previo. No usar datos reales.

Para staging/produccion aun se requiere HTTPS, configuracion de hosting y una revision manual de instalacion en Chrome, Edge y Safari iOS. DonWeb no se configura en este PR. El rollback consiste en desactivar `NEXT_PUBLIC_PWA_ENABLED`, desplegar y, si procede, borrar el cache `clinicontrol-static-v1` desde DevTools.
