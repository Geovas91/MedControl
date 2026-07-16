# CliniControl tenant seeds

Este directorio contiene seeds operativos, pequeños e idempotentes para entornos controlados. Los archivos crean únicamente el registro base de cada clínica tenant. No crean usuarios de Auth, pacientes, citas, pagos, notas médicas, consentimientos ni otros datos clínicos.

## Archivos

- `demo1.sql`: crea el tenant demo primario con un UUID estable.
- `demo2.sql`: crea un segundo tenant demo independiente.
- `minimal.sql`: crea un tenant mínimo de desarrollo para pruebas de infraestructura.
- `reset_demo.sql`: elimina exclusivamente los tenants administrados por `demo1.sql` y `demo2.sql` cuando siguen clasificados como `demo`.

Supabase ejecuta `supabase/seed.sql` durante `supabase db reset`; no ejecuta automáticamente los archivos de este directorio. Estos seeds deben aplicarse de forma explícita después de las migraciones.

## Requisitos

1. Aplicar primero todas las migraciones, incluida `0010_tenant_type.sql`.
2. Usar una conexión administrativa destinada al entorno correcto.
3. Confirmar que el destino no es producción antes de ejecutar un reset.
4. No añadir información real o sensible a estos archivos.

## Regenerar los tenants demo

Configura `SUPABASE_DB_URL` con la conexión del entorno controlado y ejecuta desde la raíz del repositorio:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/reset_demo.sql
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo1.sql
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo2.sql
```

Para preparar sólo el tenant mínimo de desarrollo:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/minimal.sql
```

`reset_demo.sql` usa UUIDs explícitos y exige `tenant_type = 'demo'`. No elimina otros tenants demo, tenants customer ni el tenant creado por `minimal.sql`. La eliminación de una clínica puede activar cascadas definidas por el esquema; por ello este script debe usarse únicamente para regenerar estos tenants demo controlados.
