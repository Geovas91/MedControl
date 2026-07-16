# ADR 0001: Estrategia multi-tenant basada en clínicas

- Estado: Aceptado
- Fecha: 2026-07-16

## Contexto

CliniControl ya relaciona sus datos mediante `clinic_id` y controla el acceso con membresías de clínica y RLS. Los entornos controlados necesitan distinguir tenants customer, demo, QA, internos y de desarrollo sin duplicar el esquema ni alterar la lógica clínica.

## Decisión

`public.clinics` seguirá siendo la entidad raíz de tenant. Se añade el enum `public.tenant_type` y una columna `public.clinics.tenant_type` no nula con valor predeterminado `customer`.

Los tipos admitidos son:

- `customer`
- `demo`
- `qa`
- `internal`
- `development`

La clasificación será exclusivamente operativa. El aislamiento seguirá dependiendo de `clinic_id`, `clinic_members`, Auth y las políticas RLS existentes. Los seeds de esta fase sólo crearán cascarones de tenant y se ejecutarán explícitamente, fuera del seed automático de Supabase.

## Consecuencias

- Los registros existentes y las clínicas nuevas mantienen el comportamiento actual mediante el valor predeterminado `customer`.
- Los equipos pueden identificar y limpiar tenants controlados sin inferir su propósito por nombre o dominio.
- `tenant_type` puede servir para filtros administrativos futuros, pero no autoriza acceso ni desactiva controles.
- Los UUIDs deterministas permiten regenerar de forma repetible `demo1` como tenant demo y `demo2` como tenant persistente de QA.
- `reset_demo.sql` queda limitado al UUID de `demo1` y exige tipo `demo`; `reset_qa.sql` queda limitado al UUID de `demo2` y exige tipo `qa`.

## Alternativas consideradas

Crear tablas separadas por entorno o por tipo de tenant aumentaría la divergencia del esquema y el riesgo de inconsistencias. Inferir el tipo desde nombres, correos o dominios sería ambiguo y difícil de auditar. Usar una columna de texto sin enum permitiría valores inválidos y convenciones inconsistentes.

## Fuera de alcance

Esta decisión no cambia RLS, Auth, PayPal, planes comerciales, límites, datos clínicos ni la lógica de onboarding. Tampoco crea usuarios demo ni define todavía un catálogo de datos clínicos ficticios.
