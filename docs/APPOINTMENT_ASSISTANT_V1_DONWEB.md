# Asistente de Agenda v1 en DonWeb

El motor usa PostgreSQL como cola persistente. Un cron del VPS debe llamar cada minuto, por loopback, a `POST /api/internal/appointment-automations/run` con `Authorization: Bearer $APPOINTMENT_AUTOMATION_CRON_SECRET`. El secreto es exclusivo del servidor, debe tener al menos 24 caracteres aleatorios y nunca debe aparecer en argumentos visibles, logs ni archivos versionados.

Ejemplo conceptual (adaptar al gestor seguro de secretos del VPS): una única entrada de cron por despliegue, cada minuto, contra `http://127.0.0.1:<puerto>/api/internal/appointment-automations/run`. No se configura ningún cron real con este cambio.

La consola `/dashboard/bot` muestra la última señal del scheduler, resultados recientes y readiness del provider sin exponer destinatarios ni payloads. Si no hay una ejecución completada durante cinco minutos, muestra `Sin señal`.

Para evitar duplicados:

- mantén una sola entrada cron activa por entorno;
- el claim usa `FOR UPDATE SKIP LOCKED`, por lo que ejecuciones superpuestas no reciben el mismo job;
- cada envío usa una clave de idempotencia estable y los jobs tienen dedupe tenant-safe;
- un lease vencido permite recuperar trabajo interrumpido.

Rollback operativo: desactivar `enabled`, `reminder_enabled` y `review_request_enabled` desde la consola detiene provider calls en el preflight. Luego se puede retirar el cron. Los jobs y las invitaciones ya emitidas se conservan como evidencia; no se borran citas, reseñas ni eventos externos.
