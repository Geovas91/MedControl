# Creación de pacientes

La ruta `/dashboard/patients/new` crea pacientes con el cliente SSR autenticado de Supabase. La página y la
Server Action resuelven el tenant activo mediante `getActiveTenantContext`; el formulario no recibe ni envía
`clinic_id`, y todas las consultas e inserciones usan el identificador resuelto en servidor.

## Permisos y médico principal

Los roles `owner`, `doctor` y `admin` pueden crear pacientes, en correspondencia con la política RLS vigente.
El rol `assistant` mantiene acceso de lectura, pero no puede abrir ni ejecutar el formulario de creación.

`patients.primary_doctor_id` referencia `auth.users(id)`. El selector usa `doctor_public_profiles.profile_id`,
que referencia el mismo identificador y ya es la fuente adoptada por la agenda. Solo lista perfiles de la clínica
activa y la Server Action vuelve a validar el médico antes de insertar. El campo es opcional.

## Validación y duplicados

El servidor normaliza espacios, convierte el correo a minúsculas y valida nombre, estado, correo, teléfono,
fecha de nacimiento, sexo y longitudes. La fecha se trata como `date`, se compara con el día local de la clínica
y admite una edad máxima de 120 años. Los antecedentes se limitan a 2,000 caracteres y nunca se incluyen en logs
ni mensajes de error.

Antes de insertar se buscan coincidencias exactas por correo o teléfono normalizados, siempre dentro del tenant.
No se bloquea por nombre solamente y no se consultan otras clínicas. Una coincidencia muestra un aviso genérico;
para resolver un falso positivo se debe corregir el dato o dejar vacío el contacto opcional. La verificación es de
aplicación y no sustituye un constraint frente a solicitudes estrictamente simultáneas.

## Alcance y pruebas

Este flujo solo crea pacientes y devuelve al cliente el UUID necesario para redirigir al detalle. No edita ni
elimina pacientes, no crea notas, diagnósticos, consentimientos o archivos, y no modifica RLS, Auth, migraciones
ni seeds. Un registro manual del tenant demo puede desaparecer al reinicializar ese entorno manualmente.

El repositorio no tiene un comando ni runner de pruebas configurado. Las normalizaciones, validaciones de fecha,
estado y rol se mantienen como funciones puras para facilitar pruebas futuras sin añadir un framework en este PR.
