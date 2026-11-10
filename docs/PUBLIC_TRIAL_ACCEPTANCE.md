# Candidato de trial — Revisión y aceptación pendiente

Base 8cc8c6624a75bc45c3503bf71910ede6b852ea50. Oferta aprobada de 30 días sin cobro automático, lectura por rol al vencer y escritura con estado contratado activo confirmado por servidor.

## Cambios y cobertura

- Onboarding ya persiste trialing/manual con inicio now() y fin a 30 días. No se reinicia el trial histórico ni se modifican planes activos.
- 0069 agrega una guarda BEFORE de escritura a pacientes, citas, pagos, notas, consentimientos y firmas, expedientes e historias, alertas/vitales, snapshots/documentos, invitaciones, disponibilidad, preferencias de comunicación y asignaciones. Incluye RPC SECURITY DEFINER y service_role. Conserva RLS de lectura. Requiere revisar SQL y cascadas en PostgreSQL antes de integrar.
- La guarda no concede permisos. Las autorizaciones existentes siguen vigentes. La suscripción activa conserva acceso aun con periodos nulos; trial requiere un vencimiento estrictamente futuro y se comprueba después del lock de la fila de suscripción.
- El servidor comprueba la suscripción antes de subir una materialización PDF. La descarga de un PDF ya listo conserva el camino de lectura existente. La aceptación de PDF del Staging anterior no certifica este cambio.
- El detalle de citas busca un nombre de respaldo con list_clinic_members_for_current_user cuando el Doctor no tiene entrada en el directorio público. El lookup se realiza solo tras leer la cita en el tenant y filtra clinic_id y user_id. Sin ampliación de grants ni RLS.
- Pruebas dirigidas del detalle reprodujeron 2 FAIL antes de corregir y 4 PASS después. Dos pruebas adicionales ejecutan el adaptador real de billing con respuestas simuladas y acreditan checkout del Owner vencido, aislamiento del actor y mapeo exclusivo ACTIVE a active. Los escenarios existentes de duplicados, reintentos e incertidumbre siguen pasando en la suite completa.

## Resultado local

888 unitarias PASS, 0 FAIL, 0 SKIP. TypeScript PASS. Build sintético PASS, BUILD_ID dWkxO8hnaUUyHWZrL3QSm. Lint PASS con dos advertencias anteriores en tests/assistant-browser/patient-actions.ts. Diff check PASS.

La primera ejecución de campaña falló siete casos por contaminación de variables de build en el harness; se corrigió su ámbito y se ejecutó de nuevo. La aplicación no cambió para resolver esos fallos de harness.

## Bloqueos de integración/publicación

| Pendiente | Responsable | Cierre verificable |
|---|---|---|
| SQL 0069 y smoke trial | Operador QA y equipo de aplicación | Runner Linux desechable aislado con canal aprobado e imágenes/dependencias locales. Acreditar Auth/Storage/PostgREST, baseline 0001–0067 y ausencia de 0068. Dry-run anuncia solo 0069, ledger final 68 filas, ocho pgTAP PASS y smoke de onboarding real, Owner vigente/vencido/activo, legado con periodos nulos, cancelación, API/Actions/RPC directas y tenant ajeno. |
| Contratación real | Responsable de facturación y QA | Sandbox autorizado, merchant/buyer de prueba, planes y webhook correctos. Probar APPROVED sin acceso de escritura, ACTIVE confirmado y persistido para la clínica correcta, duplicados, reentrega, incertidumbre y clínica ajena. Los mocks no acreditan al proveedor ni PostgreSQL. |
| Términos y privacidad | Producto y responsable legal | Textos y versiones aprobados visibles en onboarding y guardados por el RPC. Hoy 0057 guarda pending-legal-v1 y pending-privacy-v1. Preparar una migración nueva al aprobar los textos. |
| PDF final | QA | En este candidato, descarga autorizada con hash/tamaño, denegación de otra clínica sin URL firmada y materialización pendiente durante/después del trial. Staging anterior conserva su PASS. |
| Destino y persistencia | Operador DonWeb / Gio | Aprobar identidad pública de app/base, baseline, artefacto final, persistencia PM2 y ensayo de reversión. Guardar el dump requiere autorización independiente. |
| Recuperación | Operador Supabase / continuidad | Restauración probada de DB/Auth/Storage binario, ledger y permisos con smoke. Aceptación integral PENDING. |

0069 se revisa como migración separada desde 0067. El directorio para ese ensayo debe incluir 0001–0067 y 0069, excluyendo físicamente 0068. Verificar el dry-run antes de aplicar. No reparar ni inventar el ledger.

El smoke final debe repetir alta/login/invitación, pacientes, disponibilidad, ciclo de citas persistido y contraste por ID entre clínicas porque el nuevo control SQL y el lookup del Doctor cambian sus caminos de ejecución.

Estado de publicación NO-GO. Estado SQL y navegador BLOCKED. El PR permanece en borrador.
