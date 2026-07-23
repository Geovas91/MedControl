# Onboarding y miembros

## Implementado

`/onboarding` requiere una sesión y no permite repetir el flujo si ya existe una membresía activa. El correo administrativo de la clínica se guarda sólo en `clinics.email`; la RPC obtiene el correo de identidad exclusivamente de `auth.users` para `profiles.email` y nunca acepta ese valor del formulario. Un bloqueo transaccional por `auth.uid()` serializa doble clic, pestañas simultáneas y reintentos antes de crear perfil, clínica, owner, trial y evidencia.

La RPC `complete_clinic_onboarding_for_current_user` (migración 0015, pendiente de aplicar) crea una suscripción `manual` en `trialing` por 14 días mediante `current_period_start/current_period_end` calculados por PostgreSQL. No crea pagos clínicos ni marca una suscripción como pagada. También registra versiones provisionales de términos, privacidad y responsabilidad con `accepted_at` generado por PostgreSQL; la redacción/versiones definitivas requieren revisión jurídica.

La pantalla de miembros lista únicamente la clínica activa mediante RPC/RLS. El flujo actual agrega a una cuenta existente y nunca permite el rol owner. No existe aún una tabla de invitaciones segura, proveedor de correo, enlace de un solo uso, reenvío ni cancelación; por ello no se simula un correo enviado. Es un bloqueo para beta privada con miembros externos.

## Pruebas manuales

- Con cuenta `user@correo.com` y correo de clínica `recepcion@clinica.com`, verificar que `profiles.email` permanece `user@correo.com` y `clinics.email` contiene el correo administrativo.
- Enviar onboarding desde dos pestañas y reintentar tras timeout; verificar una sola clínica, owner, suscripción y evidencia de aceptaciones.
- Registrar usuario, confirmar correo y completar onboarding; verificar trial de 14 días y acceso al workspace.
- Probar owner/admin/doctor/assistant en `/dashboard/members`; assistant no debe gestionar miembros.
- Antes de beta, implementar invitaciones con hash de token, expiración, uso único y proveedor de correo configurado.
