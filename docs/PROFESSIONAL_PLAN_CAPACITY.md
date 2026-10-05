# Capacidad profesional por plan

Una plaza profesional es una fila de `clinic_members` de la clínica con
`status = 'active'` e `is_professional = true`. El rol no determina el consumo:
owner/admin pueden ser profesionales, doctor siempre lo es y assistant nunca.
Basic permite 1 plaza, Plus 5 y Pro no tiene límite numérico. Plus/Pro no limitan
numéricamente el staff no profesional; Basic bloquea nuevas altas/reactivaciones
de admin/assistant. Las invitaciones pendientes no reservan plazas.

El helper interno cuenta solamente. No está habilitado para clientes. El RPC
legacy `count_clinic_doctors_for_current_user` conserva nombre y firma, pero
cuenta plazas profesionales y autoriza miembros activos del tenant o Platform
Admin. Los campos TypeScript `doctorLimit`, `currentDoctorCount` y `canAddDoctor`
se mantienen por compatibilidad.

## Autoridad y orden de locks

La migración 0057 reemplaza únicamente las funciones efectivas. No reescribe
migraciones anteriores ni cambia RLS o el índice de una membresía activa de 0056.

- Aceptación: lock del usuario → fila de invitación → lock de capacidad clínica
  → lock del par clínica/usuario → fila de membresía.
- Cambio de capacidad: autorización inicial → lock de capacidad clínica → lectura
  del usuario objetivo → lock del par clínica/usuario → fila de membresía →
  nueva validación del actor y del objetivo → conteo y mutación.
- Onboarding: lock del usuario de 0056; crea una clínica nueva y no compite por
  plazas de una clínica existente.
- Crear invitación: lock del email y fila de invitación; el conteo es sólo un
  precheck. No adquiere el lock de capacidad ni reserva plazas.

El lock de capacidad conserva la familia `clinic_doctor_limit:<clinic_id>`.
Aceptación y grants comparten ese lock antes de bloquear la membresía, evitando
el orden inverso fila→capacidad. El lock del par se conserva para coordinar la
reducción con creación/reprogramación de citas. El resultado final de una
reactivación determina el consumo, incluso para un admin profesional suspendido.
Un rechazo revierte la transacción: no consume token ni registra aceptación.

## Owner, suscripción y downgrade

Sólo el owner activo puede cambiar su propia capacidad por el RPC autorizado.
Admin no puede auto concederla ni retirarla. El RPC exige explícitamente una
membresía activa owner/admin en la clínica para toda mutación, incluidas
reducciones; una comparación nullable de roles nunca autoriza.

Un incremento requiere suscripción writable activa o trial válido, plan
persistido válido y plaza libre. Una reducción autorizada no requiere entitlement
comercial, pero conserva la protección de citas futuras scheduled/confirmed/
waiting, la despublicación del perfil vinculado y el audit. Los clientes siguen
sin poder escribir directamente en `clinic_members` por RLS.

Un nuevo onboarding Basic crea owner profesional; Plus/Pro lo crean no
profesional. No hay backfill: el onboarding idempotente conserva la membresía
existente. Downgrades preservan profesionales, agenda, perfiles e historial,
incluso por encima del límite. Se informa N/X sin reparar ni suspender datos y
se bloquea únicamente el incremento. Pro muestra el N real más «sin límite».

## Deuda separada

**Admin professional directory profile alignment**: la UI de directorio reconoce
`is_professional`, pero la acción de guardar aún restringe por rol owner/doctor.
No se modifica en esta tarea. El deploy y la validación remota de 0057 requieren
una fase independiente; las pruebas de este PR se ejecutan sólo localmente.
