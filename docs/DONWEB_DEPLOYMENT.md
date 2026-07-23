# Despliegue DonWeb controlado

## Prerrequisitos

- Node.js 20.9+ y `NODE_ENV=production`.
- Dominio HTTPS y proxy inverso que reenvíe `PORT` al proceso Node.
- Variables configuradas en el panel, nunca copiando `.env.local` ni valores reales al repositorio.
- Migraciones revisadas y aplicadas por un operador autorizado. No ejecutar seeds demo en staging/beta/producción.

## Instalación y arranque

```bash
npm ci
npm run build
npm run start
```

Configurar un proceso reiniciable en CloudPanel/PM2 y el puerto asignado por `process.env.PORT`. No usar `npm run dev`. Comprobar `GET /api/health` y `GET /api/ready` después de cada actualización; `ready` debe responder 200 antes de enviar tráfico.

## Operación

Antes de actualizar, verificar backup y el commit desplegado. Para rollback, volver al último commit validado, ejecutar `npm ci`, `npm run build` y reiniciar el proceso. Revisar logs estructurados sin copiar secretos ni datos clínicos. Las migraciones se revisan y ejecutan por separado; no se aplican desde este PR.

Si staging debe exigir configuración de correo antes de aceptar tráfico beta, usar `EMAIL_REQUIRED=true` junto con `EMAIL_PROVIDER` y `EMAIL_FROM`, y comprobar que `/api/ready` responda 200. Esta configuración no activa entrega de correo; la integración de proveedor sigue fuera de esta etapa.
