# Onboarding y miembros

## Implementado

`/onboarding` requiere una sesión y no permite repetir el flujo si ya existe una membresía activa. Recopila datos de la clínica, responsable owner, confirmaciones obligatorias y un plan. La RPC `complete_clinic_onboarding_for_current_user` (migración 0015, pendiente de aplicar) obtiene el usuario exclusivamente con `auth.uid()`, crea clínica, owner activo y suscripción `manual` con estado `inactive` en una operación transaccional. Nunca crea pagos clínicos ni acceso pagado.

La pantalla de miembros lista únicamente la clínica activa mediante RPC/RLS. El flujo actual agrega a una cuenta existente y nunca permite el rol owner. No existe aún una tabla de invitaciones segura, proveedor de correo, enlace de un solo uso, reenvío ni cancelación; por ello no se simula un correo enviado. Es un bloqueo para beta privada con miembros externos.

## Pruebas manuales

- Registrar usuario, confirmar correo y completar onboarding; verificar owner activo y suscripción pendiente.
- Reenviar el formulario; debe regresar la clínica activa existente.
- Probar owner/admin/doctor/assistant en `/dashboard/members`; assistant no debe gestionar miembros.
- Antes de beta, implementar invitaciones con hash de token, expiración, uso único y proveedor de correo configurado.
