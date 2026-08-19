# Consentimiento Digital v1

Este documento registra el alcance aprobado y la entrega incremental del
módulo. Un consentimiento es un documento independiente dentro del expediente
universal; nunca es una nota clínica editable.

## Fase 1 — migración 0022

La fase 1 entrega:

- integridad tenant-safe entre clínica, paciente, expediente, consentimiento y firma;
- vínculo obligatorio con el expediente universal activo, derivado server-side;
- una sola firma final por consentimiento;
- inmutabilidad del paciente y expediente desde la emisión;
- inmutabilidad del contenido y evidencia después de firma o cancelación;
- cancelación únicamente antes de firma;
- auditoría básica de creación, cancelación y firma;
- privilegios directos mínimos y mutaciones mediante RPCs específicas.

Los estados legales nuevos son `pending`, `signed` y `cancelled`. Los
consentimientos legacy `expired` sin evidencia de firma se reclasifican como
pendientes porque ese estado representaba el vencimiento de un enlace; su token
se invalida. Los legacy `revoked` sin firma pasan a `cancelled`, conservando
`revoked_at` y una marca de migración. Si cualquiera de esos estados ya tiene
`signed_at` o una firma relacionada, se conserva como `signed`: la evidencia
prevalece sobre la etiqueta legacy. Cada reclasificación produce un evento de
auditoría sin contenido clínico ni material de firma.

## Fases siguientes

### 0023 — plantillas, versiones y snapshots

- tablas de plantillas de consentimiento separadas de `medical_note_templates`;
- versiones publicadas inmutables;
- snapshot exacto por consentimiento;
- SHA-256 del snapshot.

### 0024 — acceso público y eventos

- tokens de 32 bytes aleatorios almacenados únicamente como hash;
- expiración configurable con siete días por defecto;
- registros de token separados;
- auditoría de apertura y rotación;
- firma pública endurecida y QR real;
- retiro de `signing_token` plaintext y de los RPCs transitorios.

La firma v1 conservará nombre, aceptación explícita y firma dibujada
obligatoria. Una firma final nunca se borra ni se revierte.

### 0025 — PDF y documentos privados

- firma gráfica como objeto privado e integrada al PDF;
- SHA-256 de firma y PDF;
- PDF final server-side;
- Supabase Storage privado;
- outbox idempotente;
- consulta y descarga autorizadas desde el expediente.

La política legal de conservación y la anulación administrativa posterior a
firma requieren una decisión separada. Fase 1 no implementa ninguna de las dos.
