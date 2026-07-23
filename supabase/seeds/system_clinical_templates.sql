-- Idempotent CliniControl system template catalog. Run only after migration 0013.
-- These are documentation aids, not diagnostic, treatment, or legal instructions.

with specialties (code, specialty, titles) as (
  values
    ('general', 'General / Multidisciplinaria', array['Nota clínica libre', 'Nota SOAP', 'Primera consulta', 'Consulta de seguimiento', 'Nota de procedimiento', 'Interconsulta', 'Referencia a especialista', 'Nota de egreso o cierre de atención']),
    ('general_medicine', 'Medicina general', array['Primera consulta de medicina general', 'Seguimiento de padecimiento agudo', 'Seguimiento de enfermedad crónica', 'Revisión preventiva', 'Consulta por síntomas respiratorios', 'Consulta por síntomas gastrointestinales']),
    ('pediatrics', 'Pediatría', array['Primera consulta pediátrica', 'Consulta de seguimiento pediátrico', 'Control de niño sano', 'Cuadro respiratorio pediátrico', 'Cuadro gastrointestinal pediátrico', 'Valoración de crecimiento y desarrollo']),
    ('gynecology', 'Ginecología y obstetricia', array['Primera consulta ginecológica', 'Seguimiento ginecológico', 'Control prenatal', 'Seguimiento posparto', 'Planificación familiar', 'Valoración de síntomas ginecológicos']),
    ('internal_medicine', 'Medicina interna', array['Primera valoración de medicina interna', 'Seguimiento de enfermedad crónica', 'Paciente con múltiples padecimientos', 'Revisión de estudios y evolución', 'Valoración integral del adulto']),
    ('cardiology', 'Cardiología', array['Primera valoración cardiológica', 'Seguimiento de hipertensión', 'Seguimiento cardiovascular', 'Valoración de dolor torácico', 'Revisión de estudios cardiológicos']),
    ('endocrinology', 'Endocrinología', array['Primera valoración endocrinológica', 'Seguimiento de diabetes', 'Seguimiento de trastorno tiroideo', 'Valoración de obesidad y riesgo metabólico', 'Revisión de estudios metabólicos']),
    ('dermatology', 'Dermatología', array['Primera valoración dermatológica', 'Seguimiento de lesión dermatológica', 'Valoración de lesiones múltiples', 'Nota de procedimiento dermatológico', 'Seguimiento posterior a procedimiento']),
    ('orthopedics', 'Traumatología y ortopedia', array['Primera valoración musculoesquelética', 'Lesión traumática', 'Dolor articular', 'Seguimiento de rehabilitación', 'Seguimiento posoperatorio ortopédico']),
    ('gastroenterology', 'Gastroenterología', array['Primera valoración gastroenterológica', 'Síntomas digestivos', 'Seguimiento gastrointestinal', 'Valoración hepatobiliar', 'Revisión de estudios digestivos']),
    ('neurology', 'Neurología', array['Primera valoración neurológica', 'Valoración de cefalea', 'Seguimiento neurológico', 'Alteración sensitiva o motora', 'Revisión de estudios neurológicos']),
    ('psychiatry', 'Psiquiatría', array['Primera valoración psiquiátrica', 'Seguimiento psiquiátrico', 'Examen del estado mental', 'Seguimiento farmacológico', 'Valoración de riesgo']),
    ('psychology', 'Psicología', array['Entrevista inicial psicológica', 'Nota de sesión', 'Seguimiento terapéutico', 'Objetivos terapéuticos', 'Cierre de proceso terapéutico'])
), note_catalog as (
  select format('%s_%s_v1', code, ordinality) as system_key, specialty, title as name,
    case when title = 'Nota SOAP' then
      'Formato SOAP de documentación clínica. No es una guía diagnóstica.' || E'\n\nSubjetivo:\n\nObjetivo:\n\nAnálisis:\n\nPlan:'
    when title = 'Valoración de riesgo' then
      'Formato de documentación profesional de valoración de riesgo. No genera puntajes, diagnósticos ni sustituye protocolos de emergencia. Cualquier riesgo inmediato requiere el protocolo clínico local.' || E'\n\nMotivo y contexto:\n\nObservaciones clínicas:\n\nFactores de protección y apoyo:\n\nValoración profesional:\n\nPlan de atención y seguimiento:'
    else
      format('Formato de apoyo documental para %s en %s. Adaptar al contexto clínico, protocolos institucionales y juicio profesional. No contiene diagnósticos, tratamientos, dosis ni indicaciones automáticas.', title, specialty)
      || E'\n\nMotivo de consulta:\n\nAntecedentes relevantes:\n\nSíntomas y evolución:\n\nExploración o evaluación:\n\nEstudios o resultados relevantes:\n\nImpresión clínica:\n\nPlan de atención:\n\nIndicaciones:\n\nSeguimiento:'
    end as content
  from specialties cross join lateral unnest(titles) with ordinality as item(title, ordinality)
)
insert into public.medical_note_templates as target (
  clinic_id, name, specialty, description, template_schema, is_system_template,
  system_key, is_active, template_kind, created_by
)
select null, name, specialty,
  'Plantilla base de CliniControl para apoyo documental; requiere adaptación clínica profesional.',
  jsonb_build_object('content', content, 'version', 'v1'), true, system_key, true, 'note', null
