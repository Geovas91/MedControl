import type { MedicalNoteSection, MedicalNoteTemplate } from "@/types/medical-note";

const generalSections: MedicalNoteSection[] = [
  {
    id: "general-information",
    title: "Información general",
    fields: [
      { id: "dateTime", label: "Fecha y hora", type: "text", required: true, placeholder: "4 de junio de 2026, 10:30" },
      { id: "doctorName", label: "Nombre del médico", type: "text", required: true, placeholder: "Dr. Alex Morgan" },
      { id: "licenseNumber", label: "Cédula profesional", type: "text", required: true, placeholder: "Cédula profesional" },
      { id: "specialty", label: "Especialidad", type: "text", required: true, placeholder: "Medicina general" },
      { id: "patientName", label: "Nombre del paciente", type: "text", required: true, placeholder: "Nombre ficticio del paciente" },
      { id: "age", label: "Edad", type: "number", required: true, placeholder: "42" },
      { id: "sex", label: "Sexo", type: "select", required: true, options: ["Femenino", "Masculino", "Otro", "No especificado"] }
    ]
  },
  {
    id: "reason-for-consultation",
    title: "Motivo de consulta",
    fields: [
      { id: "mainReason", label: "Motivo principal", type: "textarea", required: true, placeholder: "Motivo principal de la visita" },
      { id: "reportedSymptoms", label: "Síntomas referidos por el paciente", type: "textarea", placeholder: "Síntomas descritos por el paciente" }
    ]
  },
  {
    id: "current-condition",
    title: "Padecimiento actual",
    fields: [
      { id: "currentIllness", label: "Descripción del padecimiento actual", type: "textarea", placeholder: "Describe la condición actual" },
      { id: "evolution", label: "Evolución", type: "textarea", placeholder: "Cronología y evolución" },
      { id: "relevantContext", label: "Contexto relevante", type: "textarea", placeholder: "Contexto clínico o social relevante" }
    ]
  },
  {
    id: "relevant-history",
    title: "Antecedentes relevantes",
    fields: [
      { id: "pathologicalHistory", label: "Antecedentes personales patológicos", type: "textarea" },
      { id: "nonPathologicalHistory", label: "Antecedentes no patológicos", type: "textarea" },
      { id: "familyHistory", label: "Antecedentes familiares", type: "textarea" },
      { id: "allergies", label: "Alergias", type: "textarea" },
      { id: "currentMedications", label: "Medicamentos actuales", type: "textarea" }
    ]
  },
  {
    id: "vital-signs",
    title: "Signos vitales",
    fields: [
      { id: "weight", label: "Peso", type: "vitals", placeholder: "kg" },
      { id: "height", label: "Talla", type: "vitals", placeholder: "cm" },
      { id: "bmi", label: "BMI", type: "vitals" },
      { id: "bloodPressure", label: "Presión arterial", type: "vitals", placeholder: "120/80 mmHg" },
      { id: "heartRate", label: "Frecuencia cardiaca", type: "vitals", placeholder: "lpm" },
      { id: "respiratoryRate", label: "Frecuencia respiratoria", type: "vitals", placeholder: "rpm" },
      { id: "temperature", label: "Temperatura", type: "vitals", placeholder: "C" },
      { id: "oxygenSaturation", label: "Saturación de oxígeno", type: "vitals", placeholder: "%" }
    ]
  },
  {
    id: "physical-examination",
    title: "Exploración física",
    fields: [
      { id: "generalAppearance", label: "Aspecto general", type: "textarea" },
      { id: "headAndNeck", label: "Cabeza y cuello", type: "textarea" },
      { id: "chest", label: "Tórax", type: "textarea" },
      { id: "abdomen", label: "Abdomen", type: "textarea" },
      { id: "extremities", label: "Extremidades", type: "textarea" },
      { id: "neurological", label: "Neurológico", type: "textarea" },
      { id: "otherFindings", label: "Otros hallazgos", type: "textarea" }
    ]
  },
  {
    id: "clinical-assessment",
    title: "Valoración clínica",
    fields: [
      { id: "clinicalImpression", label: "Impresión clínica", type: "textarea", required: true },
      { id: "diagnosis", label: "Diagnóstico", type: "text", placeholder: "Diagnóstico clínico capturado por el médico" },
      { id: "icd10", label: "Código CIE-10 opcional", type: "text", placeholder: "Código opcional" },
      { id: "requestedStudies", label: "Estudios solicitados", type: "textarea" }
    ]
  },
  {
    id: "plan-and-treatment",
    title: "Plan y tratamiento",
    fields: [
      { id: "treatmentPlan", label: "Plan de tratamiento", type: "textarea" },
      { id: "medications", label: "Medicamentos", type: "textarea" },
      { id: "recommendations", label: "Recomendaciones", type: "textarea" },
      { id: "warningSigns", label: "Signos de alarma", type: "textarea" },
      { id: "followUpAppointment", label: "Cita de seguimiento", type: "date" }
    ]
  },
  {
    id: "closure",
    title: "Cierre",
    fields: [
      { id: "prognosis", label: "Pronóstico", type: "textarea" },
      { id: "observations", label: "Observaciones", type: "textarea" },
      { id: "signature", label: "Nombre y firma demo del médico", type: "signature" }
    ]
  }
];

