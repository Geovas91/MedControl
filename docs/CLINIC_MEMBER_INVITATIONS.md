# Invitaciones de miembros de clínica

La migración `0016_clinic_member_invitations.sql` agrega invitaciones seguras para miembros de una clínica. La migración debe revisarse y ejecutarse manualmente por un operador autorizado; la aplicación no la aplica.

## Modelo y seguridad

- `clinic_member_invitations` guarda únicamente el hash SHA-256 de un token aleatorio de 32 bytes. El token sin hash sólo se devuelve al crear o rotar la invitación y nunca se lista ni persiste en la interfaz.
- Las invitaciones duran siete días. Sólo se permiten los roles `admin`, `doctor` y `assistant`; nunca `owner`.
- Los RPC `SECURITY DEFINER` tienen `search_path` fijo, verifican Auth, rol owner/admin, entitlement de escritura, clínica, límites de médicos y el estado de la invitación. Las escrituras directas a la tabla están revocadas para `anon` y `authenticated`.
- El RPC público sólo recibe el hash calculado en servidor y devuelve datos mínimos. No expone el email completo ni el hash. La aceptación bloquea la fila, exige que el email autenticado coincida, crea o reactiva una membresía compatible y anula el token en la misma transacción.
- Crear, rotar, revocar y aceptar escriben auditoría sin correo, token ni URL. La rotación invalida el token anterior, limita a cinco renovaciones y aplica una espera de 60 segundos. `rotation_count` y `last_rotated_at` describen enlaces renovados, no correos enviados.
- `clinic_has_write_entitlement` no se modifica y sigue exigiendo membresía activa para escrituras normales. La función interna no ejecutable `clinic_subscription_allows_member_acceptance` sólo permite que la RPC de aceptación compruebe `active` o un trial vigente antes de crear la primera membresía.

## Flujo operativo sin proveedor de correo

Cuando Resend no está configurado, owner/admin crea la invitación desde `/dashboard/members`, copia el enlace que se muestra una sola vez y lo comparte por un canal aprobado. El destinatario abre `/invite/[token]`, inicia sesión o se registra y acepta con el mismo correo invitado.

Cuando Resend está configurado, la creación y la generación de enlace nuevo envían una sola vez el enlace recién emitido. Si la entrega falla o está deshabilitada, la invitación sigue activa y la interfaz ofrece copia manual. Los detalles operativos están en `docs/INVITATION_EMAIL_DELIVERY.md`.

El enlace es personal, no debe compartirse ni incluirse en logs, capturas o tickets. Owner/admin puede rotarlo o revocarlo desde la lista de invitaciones. Una invitación vencida se presenta como `expired` y debe crearse otra; no conserva acciones como si siguiera vigente. Con `EMAIL_REQUIRED=true`, `/api/ready` mantiene `503` hasta que exista una configuración real y válida de Resend; las variables válidas habilitan el envío desde servidor. Un timeout se informa como entrega no confirmada y no activa reintentos automáticos.

## Verificación manual

1. Owner crea una invitación `doctor`, copia la URL y verifica que la tabla no devuelve `token_hash` en el listado.
2. Intentar crear `owner`, superar el límite del plan o invitar a un miembro activo debe fallar.
3. Rotar el enlace: el anterior debe ser inválido y el nuevo válido. Revocarlo debe invalidarlo.
4. Un usuario sin membresías con el correo invitado y una suscripción `active` o trial vigente debe crear perfil/membresía activa, marcar la invitación como `accepted` y eliminar el token. Un segundo intento debe fallar sin duplicar la membresía.
5. Un trial vencido, sin fecha, una suscripción `past_due`, `inactive`, `cancelled` o faltante debe rechazar la aceptación. Un correo diferente, límite de médicos alcanzado y rol `owner` también deben rechazarse.
6. Un usuario invitado no puede escribir antes de aceptar; después sólo puede hacerlo según su rol. `clinic_has_write_entitlement` debe seguir rechazando a usuarios sin membresía.
7. Registro invitado con un `next` local exacto `/invite/<token>` no pide clínica ni guarda `clinic_name`. Probar campos vacíos, contraseña inválida, correo ya registrado y error de Supabase: cada respuesta debe conservar `next` y seguir ocultando la clínica. Registro normal sigue exigiendo clínica.
8. Login invitado con campo vacío o contraseña incorrecta conserva `next`; sus enlaces de registro y recuperación también lo conservan. Recuperación vuelve por `/reset-password?next=...` y después permite volver a login o a la invitación sin reconstruir el enlace.
9. `isInvitationPath` sólo acepta `/invite/[A-Za-z0-9_-]{1,128}`. Rechazar `https://evil.example`, `//evil.example`, `/\\evil`, `/invite/`, `/invite/a/b`, queries en la ruta y tokens de más de 128 caracteres; todos usan el fallback seguro.
10. Intentar `select`, `insert`, `update` o `delete` REST directo sobre `clinic_member_invitations` como `anon` y como `authenticated` debe ser denegado. La función interna de suscripción tampoco debe ser ejecutable directamente.
11. Con `EMAIL_REQUIRED=false`, `/api/ready` puede responder 200 y `email: disabled`. Con `EMAIL_REQUIRED=true`, debe responder 503 y `email: required_unavailable`, incluso con variables ficticias.

## Multi-clínica

La aceptación devuelve exclusivamente el `clinic_id` de la invitación consumida. La Server Action lo guarda en la cookie HTTP-only de clínica activa y redirige a `/dashboard` sin token. Esto selecciona la clínica invitada tanto para la primera membresía como para un usuario con clínicas existentes; el selector permite volver a otra clínica autorizada.
