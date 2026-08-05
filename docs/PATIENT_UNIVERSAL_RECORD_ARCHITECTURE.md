# Pacientes y expediente clínico universal — fase 1

## Separación de dominios

`public.patients` conserva únicamente identidad, contacto y datos administrativos. El expediente se representa con `clinical_records`; la historia inicial usa tablas estructuradas para identificación, alertas, antecedentes y evaluación. Los signos vitales son mediciones inmutables independientes. `public.payments` continúa dedicado exclusivamente a pagos de pacientes a clínicas y esta fase no lo modifica.

## Alta atómica

`create_patient_with_record` valida usuario, membresía activa, rol y entitlement dentro de PostgreSQL. En una sola transacción crea paciente, expediente activo único, historia en borrador y filas vacías de sus secciones. No crea consulta, nota, diagnóstico ni signos vitales. El servidor obtiene `clinic_id` de la clínica activa y la RPC vuelve a validarlo.

## Roles y RLS

- `owner`, `admin`, `doctor` y `assistant`: lectura y mantenimiento administrativo de pacientes.
- `owner`, `admin` y `doctor`: lectura y escritura de historia, alertas, antecedentes y signos vitales.
- Usuarios sin membresía activa: sin acceso.

Todas las relaciones clínicas usan claves foráneas compuestas `(clinic_id, id)` para impedir referencias cruzadas aunque un cliente altere identificadores. Las tablas clínicas tienen RLS y no ofrecen eliminación física; usan `archived_at` o `voided_at`. Los cambios generan `clinical_change_events` con actor, campos cambiados y valores anterior/nuevo.

## Especialidades futuras

`specialty_modules` cataloga Medicina general, Nutrición, Medicina estética, Psicología, Odontología, Ginecología, Pediatría y Fisioterapia. `specialty_module_fields` define campos tipados por sección. Una fase posterior deberá añadir tablas de respuestas por fila/tipo y versiones de plantilla; no se guardará un formulario completo como un único JSON. La historia universal no depende de ninguna especialidad.

## Decisiones pendientes

- Definir catálogos clínicos normalizados para alergias, medicamentos, diagnósticos, escolaridad y ocupación.
- Diseñar versionado y firma profesional para historias completadas.
- Incorporar documentos, consentimientos y consultas al nuevo resumen sin duplicar los módulos existentes.
- Acordar la política de corrección/anulación de signos vitales y retención normativa antes de producción.
