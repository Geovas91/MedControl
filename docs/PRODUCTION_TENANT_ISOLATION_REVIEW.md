# Revisión estática de aislamiento tenant

Revisión realizada para pacientes, citas, pagos clínicos, notas, consentimientos, plantillas, miembros y suscripciones.

| Área | Patrón confirmado |
| --- | --- |
| Pacientes, citas y pagos | `getActiveTenantContext()` en servidor y filtro explícito `clinic_id`. |
| Notas y consentimientos | Tenant activo, paciente de la clínica y filtros `clinic_id`/`patient_id`; acciones vuelven a resolver autorización. |
| Plantillas | Plantillas de sistema o de la clínica activa; no se exponen plantillas de otro tenant. |
| Miembros y suscripciones | RPC/RLS de membresía y consulta ligada a clínica activa. |

Las escrituras directas autenticadas en pacientes, citas, pagos, notas, consentimientos, plantillas e invitaciones de cita añaden `clinic_has_write_entitlement(clinic_id)` a las políticas existentes de tenant y rol. `clinic_members` no tiene política de escritura REST: sólo la RPC protegida puede modificar miembros y rechaza cualquier owner existente. La firma pública sigue usando su RPC SECURITY DEFINER y no se amplían políticas anónimas.

## Pruebas RLS directas

- Con JWT autenticado y trial futuro: `INSERT` sólo permite recursos de la clínica y rol autorizados.
- Con trial vencido, fecha nula, `past_due`, `inactive` o `cancelled`: `SELECT` histórico sigue permitido, pero `INSERT` y `UPDATE` REST son rechazados por RLS.
- Con otra clínica, todas las operaciones permanecen bloqueadas aunque esa otra clínica tenga acceso activo.
- Verificar webhook/operación interna autorizada de suscripción por separado; estas políticas no cambian la ruta server-side de PayPal.

No se encontró uso de `service_role` en navegador. `createAdminClient` queda limitado a integraciones server-side de PayPal. Riesgo pendiente: confirmar RLS contra el proyecto Supabase antes de beta y completar invitaciones antes de dar acceso a usuarios externos.