function specialtyTemplate(
  id: string,
  name: string,
  specialty: string,
  description: string,
  sections: MedicalNoteSection[]
): MedicalNoteTemplate {
  return {
    id,
    name,
    specialty,
    description,
    sections: [...generalSections, ...sections]
  };
}

export const medicalNoteTemplates: MedicalNoteTemplate[] = [
  {
    id: "general-medicine",
    name: "Nota médica general",
    specialty: "Medicina general",
    description: "Nota clínica integral para consulta general.",
    sections: generalSections
  },
  specialtyTemplate("nutrition", "Nota de nutrición", "Nutrición", "Consulta de nutrición con objetivos, hábitos y resumen de plan.", [
    {
      id: "nutrition-assessment",
      title: "Valoración nutricional",
      fields: [
        { id: "eatingHabits", label: "Hábitos alimenticios", type: "textarea" },
        { id: "dietaryRecall", label: "Recordatorio alimentario de 24 horas", type: "textarea" },
        { id: "physicalActivity", label: "Actividad física", type: "textarea" },
        { id: "bodyMeasurements", label: "Mediciones corporales", type: "textarea" },
        {
          id: "nutritionGoal",
          label: "Objetivo",
          type: "select",
          options: ["Pérdida de grasa", "Ganancia muscular", "Control metabólico", "Rendimiento", "Bienestar general"]
        },
        { id: "nutritionPlanSummary", label: "Resumen del plan nutricional", type: "textarea" },
        { id: "followUpGoals", label: "Objetivos de seguimiento", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate("aesthetic-medicine", "Nota de medicina estética", "Medicina estética", "Plantilla enfocada en procedimientos de medicina estética.", [
    {
      id: "aesthetic-procedure",
      title: "Procedimiento estético",
      fields: [
        { id: "procedureRequested", label: "Procedimiento solicitado", type: "text" },
        { id: "skinType", label: "Tipo de piel", type: "select", options: ["I", "II", "III", "IV", "V", "VI"] },
        { id: "contraindications", label: "Checklist de contraindicaciones", type: "textarea" },
        { id: "previousProcedures", label: "Procedimientos estéticos previos", type: "textarea" },
        { id: "treatmentArea", label: "Área de tratamiento", type: "text" },
        { id: "procedureDetails", label: "Detalles de producto/procedimiento", type: "textarea" },
        { id: "preProcedureNotes", label: "Notas preprocedimiento", type: "textarea" },
        { id: "postProcedureCare", label: "Cuidados postprocedimiento", type: "textarea" },
        { id: "consentReminder", label: "Recordatorio demo de consentimiento informado", type: "checkbox" }
      ]
    }
  ]),
  specialtyTemplate("psychology", "Nota de sesión psicológica", "Psicología", "Nota estructurada de sesión sin sugerencias automáticas de diagnóstico.", [
    {
      id: "psychology-session",
      title: "Sesión psicológica",
      fields: [
        { id: "psychologyReason", label: "Motivo de consulta", type: "textarea" },
        { id: "emotionalState", label: "Estado emocional", type: "textarea" },
        { id: "sleep", label: "Sueño", type: "textarea" },
        { id: "appetite", label: "Apetito", type: "textarea" },
        { id: "riskScreening", label: "Tamizaje de riesgo demo", type: "textarea" },
        { id: "therapeuticApproach", label: "Enfoque terapéutico", type: "textarea" },
        { id: "sessionNotes", label: "Notas de sesión", type: "textarea" },
        { id: "psychologyFollowUp", label: "Plan de seguimiento", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate("dentistry", "Nota odontológica", "Odontología", "Nota de visita dental con procedimiento y seguimiento.", [
    {
      id: "dentistry-record",
      title: "Registro dental",
      fields: [
        { id: "dentalHistory", label: "Antecedentes dentales", type: "textarea" },
        { id: "oralExamination", label: "Exploración oral", type: "textarea" },
        { id: "odontogram", label: "Odontograma demo", type: "textarea" },
        { id: "painScale", label: "Escala de dolor", type: "number", placeholder: "0-10" },
        { id: "procedurePerformed", label: "Procedimiento realizado", type: "textarea" },
        { id: "materialsUsed", label: "Materiales usados", type: "textarea" },
        { id: "postTreatmentIndications", label: "Indicaciones postratamiento", type: "textarea" },
        { id: "nextDentalAppointment", label: "Próxima cita", type: "date" }
      ]
    }
  ]),
  specialtyTemplate("gynecology", "Nota de ginecología", "Ginecología", "Plantilla de consulta ginecológica con antecedentes y seguimiento.", [
    {
      id: "gynecology-record",
      title: "Registro ginecológico",
      fields: [
        { id: "menstrualHistory", label: "Antecedentes menstruales", type: "textarea" },
        { id: "obstetricHistory", label: "Antecedentes obstétricos", type: "textarea" },
        { id: "lastMenstrualPeriod", label: "Última menstruación", type: "date" },
        { id: "contraceptiveMethod", label: "Método anticonceptivo", type: "text" },
        { id: "relevantGynecologySymptoms", label: "Síntomas relevantes", type: "textarea" },
        { id: "gynecologyPhysicalExam", label: "Exploración física demo", type: "textarea" },
        { id: "gynecologyStudies", label: "Estudios solicitados", type: "textarea" },
        { id: "gynecologyFollowUp", label: "Plan de seguimiento", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate("pediatrics", "Nota pediátrica", "Pediatría", "Plantilla de visita pediátrica para tutor, desarrollo y valoración.", [
    {
      id: "pediatrics-record",
      title: "Registro pediátrico",
      fields: [
        { id: "guardianInformation", label: "Información del tutor", type: "textarea" },
        { id: "birthHistory", label: "Antecedentes de nacimiento", type: "textarea" },
        { id: "vaccinationStatus", label: "Estado de vacunación demo", type: "textarea" },
        { id: "growthDevelopment", label: "Notas de crecimiento y desarrollo", type: "textarea" },
        { id: "pediatricWeight", label: "Peso", type: "vitals", placeholder: "kg" },
        { id: "pediatricHeight", label: "Talla", type: "vitals", placeholder: "cm" },
        { id: "pediatricTemperature", label: "Temperatura", type: "vitals", placeholder: "C" },
        { id: "pediatricAssessment", label: "Valoración pediátrica", type: "textarea" },
        { id: "guardianRecommendations", label: "Recomendaciones para padre/madre/tutor", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate(
    "physiotherapy-rehabilitation",
    "Nota de fisioterapia / rehabilitación",
    "Fisioterapia / rehabilitación",
    "Nota de rehabilitación para valoración, plan terapéutico y seguimiento de progreso.",
    [
      {
        id: "rehabilitation-record",
        title: "Registro de rehabilitación",
        fields: [
          { id: "injuryCondition", label: "Lesión o condición", type: "textarea" },
          { id: "rehabPainScale", label: "Escala de dolor", type: "number", placeholder: "0-10" },
          { id: "rangeOfMotion", label: "Rango de movimiento", type: "textarea" },
          { id: "functionalLimitations", label: "Limitaciones funcionales", type: "textarea" },
          { id: "physicalAssessment", label: "Valoración física", type: "textarea" },
          { id: "therapyPlan", label: "Plan terapéutico", type: "textarea" },
          { id: "exercisesPrescribed", label: "Ejercicios prescritos", type: "textarea" },
          { id: "progressNotes", label: "Notas de progreso", type: "textarea" }
        ]
      }
    ]
  )
];

export function getMedicalNoteTemplate(templateId: string) {
  return medicalNoteTemplates.find((template) => template.id === templateId) ?? medicalNoteTemplates[0];
}
