# Asistente de Agenda v1 en DonWeb

El motor usa PostgreSQL como cola persistente. Un cron del VPS debe llamar cada minuto, por loopback, a `POST /api/internal/appointment-automations/run` con `Authorization: Bearer $APPOINTMENT_AUTOMATION_CRON_SECRET`. El secreto es exclusivo del servidor, debe tener al menos 24 caracteres aleatorios y nunca debe aparecer en argumentos visibles, logs ni archivos versionados.

Genera el valor directamente en el VPS con un CSPRNG, por ejemplo `openssl rand -hex 32`. Guárdalo en el mecanismo privado de variables del proceso o en un archivo root-only con permisos `0600`; no copies el valor al repositorio, al crontab, a capturas ni a comandos que puedan quedar en el historial. El script root-only del cron debe leer la variable y enviar un body vacío. El endpoint no acepta IDs ni selección de tenant desde el caller.

Ejemplo conceptual (adaptar al gestor seguro de secretos del VPS): una única entrada de cron por despliegue, cada minuto, contra `http://127.0.0.1:<puerto>/api/internal/appointment-automations/run`. No se configura ningún cron real con este cambio.

La consola `/dashboard/bot` muestra la última señal del scheduler, resultados recientes y readiness del provider sin exponer destinatarios ni payloads. Con cron cada minuto, una ejecución completada hace visible `Scheduler OK`; si no hay una durante cinco minutos, muestra `Sin señal`. Sin secreto configurado muestra `Configuración incompleta`; con el asistente deshabilitado muestra `Inactivo` aunque el heartbeat global continúe.

Para evitar duplicados:

- mantén una sola entrada cron activa por entorno;
- el claim usa `FOR UPDATE SKIP LOCKED`, por lo que ejecuciones superpuestas no reciben el mismo job;
- cada envío usa una clave de idempotencia estable y los jobs tienen dedupe tenant-safe;
- un lease vencido permite recuperar trabajo interrumpido.

Si la aplicación o la base de datos están caídas, el POST falla y el heartbeat deja de avanzar; los jobs persistidos permanecen para una ejecución posterior. Si el provider está indisponible antes del envío, el job se omite de forma segura. Sólo `rate_limited` usa retry acotado. Un timeout se trata como entrega incierta y no se reenvía automáticamente. Si el proceso de un recordatorio muere después del provider call y antes de persistir el outcome, el lease permite recuperación y se reutiliza la misma idempotency key. Un review job no se reenvía después de emitir su invitación: queda terminal y se recupera manualmente. Permanece el riesgo residual inevitable de un proveedor que haya aceptado un recordatorio pero ya no conserve su registro de idempotencia.

Rollback operativo: desactivar `enabled`, `reminder_enabled` y `review_request_enabled` desde la consola cancela recordatorios pendientes y detiene provider calls en el preflight. Luego se puede retirar la única entrada cron. Los jobs y las invitaciones ya emitidas se conservan como evidencia; no se borran citas, reseñas ni eventos externos.
