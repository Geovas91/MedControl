# CliniControl tenant seeds

Este directorio contiene seeds operativos, pequeños e idempotentes para entornos controlados. Los archivos crean únicamente el registro base de cada clínica tenant. No crean usuarios de Auth, pacientes, citas, pagos, notas médicas, consentimientos ni otros datos clínicos.

## Archivos

- `demo1.sql`: crea `demo1`, el tenant principal para demostraciones, con tipo `demo` y UUID estable.
- `demo2.sql`: crea `demo2`, un tenant persistente de QA con tipo `qa` y UUID estable.
- `minimal.sql`: crea un tenant mínimo de desarrollo para pruebas de infraestructura.
- `reset_demo.sql`: elimina exclusivamente `demo1` cuando sigue clasificado como `demo`.
- `reset_qa.sql`: elimina exclusivamente `demo2` cuando sigue clasificado como `qa`.

Supabase ejecuta `supabase/seed.sql` durante `supabase db reset`; no ejecuta automáticamente los archivos de este directorio. Estos seeds deben aplicarse de forma explícita después de las migraciones.

## Requisitos

1. Aplicar primero todas las migraciones, incluida `0010_tenant_type.sql`.
2. Usar una conexión administrativa destinada al entorno correcto.
3. Confirmar que el destino no es producción antes de ejecutar un reset.
4. No añadir información real o sensible a estos archivos.

## Regenerar el tenant demo principal

Configura `SUPABASE_DB_URL` con la conexión del entorno controlado y ejecuta desde la raíz del repositorio:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/reset_demo.sql
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo1.sql
```

## Regenerar el tenant persistente de QA

La regeneración de `demo2` es independiente y debe ser intencional:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/reset_qa.sql
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo2.sql
```

Para preparar sólo el tenant mínimo de desarrollo:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/minimal.sql
```

`reset_demo.sql` usa el UUID explícito de `demo1` y exige `tenant_type = 'demo'`. `reset_qa.sql` usa el UUID explícito de `demo2` y exige `tenant_type = 'qa'`. Ninguno elimina otros tenants ni el tenant creado por `minimal.sql`. La eliminación de una clínica puede activar cascadas definidas por el esquema; por ello cada reset debe usarse únicamente para regenerar su tenant controlado.
