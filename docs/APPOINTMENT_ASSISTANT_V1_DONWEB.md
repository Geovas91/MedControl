# Asistente de Agenda v1 en DonWeb

El motor usa PostgreSQL como cola persistente. Un cron del VPS debe llamar cada minuto, por loopback, a `POST /api/internal/appointment-automations/run` con `Authorization: Bearer $APPOINTMENT_AUTOMATION_CRON_SECRET`. El secreto es exclusivo del servidor, debe tener al menos 24 caracteres aleatorios y nunca debe aparecer en argumentos visibles, logs ni archivos versionados.

Genera el valor directamente en el VPS con un CSPRNG, por ejemplo `openssl rand -hex 32`. Guárdalo en el mecanismo privado de variables del proceso o en un archivo root-only con permisos `0600`; no copies el valor al repositorio, al crontab, a capturas ni a comandos que puedan quedar en el historial. El script root-only del cron debe leer la variable y enviar un body vacío. El endpoint no acepta IDs ni selección de tenant desde el caller.

Ejemplo conceptual (adaptar al gestor seguro de secretos del VPS): una única entrada de cron por despliegue, cada minuto, contra `http://127.0.0.1:<puerto>/api/internal/appointment-automations/run`. No se configura ningún cron real con este cambio.

La consola `/dashboard/bot` muestra la última señal del scheduler, resultados recientes y readiness del provider sin exponer destinatarios ni payloads. Con cron cada minuto, una ejecución completada hace visible `Scheduler OK`; si no hay una durante cinco minutos, muestra `Sin señal`. Sin secreto configurado muestra `Configuración incompleta`; con el asistente deshabilitado muestra `Inactivo` aunque el heartbeat global continúe.

Para evitar duplicados:

- mantén una sola entrada cron activa por entorno;
- el claim usa `FOR UPDATE SKIP LOCKED`, por lo que ejecuciones superpuestas no reciben el mismo job;
- cada envío usa una clave de idempotencia estable y los jobs tienen dedupe tenant-safe;
- cada claim asigna un token de fencing único por job; finish, fail, emisión de invitación y persistencia de review exigen el token vigente;
- el runner renueva el lease de cada job justo antes de iniciar la entrega. Con 20 jobs secuenciales, 12 segundos de latencia máxima por provider y un lease de 90 segundos, el lote completo puede tomar cerca de 240 segundos, pero cada job entra al provider con una ventana renovada de 90 segundos;
- un lease vencido permite recuperar únicamente trabajo que todavía no inició una entrega.

El lifecycle de entrega separa `not_started`, `dispatching`, `accepted` y `persisted`. Un fallo confirmado del provider antes de aceptar puede pasar a `retry_pending` con backoff; sólo `rate_limited` usa retry acotado. Si el worker desaparece en `dispatching`, la recuperación lo marca `uncertain` y no vuelve a llamar al provider. Si el provider fue aceptado y falla la finalización, la entrega se reconcilia desde `accepted` sin reenviar; para reviews también se repara el estado de la invitación enlazada antes de cerrar el job.

El contador `succeeded` sólo aumenta después de que el RPC de finalización devuelve `true`. Errores, `false`, leases vencidos y tokens obsoletos se contabilizan como `uncertain` o `lostLease`. El heartbeat termina en `error` cuando cualquiera de esos contadores es distinto de cero, aunque el cron haya alcanzado el endpoint y recibido una respuesta. Los códigos registrados están limitados a códigos operativos; no se guardan destinatarios, cuerpos, PHI, respuestas crudas ni secretos.

Rollback operativo: desactivar `enabled`, `reminder_enabled` y `review_request_enabled` desde la consola cancela recordatorios pendientes y detiene provider calls en el preflight. Luego se puede retirar la única entrada cron. Los jobs y las invitaciones ya emitidas se conservan como evidencia; no se borran citas, reseñas ni eventos externos.


## Autoridad comercial y cambios de plan

Basic excluye Appointment Assistant; Plus y Pro tienen la misma funcionalidad.
El trabajo nuevo requiere `appointment_assistant`, suscripción writable (active,
o trialing con fin futuro) y actor autorizado en su única clínica. Missing es
“Sin plan configurado”; un fallo técnico no es una solicitud de upgrade.

Basic no muestra chat, configuración ni actividad. Plus/Pro temporalmente read-only
conservan sólo observabilidad histórica con CTA de reactivación. El doctor sólo ve
actividad de sus citas; owner/admin/assistant ven agenda de su clínica.

0059 revalida autoridad en creación, claim y ejecución de propuestas. La ejecución
bloquea suscripción/propuesta y delega a las mutaciones canónicas en una transacción.
La marca `mutation_executed_at` evita dos ejecuciones antes del finish. Downgrade
antes de ejecución deniega incluso cancelar una cita por Assistant. La Agenda normal
y su cancelación segura siguen independientes. Cancelar propuestas pendientes y
registrar resultados ya ejecutados son limpieza, sin requisito de plan writable.

El boundary SQL de inicio de delivery valida plan/suscripción y lease/fencing.
Jobs pendientes no comienzan nuevas entregas tras perder entitlement. Una llamada
externa no forma parte de una transacción PostgreSQL: después de autorizar dispatching,
un downgrade concurrente no revoca una petición ya en vuelo. Accepted siempre puede
persistirse/reconciliarse sin resend; accepted con lease vencido se reconcilia y
un dispatching interrumpido queda uncertain. No se elimina historial.
