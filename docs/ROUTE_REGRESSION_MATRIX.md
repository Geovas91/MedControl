# Route regression matrix

Results below distinguish executed checks from environmental/manual work. `Pass` means the named automated test ran; it does not imply all authenticated workflows were exercised.

| Ruta | Rol/estado | Viewport | Navegador | Prueba | Resultado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Público | 320, 360, 390, 430, 768, 1280, 1440 | Chromium local | Carga, `main`, consola y `scrollWidth <= clientWidth` | Pass | Playwright, sin credenciales ni datos reales |
| `/login` | Público | 320, 360, 390, 430, 768, 1280, 1440 | Chromium local | Carga, consola y overflow | Pass | Playwright |
| `/register` | Público | 320, 360, 390, 430, 768, 1280, 1440 | Chromium local | Carga, consola y overflow | Pass | Playwright |
| `/forgot-password` | Público | 320, 360, 390, 430, 768, 1280, 1440 | Chromium local | Carga, consola y overflow | Pass | Playwright |
| `/onboarding` | Sin sesión | 1280 | Chromium local | Redirect seguro a login | Pass | Playwright; flujo autenticado pendiente |
| `/dashboard` | Sin sesión | 1280 | Chromium local | Redirect seguro a login | Pass | Playwright; métricas reales pendientes |
| `/invite/token-invalido` | Público | 1280 | Chromium local | Contenido genérico, sin correo expuesto | Pass | Playwright |
| `/api/health` | Público | N/A | Request local | HTTP 200 | Pass | Playwright request |
| `/api/ready` | Público | N/A | Request local | HTTP 200 o 503 según configuración local | Pass | Playwright request; no se cambió configuración |
| `/ruta-inexistente` | Público | 1280 | Chromium local | HTTP 404 y heading de not found | Pass | Playwright |
| `/`, `/login` | Público | 1280 | Chromium local | Axe WCAG 2 A/AA, sin severidad serious/critical | Pass | Auditoría automática; no afirma WCAG completa |
| `/`, `/login` | Público | 1440 / 390 | Chromium local | Capturas locales sin sesión ni datos sensibles | Pass | Artefactos efímeros de Playwright, ignorados por Git |
| `/dashboard` | Miembro demo | 320, 390 | Chromium/Edge | Drawer, topbar, sidebar, safe area y retorno de foco | Blocked | No se usó sesión demo durante la ejecución pública |
| `/dashboard/patients` y detalle | Miembro demo | 320–1440 | Chromium/Edge | Listado, búsqueda, filtro, paginación, crear/editar | Blocked | Requiere sesión demo y datos de prueba autorizados |
| `/dashboard/appointments` y detalle | Miembro demo | 320–1440 | Chromium/Edge | Agenda, filtros, crear, editar, estados | Blocked | Requiere sesión demo |
| `/dashboard/payments` | Miembro demo | 320–1440 | Chromium/Edge | Pagos clínicos, importes y mobile | Blocked | Requiere sesión demo |
| Notas, expediente y consentimientos | Miembro demo/público | 320–1440 | Chromium/Edge | Permisos, firma, inmutabilidad y superficies sólidas | Blocked | No se usaron datos clínicos ni tokens de firma |
| Nota, consentimiento, expediente y pago | Datos demo | Print preview | Chromium/Edge/Firefox | Shell/acciones ocultas; contenido y firma conservados | Blocked | Revisión manual de impresión pendiente |
| Todas las rutas visuales | Público/autenticado | 1920, Firefox, WebKit y dispositivos físicos | Firefox/WebKit/dispositivo | Layout, contraste, safe area, glass fallback | Blocked | Sólo Chromium local fue ejecutado |

## Rollback

El PR es visual y se revierte por commit. No contiene migraciones, cambios de datos, APIs, RLS, RPCs, PayPal, pagos ni lógica clínica. No revertir los PR funcionales 18-34 para deshacer un problema visual.

## Estado de QA

Pre-staging QA foundation and automated static checks completed; authenticated, cross-browser, device and print execution remains pending.
