# Revisión estática de aislamiento tenant

Revisión realizada para pacientes, citas, pagos clínicos, notas, consentimientos, plantillas, miembros y suscripciones.

| Área | Patrón confirmado |
| --- | --- |
| Pacientes, citas y pagos | `getActiveTenantContext()` en servidor y filtro explícito `clinic_id`. |
| Notas y consentimientos | Tenant activo, paciente de la clínica y filtros `clinic_id`/`patient_id`; acciones vuelven a resolver autorización. |
| Plantillas | Plantillas de sistema o de la clínica activa; no se exponen plantillas de otro tenant. |
| Miembros y suscripciones | RPC/RLS de membresía y consulta ligada a clínica activa. |

No se encontró uso de `service_role` en navegador. `createAdminClient` queda limitado a integraciones server-side de PayPal. Riesgo pendiente: confirmar RLS contra el proyecto Supabase antes de beta y completar invitaciones antes de dar acceso a usuarios externos.
