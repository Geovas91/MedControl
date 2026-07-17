# Datos de pacientes por tenant

El listado de pacientes resuelve la clínica activa en servidor mediante
`getActiveTenantContext`. Las consultas usan el cliente SSR normal de Supabase,
RLS y un filtro explícito por el `clinic_id` resuelto; el navegador nunca decide
el tenant.

La búsqueda por nombre, correo o teléfono, el estado y la paginación se
normalizan en servidor y permanecen en query params. El tamaño de página sólo
admite 10 o 20 registros y los números de página fuera de rango se ajustan de
forma segura.

El detalle continúa respaldado por mocks y no acepta los UUID reales del
listado, por lo que los renglones no enlazan al detalle en este PR. El nombre
del médico principal tampoco se muestra: `primary_doctor_id` referencia
`auth.users` y no existe una relación PostgREST directa con `profiles`.

El repositorio no tiene un runner de pruebas unitarias. La normalización,
paginación, formato de fecha y etiquetas de estado se mantienen como funciones
puras en `lib/patients/query.ts` para incorporarlas a pruebas futuras.
