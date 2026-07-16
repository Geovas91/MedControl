# CliniControl tenant seeds

Este directorio contiene seeds operativos, pequeños e idempotentes para entornos controlados. Los archivos crean únicamente el registro base de cada clínica tenant. No crean usuarios de Auth, pacientes, citas, pagos, notas médicas, consentimientos ni otros datos clínicos.

## Archivos

- `demo1.sql`: crea `demo1`, el tenant principal para demostraciones, con tipo `demo` y UUID estable.
- `demo1_account.sql`: vincula la cuenta Auth existente `demo1@clinicontrol.mx` con `demo1` y configura su membresía owner y suscripción Pro interna.
- `demo2.sql`: crea `demo2`, un tenant persistente de QA con tipo `qa` y UUID estable.
- `minimal.sql`: crea un tenant mínimo de desarrollo para pruebas de infraestructura.
- `reset_demo.sql`: elimina exclusivamente `demo1` cuando sigue clasificado como `demo`.
- `reset_qa.sql`: elimina exclusivamente `demo2` cuando sigue clasificado como `qa`.

Supabase ejecuta `supabase/seed.sql` durante `supabase db reset`; no ejecuta automáticamente los archivos de este directorio. Estos seeds deben aplicarse de forma explícita después de las migraciones.

## Requisitos

1. Aplicar primero todas las migraciones, incluidas `0010_tenant_type.sql` y `0011_internal_subscription_billing_providers.sql`.
2. Usar una conexión administrativa destinada al entorno correcto.
3. Confirmar que el destino no es producción antes de ejecutar un reset.
4. No añadir información real o sensible a estos archivos.

Los seeds de cuentas requieren que el usuario se cree previamente mediante Supabase Auth. Nunca se deben insertar usuarios, contraseñas o tokens directamente en `auth.users` desde estos archivos.

## Regenerar el tenant demo principal

Este flujo es exclusivo para entornos demo controlados y no debe ejecutarse en producción. Primero debe existir en Supabase Auth el usuario `demo1@clinicontrol.mx`. Configura `SUPABASE_DB_URL` con la conexión administrativa del entorno demo y ejecuta desde la raíz del repositorio, en este orden:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/reset_demo.sql
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo1.sql
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo1_account.sql
```

El orden de provisión después de crear el usuario Auth es:

1. `demo1.sql`
2. `demo1_account.sql`

`demo1_account.sql` falla de forma explícita si el usuario Auth no existe o si el tenant no tiene el UUID esperado y `tenant_type = 'demo'`.

Para verificar el perfil, la membresía y la suscripción sin consultar datos clínicos:

```sql
select
  profile.full_name,
  profile.email,
  profile.role as profile_role,
  membership.role as membership_role,
  membership.status as membership_status,
  subscription.plan_id,
  subscription.status as subscription_status,
  subscription.billing_provider,
  subscription.current_period_end,
  subscription.cancel_at_period_end
from auth.users as auth_user
join public.profiles as profile on profile.id = auth_user.id
join public.clinic_members as membership on membership.user_id = auth_user.id
join public.clinic_subscriptions as subscription on subscription.clinic_id = membership.clinic_id
where auth_user.email = 'demo1@clinicontrol.mx'
  and membership.clinic_id = '10000000-0000-4000-8000-000000000001';
```

El resultado esperado es `demo1`, rol de perfil `doctor`, membresía `owner`/`active` y suscripción `pro`/`active` con origen `demo`, sin fecha de fin y sin cancelación programada.

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

`reset_demo.sql` usa el UUID explícito de `demo1` y exige `tenant_type = 'demo'`. Al eliminar la clínica, las claves foráneas limpian por cascada su membresía y suscripción; la cuenta Auth y su perfil no se eliminan. `reset_qa.sql` usa el UUID explícito de `demo2` y exige `tenant_type = 'qa'`. Ninguno elimina otros tenants ni el tenant creado por `minimal.sql`. Cada reset debe usarse únicamente en su entorno controlado y nunca en producción.
