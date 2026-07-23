# Invitaciones de miembros de clínica

La migración `0016_clinic_member_invitations.sql` agrega invitaciones seguras para miembros de una clínica. La migración debe revisarse y ejecutarse manualmente por un operador autorizado; la aplicación no la aplica.

## Modelo y seguridad

- `clinic_member_invitations` guarda únicamente el hash SHA-256 de un token aleatorio de 32 bytes. El token sin hash sólo se devuelve al crear o rotar la invitación y nunca se lista ni persiste en la interfaz.
- Las invitaciones duran siete días. Sólo se permiten los roles `admin`, `doctor` y `assistant`; nunca `owner`.
- Los RPC `SECURITY DEFINER` tienen `search_path` fijo, verifican Auth, rol owner/admin, entitlement de escritura, clínica, límites de médicos y el estado de la invitación. Las escrituras directas a la tabla están revocadas para `anon` y `authenticated`.
- El RPC público sólo recibe el hash calculado en servidor y devuelve datos mínimos. No expone el email completo ni el hash. La aceptación bloquea la fila, exige que el email autenticado coincida, crea o reactiva una membresía compatible y anula el token en la misma transacción.
- Crear, rotar, revocar y aceptar escriben auditoría sin correo, token ni URL. La rotación invalida el token anterior, limita reenvíos a cinco y aplica una espera de 60 segundos.

## Flujo operativo sin proveedor de correo

No hay proveedor de correo configurado ni se envían mensajes en esta etapa. Owner/admin crea la invitación desde `/dashboard/members`, copia el enlace que se muestra una sola vez y lo comparte por un canal aprobado. El destinatario abre `/invite/[token]`, inicia sesión o se registra y acepta con el mismo correo invitado.

El enlace es personal, no debe compartirse ni incluirse en logs, capturas o tickets. Owner/admin puede rotarlo o revocarlo desde la lista de invitaciones. El estado del proveedor sólo afecta readiness: `EMAIL_REQUIRED=true` hace que `/api/ready` devuelva `503` hasta que haya `EMAIL_PROVIDER` y `EMAIL_FROM`; no habilita envío.

## Verificación manual

1. Owner crea una invitación `doctor`, copia la URL y verifica que la tabla no devuelve `token_hash` en el listado.
2. Intentar crear `owner`, superar el límite del plan o invitar a un miembro activo debe fallar.
3. Rotar el enlace: el anterior debe ser inválido y el nuevo válido. Revocarlo debe invalidarlo.
4. Con sesión de otro correo, aceptar debe fallar con mensaje genérico. Con el correo invitado, debe crear perfil/membresía activa y marcar la invitación como `accepted`.
5. Intentar `select`, `insert`, `update` o `delete` REST directo sobre `clinic_member_invitations` como `anon` y como `authenticated` debe ser denegado.
6. Probar token inválido, vencido, revocado, repetido y dos aceptaciones simultáneas: no debe aparecer una segunda membresía ni reactivarse un token usado.

## Multi-clínica

El dashboard ofrece un selector de clínica activa cuando el usuario tiene más de una membresía activa. La selección se almacena en una cookie HTTP-only y se verifica contra la membresía activa antes de cambiarla. Tras aceptar una invitación, el usuario puede elegir la nueva clínica activa desde el menú del dashboard.
