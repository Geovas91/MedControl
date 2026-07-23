# Checklist de readiness

## Bloqueantes para staging

- [ ] `npm run build` aprobado con variables de staging.
- [ ] Variables obligatorias configuradas y sin secretos versionados.
- [ ] Migraciones revisadas y aplicadas por operador autorizado.
- [ ] `/api/health` y `/api/ready` responden correctamente.
- [ ] Auth callback y tenant isolation verificados.
- [ ] HTTPS y proxy inverso configurados.
- [ ] No se ejecutaron seeds demo.

## Bloqueantes para beta privada

- [ ] Onboarding y owner verificados.
- [ ] Invitaciones seguras y proveedor de correo configurados.
- [ ] Recuperación de contraseña probada.
- [ ] Guardas de suscripción y límites aprobados.
- [ ] Términos y aviso de privacidad publicados y revisados.
- [ ] Backups y smoke test verificados.

## Bloqueantes para lanzamiento público

- [ ] Cobros productivos, cancelaciones y reembolsos revisados.
- [ ] Soporte, monitoreo y alertas operativos.
- [ ] Revisión legal y de seguridad completada.
- [ ] Plan de recuperación ante desastre, exportación y retención aprobado.
