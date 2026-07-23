# Plan de ejecución DonWeb staging

Este plan es para staging controlado. No despliega, no aplica migraciones y no autoriza datos clínicos reales.

## A. Preparar entorno

1. Configurar Node 20.9+, HTTPS, proxy inverso, `APP_BASE_URL` y las variables Supabase públicas/privadas exclusivamente en CloudPanel.
2. Confirmar que `NEXT_PUBLIC_ENABLE_DEMO_CONSENT=false`, PayPal permanece en sandbox y no existen seeds demo aplicados.
3. Usar `npm ci`, `npm run build` y `npm run start` bajo un proceso reiniciable; nunca `npm run dev`.

## B. Base de datos

1. Revisar y respaldar antes de cada migración. Aplicar por operador autorizado y en orden, incluida `0016_clinic_member_invitations.sql` sólo tras su revisión SQL.
2. No ejecutar seeds de demo ni cambiar RLS desde el servidor web.
3. Ejecutar pruebas de aislamiento: dos usuarios de clínicas distintas no pueden leer ni mutar datos cruzados; `anon` no puede leer ni mutar invitaciones.

## C. Auth e invitaciones

1. Confirmar redirect URLs de Supabase para el dominio staging y el callback PKCE.
2. Probar registro, login, recuperación y la preservación de `/invite/[token]` por callback.
3. Probar crear, rotar, revocar y aceptar invitaciones con el correo exacto. No copiar URLs de invitación a logs o documentación.

## D. Correo

La entrega de invitaciones no está implementada. Configurar `EMAIL_PROVIDER` y `EMAIL_FROM` sólo cuando exista una integración aprobada. Para exigirlo antes de beta, establecer `EMAIL_REQUIRED=true` y confirmar `GET /api/ready` con estado `ready`; la respuesta no expone secretos ni configuración del proveedor.

## E. Operación y rollback

1. Tras despliegue, comprobar `GET /api/health` y `GET /api/ready`; los dos deben responder correctamente.
2. Mantener el commit desplegado, backup verificable y logs estructurados sin secretos, URLs de invitación ni datos clínicos.
3. Para rollback, volver a un commit validado, instalar dependencias bloqueadas, construir y reiniciar. Las migraciones requieren un plan de rollback separado; no se revierten automáticamente.

## F. Criterios de avance

No avanzar a beta privada hasta completar el checklist de readiness, pruebas de RLS, flujo de invitaciones, Auth, recuperación, observabilidad y revisión de correo. No avanzar a producción sin revisión legal, seguridad, pagos productivos, retención, soporte y recuperación aprobados.
