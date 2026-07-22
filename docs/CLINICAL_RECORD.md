# Expediente clinico del paciente

El expediente clinico se consulta desde `dashboard/patients/[id]/clinical-record`.
La ruta usa `getActiveTenantContext` en el servidor y nunca acepta un `clinic_id`
desde parametros, cookies personalizadas o el cliente.

## Aislamiento y acceso

- Todas las consultas de pacientes, notas, consentimientos, plantillas y perfiles
  incluyen el `clinic_id` de la membresia activa.
- El cliente de Supabase es el cliente SSR normal; no se usa `service_role`.
- RLS sigue siendo la barrera de datos. La aplicacion añade los filtros de tenant
  como defensa adicional y para no depender de entradas del cliente.
- Los roles `owner`, `admin` y `doctor` pueden ver el expediente. `assistant` no
  carga ni recibe el resumen, notas, consentimientos, firmas ni plantillas.
- Las paginas dinamicas fuerzan renderizado por solicitud y no almacenan contenido
  clinico en `localStorage` ni en cache de cliente.

## Contenido

La pantalla principal muestra un resumen, notas paginadas, consentimientos y el
numero de plantillas activas. El listado no incluye el contenido completo de las
notas. Cada detalle se carga por separado, filtrado por paciente y clinica.

Las fechas se formatean con la zona horaria configurada en la clinica. Los errores
para el usuario son genericos; el logger solo recibe contexto tecnico, operacion y
codigo de Supabase, nunca texto clinico ni identificadores de pacientes.

## Limitaciones intencionales

No existe una tabla de historial dedicada para cambios de notas o consentimientos.
Este cambio no agrega una migracion ni inventa un mecanismo de auditoria paralelo.
Tampoco se muestran datos de `relevant_history` fuera de las pantallas existentes.