from note_catalog
on conflict (system_key) where system_key is not null do update
  set name = excluded.name,
      specialty = excluded.specialty,
      description = excluded.description,
      template_schema = excluded.template_schema,
      is_active = excluded.is_active,
      template_kind = excluded.template_kind
  where target.is_system_template = true;

with consent_catalog (system_key, name, content) as (
  values
    ('consent_general_care_v1', 'Consentimiento general de atención', E'Descripción de la atención:\n\nFinalidad:\n\nBeneficios esperados:\n\nRiesgos generales:\n\nAlternativas y posibilidad de hacer preguntas:\n\nAceptación voluntaria y revocación cuando corresponda:\n\nNombre y firma del firmante:\n\nFecha:'),
    ('consent_sensitive_data_v1', 'Aviso y autorización para tratamiento de datos personales sensibles', E'Descripción y finalidad del tratamiento de datos:\n\nInformación que puede tratarse:\n\nMedidas administrativas aplicables:\n\nPosibilidad de hacer preguntas:\n\nAceptación voluntaria y revocación cuando corresponda:\n\nNombre y firma del firmante:\n\nFecha:'),
    ('consent_medical_procedure_v1', 'Consentimiento para procedimiento médico', E'Procedimiento: [Nombre del procedimiento]\n\nDescripción: [Descripción]\n\nBeneficios esperados: [Beneficios esperados]\n\nRiesgos relevantes: [Riesgos relevantes]\n\nAlternativas: [Alternativas]\n\nPosibilidad de hacer preguntas y aceptación voluntaria:\n\nNombre y firma del firmante:\n\nFecha:'),
    ('consent_minor_procedure_v1', 'Consentimiento para procedimiento menor', E'Procedimiento: [Nombre del procedimiento]\n\nDescripción: [Descripción]\n\nBeneficios esperados: [Beneficios esperados]\n\nRiesgos relevantes: [Riesgos relevantes]\n\nAlternativas: [Alternativas]\n\nPosibilidad de hacer preguntas y aceptación voluntaria:\n\nNombre y firma del firmante:\n\nFecha:'),
    ('consent_clinical_photos_v1', 'Consentimiento para toma y uso de fotografías clínicas', E'Descripción de las fotografías clínicas:\n\nFinalidad y alcance del uso:\n\nRiesgos generales de privacidad:\n\nAlternativas y posibilidad de hacer preguntas:\n\nAceptación voluntaria y revocación cuando corresponda:\n\nNombre y firma del firmante:\n\nFecha:'),
    ('consent_teleconsultation_v1', 'Consentimiento para teleconsulta', E'Descripción de la teleconsulta:\n\nFinalidad y limitaciones del medio remoto:\n\nRiesgos generales de privacidad y comunicación:\n\nAlternativas y posibilidad de hacer preguntas:\n\nAceptación voluntaria:\n\nNombre y firma del firmante:\n\nFecha:'),
    ('consent_representative_v1', 'Autorización de representante o tutor', E'Descripción de la representación o tutela:\n\nFinalidad de la autorización:\n\nAlcance, responsabilidades y posibilidad de hacer preguntas:\n\nAceptación voluntaria y revocación cuando corresponda:\n\nNombre y firma del representante o tutor:\n\nFecha:'),
    ('consent_informed_refusal_v1', 'Negativa informada de atención o tratamiento', E'Descripción de la atención o tratamiento propuesto:\n\nInformación revisada, beneficios esperados y riesgos generales de rechazarlo:\n\nAlternativas y posibilidad de hacer preguntas:\n\nManifestación voluntaria de negativa:\n\nNombre y firma del firmante:\n\nFecha:')
)
insert into public.medical_note_templates as target (
  clinic_id, name, specialty, description, template_schema, is_system_template,
  system_key, is_active, template_kind, created_by
)
select null, name, 'General / Multidisciplinaria',
  'Plantilla base sujeta a revisión médica, administrativa y jurídica antes de su uso.',
  jsonb_build_object('content', content, 'templateKind', 'consent', 'version', 'v1'), true, system_key, true, 'consent', null
from consent_catalog
on conflict (system_key) where system_key is not null do update
  set name = excluded.name,
      specialty = excluded.specialty,
      description = excluded.description,
      template_schema = excluded.template_schema,
      is_active = excluded.is_active,
      template_kind = excluded.template_kind
  where target.is_system_template = true;
