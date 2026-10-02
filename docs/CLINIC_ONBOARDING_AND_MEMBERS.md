# Onboarding y miembros

## Implementado

`/onboarding` requiere una sesión y no permite repetir el flujo si ya existe una membresía activa. El correo administrativo de la clínica se guarda sólo en `clinics.email`; la RPC obtiene el correo de identidad exclusivamente de `auth.users` para `profiles.email` y nunca acepta ese valor del formulario. Un bloqueo transaccional por `auth.uid()` serializa doble clic, pestañas simultáneas y reintentos antes de crear perfil, clínica, owner, trial y evidencia.

La RPC `complete_clinic_onboarding_for_current_user` (definida en 0015 y actualizada en 0056) crea una suscripción `manual` en `trialing` por 30 días mediante `current_period_start = now()` y `current_period_end = now() + interval '30 days'`, calculados exclusivamente por PostgreSQL. No acepta fechas del cliente, no crea pagos clínicos ni marca una suscripción como pagada. También registra versiones provisionales de términos, privacidad y responsabilidad con `accepted_at` generado por PostgreSQL; la redacción/versiones definitivas requieren revisión jurídica.

La pantalla de miembros lista únicamente su clínica mediante RPC/RLS. Las invitaciones seguras usan hash de token, expiración, uso único, rotación y revocación, y nunca permiten el rol owner. La entrega de correo sigue sin implementación: el enlace se copia de forma controlada y no se simula un correo enviado.

## Pruebas manuales

- Con cuenta `user@correo.com` y correo de clínica `recepcion@clinica.com`, verificar que `profiles.email` permanece `user@correo.com` y `clinics.email` contiene el correo administrativo.
- Enviar onboarding desde dos pestañas y reintentar tras timeout; verificar una sola clínica, owner, suscripción y evidencia de aceptaciones.
- Registrar usuario, confirmar correo y completar onboarding; verificar trial de 30 días y acceso al workspace.
- Verificar que `clinic_onboarding_acceptances` no tiene políticas RLS: anon y authenticated no pueden leer, insertar, actualizar ni eliminar; sólo la RPC SECURITY DEFINER de onboarding escribe la evidencia.
- Probar owner/admin/doctor/assistant en `/dashboard/members`; assistant no debe gestionar miembros.
- Antes de beta, implementar y validar la entrega real de correo si se requiere automatizar invitaciones.

## Una sola membresía clínica activa

La migración 0056 impone como máximo una membresía clínica activa por usuario para todos los roles, incluso si el usuario también es administrador de plataforma. La clínica del dashboard se deriva exclusivamente de esa membresía: no hay selector ni autoridad mediante cookie. Una suscripción ausente conserva la membresía y el acceso a Billing; las escrituras comerciales siguen sujetas a entitlements.

Crear invitaciones no revela pertenencia a otras clínicas. Aceptar requiere no tener ninguna membresía activa y usa el mismo lock por usuario que onboarding. Las RPC legacy de onboarding y altas por email están revocadas para clientes. La migración aborta ante membresías activas duplicadas, sin reparar datos automáticamente.

Professional Portability será una transición posterior: suspender la membresía anterior antes de activar la nueva, en una transacción; nunca acceso simultáneo a varias clínicas.
