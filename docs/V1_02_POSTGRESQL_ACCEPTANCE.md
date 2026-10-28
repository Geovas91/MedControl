# V1-02 — Aceptación PostgreSQL local

Implementación revisada: `15af16bf1cc9cca1a9b215e99c7665058cb5de6a`,
rama `codex/v1-02-paypal-duplicate-prevention`, PR #98 en borrador.
No se modificó código de aplicación ni la migración 0067.

## Entorno y baseline

Docker 29.9.2, imagen `public.ecr.aws/supabase/postgres:17.6.1.127`, PostgreSQL
17.6 x86_64. Node.js 24.22.1 para el runner. Contenedor desechable
`clinicontrol-v102-acceptance-20261027b`, ID
`f38d62c5e6837a488bb1d6bafd8793c2185a731f953f2811ed5f3170b3ad8f07`.
Etiqueta `clinicontrol.qa.disposable=v102-15af16b`, red `none`, sin puertos
publicados ni volúmenes compartidos; datos en tmpfs `/v102`. Conexiones psql por
socket Unix dentro del contenedor. No se usa Supabase CLI ni proyecto enlazado.

El CliniControl local existente (ID `738575fa4c1d`) se inspeccionó sólo en lectura:
ledger 0061, sin función claim de 0067. Se copiaron esquema sin datos y roles sin
contraseñas. Ningún registro se copió; auth.users, clinics e intents comenzaron en cero.
No había contenedor RestoPilot en el inventario consultado; no se tocó otro proyecto.

Bootstrap del laboratorio: initdb propio, bibliotecas pg_net/pg_cron precargadas
(sin red ni jobs copiados), roles recreados sin atribución GRANTED BY del host y
superusuario postgres local para restauración. Se aplicaron 0062–0064. La ACL anon
de la copia no coincidía con ninguna matriz admitida por 0065: se reconstruyó
**sólo en el laboratorio vacío** el resultado auditado (anon SELECT únicamente en
clinics y doctor_public_profiles); 0065 confirmó su estado idempotente exacto.
Luego se ejecutaron 0066 y 0067 originales con ON_ERROR_STOP, ambas completas y
COMMIT exitoso. Esto valida el esquema relevante con el baseline de permisos
endurecido; no es un replay desde cero de toda la historia ni una atestación remota.

## Resultados reales

| Comprobación | Resultado |
| --- | --- |
| Migración 0067 original | COMMIT, sin error |
| pgTAP 0035 compatible con 0062+ | 63/63, sin fallos |
| pgTAP 0067 ampliada | 29/29, sin fallos |
| Runner con conexiones PostgreSQL independientes | 1/1 PASS; ejecutado dos veces |
| Guardas del target del runner | 3/3 PASS; rechaza default, CliniControl existente y RestoPilot |
| Suite unitaria completa después de ajustes | 876 PASS, 0 FAIL, 0 SKIP |
| TypeScript después de ajustes | PASS |
| ESLint | 0 errores; dos advertencias preexistentes del harness browser |
| Diff check | PASS |

Se ejecutó `node scripts/test-paypal-creation-concurrency.mjs --container
clinicontrol-v102-acceptance-20261027b`. Dos procesos psql separados compitieron
por begin y devolvieron el mismo UUID; los claims devolvieron exactamente `t/f`.
Se verificó un solo intent, nuevo begin rechazado, vencimiento forzado de ese
fixture seguido de nuevo rechazo y claim posterior `f`. SQL 0067 comprueba además
propietario/tenant, bind tardío, bloqueo de aprobación antigua y denegación directa
de INSERT, UPDATE/reset del permiso, DELETE y TRUNCATE. Fixtures locales sintéticos;
las suites SQL hacen ROLLBACK y el runner elimina sólo sus IDs generados.
Al terminar: cero clínicas y cero billing intents en el laboratorio.
Después de capturar la evidencia se eliminaron los dos contenedores de laboratorio,
verificando ID, etiqueta, red y ausencia de mounts antes de cada eliminación.
El CliniControl local original sigue funcionando, con ledger 0061 y sin claim 0067.

Privilegios efectivos del journal:

| Rol | SELECT | INSERT/UPDATE/DELETE/TRUNCATE | claim RPC |
| --- | --- | --- | --- |
| anon | No | No | No |
| authenticated | No | No | No |
| service_role | Sí | No | Sí, con validación owner/tenant |

Índice `paypal_billing_intents_one_pending_per_clinic`: UNIQUE, válido,
`(clinic_id) WHERE status='pending'`. También se probó una inserción duplicada,
que falló con 23505. V1-05 permanece: los tres triggers opcionales tienen estado
`D`; ninguna de sus ocho funciones restringidas tiene EXECUTE efectivo para
anon/authenticated/service_role (0 combinaciones autorizadas).

## Incidencias corregidas

- Bootstrap: pgTAP necesita `search_path=public,extensions` al ejecutarse con psql
  directamente; el esquema Supabase necesita precargas y ACL de baseline coherentes.
- Prueba 0035: esperaba UPDATE filtrado por RLS; 0062 revoca UPDATE a authenticated.
  Se corrigió la aserción para exigir 42501 y conservar la comprobación de estado.
- Runner: apuntaba al CliniControl local existente por nombre fijo. Ahora exige un
  target explícito con prefijo, etiqueta, red aislada y ausencia de mounts. Se agregan
  pruebas que rechazan targets no desechables y checks de vencimiento/reclaim.

No se encontró un defecto funcional de V1-02. Los cambios son de pruebas,
seguridad del harness y documentación; requieren revisión del nuevo commit del
mismo PR. No hubo push automático, merge, despliegue, pagos ni acceso remoto.

## Compatibilidad histórica y decisión

Se usa exclusivamente el preflight agregado proporcionado por el operador:
0 clínicas con varios pendientes; 2 pendientes con ID, ambos vencidos;
2 suscripciones demo activas, 3 manuales activas y 1 PayPal activa.
No se inspeccionaron ni alteraron estos registros remotos. Cero duplicados por
clínica es compatible con el índice, sujeto a repetir preflight antes de aplicar.
0067 conserva ambos pendientes y sus IDs; no los expira, borra ni sustituye.
Las seis suscripciones activas bloquean una nueva creación. No se deduce su estado
actual en PayPal de estos datos locales.

Los dos pendientes vencidos requieren comprobación del proveedor y conciliación
autorizada V1-03 para resolverlos; no se habilita su reemplazo ni se declaran sanos.
GO para integración del código con estos ajustes de pruebas revisados. Aceptación
comercial y despliegue siguen sujetos al preflight, conciliación histórica y
autorización operativa separada. `V1_02_POSTGRESQL_VALIDATION=PASS` es local.
