# Arquitectura de tenants

## Alcance

En CliniControl, `public.clinics` es el límite lógico de tenant. Las tablas operativas y clínicas existentes se relacionan mediante `clinic_id`, y las políticas RLS actuales siguen siendo la autoridad para el acceso a datos.

La columna `public.clinics.tenant_type` añade una clasificación operativa. No cambia membresías, autenticación, autorización, planes comerciales ni comportamiento de la aplicación.

## Tipos de tenant

| Valor | Uso previsto |
| --- | --- |
| `customer` | Clínica real o tenant creado por los flujos normales. Es el valor predeterminado. |
| `demo` | Demostraciones controladas y datos totalmente ficticios. |
| `qa` | Pruebas de aceptación y validación de calidad. |
| `internal` | Operación interna autorizada, sin datos clínicos reales salvo aprobación futura explícita. |
| `development` | Desarrollo local y pruebas de infraestructura. |

Los registros existentes se clasifican como `customer` al aplicar la migración. Los flujos actuales que crean clínicas también reciben `customer` por defecto, por lo que no requieren cambios funcionales.

## Límites de seguridad

- `tenant_type` es metadata, no una frontera de autorización.
- Ninguna consulta debe usar `tenant_type` para omitir o relajar RLS.
- Un tenant demo conserva las mismas reglas de aislamiento por `clinic_id` que un tenant customer.
- Los seeds no deben incluir secretos, credenciales reales, información identificable ni datos médicos.
- La promoción o reclasificación de un tenant debe ser una operación administrativa auditada en una fase futura.

## Seeds controlados

Los seeds modulares viven en `supabase/seeds/`. En esta primera base sólo crean registros de `public.clinics` con UUIDs deterministas. No crean usuarios ni contenido clínico.

Para regenerar los tenants demo:

1. Confirmar el entorno y la conexión administrativa.
2. Ejecutar `supabase/seeds/reset_demo.sql`.
3. Ejecutar `supabase/seeds/demo1.sql` y/o `supabase/seeds/demo2.sql`.
4. Verificar que los registros resultantes tengan `tenant_type = 'demo'`.

Los comandos concretos y las salvaguardas están documentados en `supabase/seeds/README.md`.

## Evolución futura

La incorporación posterior de datos demo deberá usar información inequívocamente ficticia, mantener referencias dentro del mismo `clinic_id` y contar con una revisión separada de privacidad, RLS y limpieza. Esta entrega no introduce ese contenido ni automatiza la creación de usuarios Auth.
