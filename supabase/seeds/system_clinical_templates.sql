-- Idempotent CliniControl system template catalog. Run only after migration 0013.
-- These are documentation aids, not diagnostic, treatment, or legal instructions.

with note_catalog (system_key, specialty, name, content_type) as (
  values
    ('general_free_note_v1', 'General / Multidisciplinaria', 'Nota clínica libre', 'default'),
    ('general_soap_v1', 'General / Multidisciplinaria', 'Nota SOAP', 'soap'),
    ('general_first_visit_v1', 'General / Multidisciplinaria', 'Primera consulta', 'default'),
    ('general_followup_v1', 'General / Multidisciplinaria', 'Consulta de seguimiento', 'default'),
    ('general_procedure_note_v1', 'General / Multidisciplinaria', 'Nota de procedimiento', 'default'),
    ('general_interconsultation_v1', 'General / Multidisciplinaria', 'Interconsulta', 'default'),
    ('general_specialist_referral_v1', 'General / Multidisciplinaria', 'Referencia a especialista', 'default'),
    ('general_discharge_note_v1', 'General / Multidisciplinaria', 'Nota de egreso o cierre de atención', 'default'),
    ('general_medicine_first_visit_v1', 'Medicina general', 'Primera consulta de medicina general', 'default'),
    ('general_medicine_acute_followup_v1', 'Medicina general', 'Seguimiento de padecimiento agudo', 'default'),
    ('general_medicine_chronic_disease_followup_v1', 'Medicina general', 'Seguimiento de enfermedad crónica', 'default'),
    ('general_medicine_preventive_review_v1', 'Medicina general', 'Revisión preventiva', 'default'),
    ('general_medicine_respiratory_symptoms_v1', 'Medicina general', 'Consulta por síntomas respiratorios', 'default'),
    ('general_medicine_gastrointestinal_symptoms_v1', 'Medicina general', 'Consulta por síntomas gastrointestinales', 'default'),
    ('pediatrics_first_visit_v1', 'Pediatría', 'Primera consulta pediátrica', 'default'),
    ('pediatrics_followup_v1', 'Pediatría', 'Consulta de seguimiento pediátrico', 'default'),
    ('pediatrics_well_child_v1', 'Pediatría', 'Control de niño sano', 'default'),
    ('pediatrics_respiratory_symptoms_v1', 'Pediatría', 'Cuadro respiratorio pediátrico', 'default'),
    ('pediatrics_gastrointestinal_symptoms_v1', 'Pediatría', 'Cuadro gastrointestinal pediátrico', 'default'),
    ('pediatrics_growth_development_assessment_v1', 'Pediatría', 'Valoración de crecimiento y desarrollo', 'default'),
    ('gynecology_first_visit_v1', 'Ginecología y obstetricia', 'Primera consulta ginecológica', 'default'),
    ('gynecology_followup_v1', 'Ginecología y obstetricia', 'Seguimiento ginecológico', 'default'),
    ('gynecology_prenatal_followup_v1', 'Ginecología y obstetricia', 'Control prenatal', 'default'),
    ('gynecology_postpartum_followup_v1', 'Ginecología y obstetricia', 'Seguimiento posparto', 'default'),
    ('gynecology_family_planning_v1', 'Ginecología y obstetricia', 'Planificación familiar', 'default'),
    ('gynecology_symptoms_assessment_v1', 'Ginecología y obstetricia', 'Valoración de síntomas ginecológicos', 'default'),
    ('internal_medicine_first_assessment_v1', 'Medicina interna', 'Primera valoración de medicina interna', 'default'),
    ('internal_medicine_chronic_disease_followup_v1', 'Medicina interna', 'Seguimiento de enfermedad crónica', 'default'),
    ('internal_medicine_multimorbidity_v1', 'Medicina interna', 'Paciente con múltiples padecimientos', 'default'),
    ('internal_medicine_studies_evolution_review_v1', 'Medicina interna', 'Revisión de estudios y evolución', 'default'),
    ('internal_medicine_comprehensive_adult_assessment_v1', 'Medicina interna', 'Valoración integral del adulto', 'default'),
    ('cardiology_first_assessment_v1', 'Cardiología', 'Primera valoración cardiológica', 'default'),
    ('cardiology_hypertension_followup_v1', 'Cardiología', 'Seguimiento de hipertensión', 'default'),
    ('cardiology_cardiovascular_followup_v1', 'Cardiología', 'Seguimiento cardiovascular', 'default'),
    ('cardiology_chest_pain_assessment_v1', 'Cardiología', 'Valoración de dolor torácico', 'default'),
    ('cardiology_studies_review_v1', 'Cardiología', 'Revisión de estudios cardiológicos', 'default'),
    ('endocrinology_first_assessment_v1', 'Endocrinología', 'Primera valoración endocrinológica', 'default'),
    ('endocrinology_diabetes_followup_v1', 'Endocrinología', 'Seguimiento de diabetes', 'default'),
    ('endocrinology_thyroid_disorder_followup_v1', 'Endocrinología', 'Seguimiento de trastorno tiroideo', 'default'),
    ('endocrinology_obesity_metabolic_risk_assessment_v1', 'Endocrinología', 'Valoración de obesidad y riesgo metabólico', 'default'),
    ('endocrinology_metabolic_studies_review_v1', 'Endocrinología', 'Revisión de estudios metabólicos', 'default'),
    ('dermatology_first_assessment_v1', 'Dermatología', 'Primera valoración dermatológica', 'default'),
    ('dermatology_lesion_followup_v1', 'Dermatología', 'Seguimiento de lesión dermatológica', 'default'),
    ('dermatology_multiple_lesions_assessment_v1', 'Dermatología', 'Valoración de lesiones múltiples', 'default'),
    ('dermatology_procedure_note_v1', 'Dermatología', 'Nota de procedimiento dermatológico', 'default'),
    ('dermatology_post_procedure_followup_v1', 'Dermatología', 'Seguimiento posterior a procedimiento', 'default'),
    ('orthopedics_first_assessment_v1', 'Traumatología y ortopedia', 'Primera valoración musculoesquelética', 'default'),
    ('orthopedics_traumatic_injury_v1', 'Traumatología y ortopedia', 'Lesión traumática', 'default'),
    ('orthopedics_joint_pain_v1', 'Traumatología y ortopedia', 'Dolor articular', 'default'),
    ('orthopedics_rehabilitation_followup_v1', 'Traumatología y ortopedia', 'Seguimiento de rehabilitación', 'default'),
    ('orthopedics_postoperative_followup_v1', 'Traumatología y ortopedia', 'Seguimiento posoperatorio ortopédico', 'default'),
    ('gastroenterology_first_assessment_v1', 'Gastroenterología', 'Primera valoración gastroenterológica', 'default'),
    ('gastroenterology_digestive_symptoms_v1', 'Gastroenterología', 'Síntomas digestivos', 'default'),
    ('gastroenterology_gastrointestinal_followup_v1', 'Gastroenterología', 'Seguimiento gastrointestinal', 'default'),
    ('gastroenterology_hepatobiliary_assessment_v1', 'Gastroenterología', 'Valoración hepatobiliar', 'default'),
    ('gastroenterology_digestive_studies_review_v1', 'Gastroenterología', 'Revisión de estudios digestivos', 'default'),
    ('neurology_first_assessment_v1', 'Neurología', 'Primera valoración neurológica', 'default'),
    ('neurology_headache_assessment_v1', 'Neurología', 'Valoración de cefalea', 'default'),
    ('neurology_followup_v1', 'Neurología', 'Seguimiento neurológico', 'default'),
    ('neurology_sensory_motor_alteration_v1', 'Neurología', 'Alteración sensitiva o motora', 'default'),
    ('neurology_studies_review_v1', 'Neurología', 'Revisión de estudios neurológicos', 'default'),
    ('psychiatry_first_assessment_v1', 'Psiquiatría', 'Primera valoración psiquiátrica', 'default'),
    ('psychiatry_followup_v1', 'Psiquiatría', 'Seguimiento psiquiátrico', 'default'),
    ('psychiatry_mental_status_exam_v1', 'Psiquiatría', 'Examen del estado mental', 'default'),
    ('psychiatry_pharmacological_followup_v1', 'Psiquiatría', 'Seguimiento farmacológico', 'default'),
    ('psychiatry_risk_assessment_v1', 'Psiquiatría', 'Valoración de riesgo', 'risk'),
    ('psychology_initial_interview_v1', 'Psicología', 'Entrevista inicial psicológica', 'default'),
    ('psychology_session_note_v1', 'Psicología', 'Nota de sesión', 'default'),
    ('psychology_therapeutic_followup_v1', 'Psicología', 'Seguimiento terapéutico', 'default'),
    ('psychology_therapeutic_goals_v1', 'Psicología', 'Objetivos terapéuticos', 'default'),
    ('psychology_process_closure_v1', 'Psicología', 'Cierre de proceso terapéutico', 'default')
)
insert into public.medical_note_templates as target (
  clinic_id, name, specialty, description, template_schema, is_system_template,
  system_key, is_active, template_kind, created_by
)
select null, name, specialty,
  'Plantilla base de CliniControl para apoyo documental; requiere adaptación clínica profesional.',
  jsonb_build_object('content', case content_type when 'soap' then
      'Formato SOAP de documentación clínica. No es una guía diagnóstica.' || E'\n\nSubjetivo:\n\nObjetivo:\n\nAnálisis:\n\nPlan:'
    when 'risk' then
      'Formato de documentación profesional de valoración de riesgo. No genera puntajes, diagnósticos ni sustituye protocolos de emergencia. Cualquier riesgo inmediato requiere el protocolo clínico local.' || E'\n\nMotivo y contexto:\n\nObservaciones clínicas:\n\nFactores de protección y apoyo:\n\nValoración profesional:\n\nPlan de atención y seguimiento:'
    else
      format('Formato de apoyo documental para %s en %s. Adaptar al contexto clínico, protocolos institucionales y juicio profesional. No contiene diagnósticos, tratamientos, dosis ni indicaciones automáticas.', name, specialty)
      || E'\n\nMotivo de consulta:\n\nAntecedentes relevantes:\n\nSíntomas y evolución:\n\nExploración o evaluación:\n\nEstudios o resultados relevantes:\n\nImpresión clínica:\n\nPlan de atención:\n\nIndicaciones:\n\nSeguimiento:'
    end, 'version', 'v1'), true, system_key, true, 'note', null
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
