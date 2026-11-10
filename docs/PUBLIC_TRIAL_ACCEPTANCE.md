# Candidato de trial — Aceptación offline de 0069

Base 8cc8c6624a75bc45c3503bf71910ede6b852ea50. Oferta aprobada de 30 días sin cobro automático, lectura por rol al vencer y escritura con estado contratado activo confirmado por servidor.

## Cambios y cobertura

- Onboarding ya persiste trialing/manual con inicio now() y fin a 30 días. No se reinicia el trial histórico ni se modifican planes activos.
- 0069 agrega una guarda BEFORE de escritura a pacientes, citas, pagos, notas, consentimientos y firmas, expedientes e historias, alertas/vitales, snapshots/documentos, invitaciones, disponibilidad, preferencias de comunicación y asignaciones. Incluye RPC SECURITY DEFINER y service_role. Conserva RLS de lectura. La revisión de cascadas sigue pendiente antes de integrar.
- La guarda no concede permisos. Las autorizaciones existentes siguen vigentes. La suscripción activa conserva acceso aun con periodos nulos; trial requiere un vencimiento estrictamente futuro y se comprueba después del lock de la fila de suscripción.
- El servidor comprueba la suscripción antes de subir una materialización PDF. La descarga de un PDF ya listo conserva el camino de lectura existente. La aceptación de PDF del Staging anterior no certifica este cambio.
- El detalle de citas busca un nombre de respaldo con list_clinic_members_for_current_user cuando el Doctor no tiene entrada en el directorio público. El lookup se realiza solo tras leer la cita en el tenant y filtra clinic_id y user_id. Sin ampliación de grants ni RLS.
- Pruebas dirigidas del detalle reprodujeron 2 FAIL antes de corregir y 4 PASS después. Dos pruebas adicionales ejecutan el adaptador real de billing con respuestas simuladas y acreditan checkout del Owner vencido, aislamiento del actor y mapeo exclusivo ACTIVE a active. Los escenarios existentes de duplicados, reintentos e incertidumbre siguen pasando en la suite completa.

## Resultado local

888 unitarias PASS, 0 FAIL, 0 SKIP. TypeScript PASS. Build sintético PASS, BUILD_ID dWkxO8hnaUUyHWZrL3QSm. Lint PASS con dos advertencias anteriores en tests/assistant-browser/patient-actions.ts. Diff check PASS.

La primera ejecución de campaña falló siete casos por contaminación de variables de build en el harness; se corrigió su ámbito y se ejecutó de nuevo. La aplicación no cambió para resolver esos fallos de harness.

## Aceptación offline de 0069

**PASS. SQL 12/12 en dos ejecuciones independientes y smoke de navegador 4/4.** Se probó el candidato `c8ae4518dae2904354d39c527cbc5fd6d2b1fbba` el 10 de noviembre de 2026 en macOS Intel, con PostgreSQL 17.6, pgTAP 1.3.3, Auth, Storage y PostgREST en un proyecto Docker desechable y aislado. Supabase CLI 2.109.1 confirmó la conexión con TLS obligatorio antes de cargar el baseline.

- El ledger inicial contenía exactamente `0001–0067` (67 filas). El dry-run anunció exclusivamente `0069_clinical_write_subscription.sql`. El ledger final contenía exactamente `0001–0067` más `0069` (68 filas). `0068` quedó físicamente fuera del directorio de migraciones.
- La [suite corregida](../supabase/tests/0069_clinical_write_subscription.sql), SHA-256 `16cdcf133af5c44ccd6f2abd9a93c1d27781181311dec298515b13b15c11de00`, pasó con `ON_ERROR_STOP=1` y plan TAP `1..12` en ambos ensayos, sin SKIP, TODO ni bail-out. Se verificó el rollback de los fixtures.
- Los cuatro casos del smoke pasaron con verificación por ID. La segunda ejecución SQL usó volúmenes nuevos para sembrar la clínica y la suscripción legada con el ledger en `0067`, antes de aplicar `0069`.

| Caso | Evidencia |
|---|---|
| Alta y onboarding | El flujo real creó la clínica y persistió el trial de 30 días con estado `trialing`, proveedor `manual` y sin identificadores de cobro. |
| Trial vigente | El propietario creó un paciente y se verificó su persistencia por ID. |
| Trial vencido | El propietario pudo leer el mismo paciente por ID. La Server Action de alta rechazó la escritura, dejó intacta la fila anterior y no creó una fila nueva. |
| Plan legado activo | El propietario creó un paciente y se verificó su persistencia por ID con ambos periodos de suscripción nulos. Solo este caso se repitió tras completar el perfil sintético del propietario requerido por el dashboard. La clínica y la suscripción conservaron los IDs sembrados en `0067`. |

Fuente de QA local `CliniControl-QA/0069-mac-resume-3Z80GjbS/RESULTADO.md`. La carpeta conserva el TAP y los ledgers de cada ensayo y el resultado del smoke por ID.

## Bloqueos de integración/publicación

| Pendiente | Responsable | Cierre verificable |
|---|---|---|
| Contratación real | Responsable de facturación y QA | Sandbox autorizado, merchant/buyer de prueba, planes y webhook correctos. Probar APPROVED sin acceso de escritura, ACTIVE confirmado y persistido para la clínica correcta, duplicados, reentrega, incertidumbre y clínica ajena. Los mocks no acreditan al proveedor ni PostgreSQL. |
| Términos y privacidad | Producto y responsable legal | Textos y versiones aprobados visibles en onboarding y guardados por el RPC. Hoy 0057 guarda pending-legal-v1 y pending-privacy-v1. Preparar una migración nueva al aprobar los textos. |
| PDF final | QA | En este candidato, descarga autorizada con hash/tamaño, denegación de otra clínica sin URL firmada y materialización pendiente durante/después del trial. Staging anterior conserva su PASS. |
| Destino y persistencia | Operador DonWeb / Gio | Aprobar identidad pública de app/base, baseline, artefacto final, persistencia PM2 y ensayo de reversión. Guardar el dump requiere autorización independiente. |
| Recuperación | Operador Supabase / continuidad | Restauración probada de DB/Auth/Storage binario, ledger y permisos con smoke. Aceptación integral PENDING. |

0069 se revisa como migración separada desde 0067. El directorio para ese ensayo debe incluir 0001–0067 y 0069, excluyendo físicamente 0068. Verificar el dry-run antes de aplicar. No reparar ni inventar el ledger.

El smoke general de publicación conserva la regresión de alta, login, invitación, pacientes, disponibilidad, ciclo de citas persistido y contraste por ID entre clínicas. El resultado offline de 0069 acredita los cuatro casos de la tabla.

Estado de publicación NO-GO. La aceptación offline de SQL y navegador para 0069 está en PASS.
