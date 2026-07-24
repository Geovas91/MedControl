# Checklist de readiness

## Bloqueantes para staging

- [ ] `npm run build` aprobado con variables de staging.
- [ ] Variables obligatorias configuradas y sin secretos versionados.
- [ ] Migraciones revisadas y aplicadas por operador autorizado.
- [ ] `/api/health` y `/api/ready` responden correctamente.
- [ ] Auth callback y tenant isolation verificados.
- [ ] HTTPS y proxy inverso configurados.
- [ ] PWA validada en build productivo: manifest, iconos, service worker e instalación Chrome/Edge; `NEXT_PUBLIC_PWA_ENABLED=true` sólo después de verificar la política de cache.
- [ ] Privacidad offline PWA validada con demo: ninguna ruta clínica, invitación o firma muestra contenido cacheado.
- [ ] No se ejecutaron seeds demo.

## Bloqueantes para beta privada

- [ ] Onboarding, trial de 30 días, owner y aceptaciones versionadas verificados.
- [ ] Invitaciones seguras probadas: crear, rotar, revocar, aceptar con el correo exacto y rechazar acceso REST directo.
- [ ] Resend configurado con dominio verificado, `APP_BASE_URL` HTTPS, pruebas de sent/failed/disabled/delivery_unknown y auditoría segura antes de activar `EMAIL_REQUIRED=true`.
- [ ] `npm run audit:server-only` aprobado; `SUPABASE_SERVICE_ROLE_KEY` permanece sólo en el proceso servidor y los navegadores no pueden registrar resultados de entrega.
- [ ] Recuperación de contraseña probada.
- [ ] Guardas de suscripción y límites probadas para `active`, trial futuro/igual a ahora/vencido/nulo, `past_due`, `inactive`, `cancelled` y error temporal.
- [ ] Términos y aviso de privacidad publicados y revisados.
- [ ] Backups y smoke test verificados.

## Bloqueantes para lanzamiento público

- [ ] Cobros productivos, cancelaciones y reembolsos revisados.
- [ ] Soporte, monitoreo y alertas operativos.
- [ ] Revisión legal y de seguridad completada.
- [ ] Safari iOS probado mediante Compartir -> Agregar a pantalla de inicio; no se asume `beforeinstallprompt`.
- [ ] Plan de recuperación ante desastre, exportación y retención aprobado.
