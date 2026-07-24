# Pre-staging full QA

## Alcance

Esta lista verifica el PR visual sin usar credenciales reales, datos reales ni Supabase remoto. Registrar resultado, viewport y observación en `ROUTE_REGRESSION_MATRIX.md`.

## Automatizado

- [ ] `npm ci`
- [ ] `npm run test:pre-staging`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] Si existe PostgreSQL local: `supabase db lint --local`

## Funcional y seguridad

- [ ] Auth: login correcto/incorrecto, logout, registro normal e invitado, recuperación, reset, `next` seguro y redirects externos rechazados.
- [ ] Onboarding: owner, clínica, trial de 30 días, aceptación legal e idempotencia.
- [ ] Tenant: selector, cookie, cambio de clínica y aislamiento de rutas.
- [ ] Pacientes: listar, buscar, filtrar, crear, editar, detalle y aislamiento.
- [ ] Citas: agenda, crear, editar, detalle, estados y acciones permitidas.
- [ ] Pagos: listar, crear y relación con paciente/cita; sin tocar facturación SaaS.
- [ ] Expediente/notas: roles, draft, edición, finalización, inmutabilidad y acceso assistant.
- [ ] Consentimientos: crear, token inválido/expirado, firma, consumo, snapshot e impresión.
- [ ] Plantillas: sistema, especialidad, clínica, CRUD y tenant.
- [ ] Miembros: invitar, rotar, revocar, aceptar, límites y estados de entrega sent/failed/disabled/delivery_unknown.
- [ ] Entitlements: active, trial válido/vencido/nulo, past_due, inactive, cancelled, faltante y error temporal.
- [ ] Health/readiness: health, disabled, ready, required_unavailable y fallo de base fail-closed.
- [ ] Seguridad: RLS inter-tenant, tokens no registrados, no datos clínicos en URL/metadata/cache y no `service_role` en navegador.

## Visual, responsive y accesibilidad

- [ ] Revisar landing, login, register, onboarding, dashboard, agenda, pacientes, detalle, pagos, notas, consentimientos, plantillas, miembros, settings, invite, 404 y error en 320/360/390/430/768/1024/1280/1440/1920 px.
- [ ] Confirmar ausencia de overflow horizontal, texto cortado, botones fuera de viewport, navegación tapada o footer sobre contenido.
- [ ] Confirmar contraste, foco, teclado, targets táctiles, labels, aria-live/expanded/current, headings y zoom 200%.
- [ ] Confirmar que glass se limita a navegación, toolbar y paneles no clínicos; revisar fallback sin `backdrop-filter`.
- [ ] Revisar impresión de nota, consentimiento y expediente: sin navegación/glass/botones, firma visible y sin cortes.
- [ ] Capturas locales sin datos sensibles: landing desktop/móvil, dashboard desktop/móvil, expediente desktop, agenda móvil, login y miembros.
- [ ] Drawer a 320/390 px: Enter/Espacio abre, foco entra, Tab/Shift+Tab no escapan, Escape/backdrop/cambio de ruta cierran, body no scroll y el foco regresa al control de origen.
- [ ] Navegación inferior: safe area de iPhone y Android, formularios/mensajes no quedan tapados y “Más” abre el drawer modal correcto.
- [ ] Print preview: nota clínica, consentimiento firmado, expediente y pago conservan encabezados internos, firma, identidad y badges importantes como texto; sólo shell/acciones desaparecen.
- [ ] Overflow: en landing, login, dashboard, pacientes, agenda, pagos y miembros a 320/360/390 px comprobar `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.

## Estado de ejecución

La base de QA pre-staging y los checks estáticos automatizados están completados. La ejecución autenticada, cross-browser, en dispositivos físicos y print preview continúa pendiente y debe registrarse en la matriz; esta lista no afirma QA completo.
