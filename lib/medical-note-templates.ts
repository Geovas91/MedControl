import type { MedicalNoteSection, MedicalNoteTemplate } from "@/types/medical-note";

const generalSections: MedicalNoteSection[] = [
  {
    id: "general-information",
    title: "General information",
    fields: [
      { id: "dateTime", label: "Date and time", type: "text", required: true, placeholder: "June 4, 2026, 10:30" },
      { id: "doctorName", label: "Doctor name", type: "text", required: true, placeholder: "Dr. Alex Morgan" },
      { id: "licenseNumber", label: "Professional license number", type: "text", required: true, placeholder: "Professional license" },
      { id: "specialty", label: "Specialty", type: "text", required: true, placeholder: "General Medicine" },
      { id: "patientName", label: "Patient name", type: "text", required: true, placeholder: "Fictional patient name" },
      { id: "age", label: "Age", type: "number", required: true, placeholder: "42" },
      { id: "sex", label: "Sex", type: "select", required: true, options: ["Female", "Male", "Other", "Not specified"] }
    ]
  },
  {
    id: "reason-for-consultation",
    title: "Reason for consultation",
    fields: [
      { id: "mainReason", label: "Main reason", type: "textarea", required: true, placeholder: "Main reason for the visit" },
      { id: "reportedSymptoms", label: "Symptoms reported by patient", type: "textarea", placeholder: "Symptoms described by the patient" }
    ]
  },
  {
    id: "current-condition",
    title: "Current condition",
    fields: [
      { id: "currentIllness", label: "Current illness description", type: "textarea", placeholder: "Describe the current condition" },
      { id: "evolution", label: "Evolution", type: "textarea", placeholder: "Timeline and evolution" },
      { id: "relevantContext", label: "Relevant context", type: "textarea", placeholder: "Relevant clinical or social context" }
    ]
  },
  {
    id: "relevant-history",
    title: "Relevant history",
    fields: [
      { id: "pathologicalHistory", label: "Personal pathological history", type: "textarea" },
      { id: "nonPathologicalHistory", label: "Non-pathological history", type: "textarea" },
      { id: "familyHistory", label: "Family history", type: "textarea" },
      { id: "allergies", label: "Allergies", type: "textarea" },
      { id: "currentMedications", label: "Current medications", type: "textarea" }
    ]
  },
  {
    id: "vital-signs",
    title: "Vital signs",
    fields: [
      { id: "weight", label: "Weight", type: "vitals", placeholder: "kg" },
      { id: "height", label: "Height", type: "vitals", placeholder: "cm" },
      { id: "bmi", label: "BMI", type: "vitals" },
      { id: "bloodPressure", label: "Blood pressure", type: "vitals", placeholder: "120/80 mmHg" },
      { id: "heartRate", label: "Heart rate", type: "vitals", placeholder: "bpm" },
      { id: "respiratoryRate", label: "Respiratory rate", type: "vitals", placeholder: "rpm" },
      { id: "temperature", label: "Temperature", type: "vitals", placeholder: "C" },
      { id: "oxygenSaturation", label: "Oxygen saturation", type: "vitals", placeholder: "%" }
    ]
  },
  {
    id: "physical-examination",
    title: "Physical examination",
    fields: [
      { id: "generalAppearance", label: "General appearance", type: "textarea" },
      { id: "headAndNeck", label: "Head and neck", type: "textarea" },
      { id: "chest", label: "Chest", type: "textarea" },
      { id: "abdomen", label: "Abdomen", type: "textarea" },
      { id: "extremities", label: "Extremities", type: "textarea" },
      { id: "neurological", label: "Neurological", type: "textarea" },
      { id: "otherFindings", label: "Other findings", type: "textarea" }
    ]
  },
  {
    id: "clinical-assessment",
    title: "Clinical assessment",
    fields: [
      { id: "clinicalImpression", label: "Clinical impression", type: "textarea", required: true },
      { id: "diagnosis", label: "Diagnosis", type: "text", placeholder: "Clinical diagnosis entered by doctor" },
      { id: "icd10", label: "Optional ICD-10 code", type: "text", placeholder: "Optional code" },
      { id: "requestedStudies", label: "Requested studies", type: "textarea" }
    ]
  },
  {
    id: "plan-and-treatment",
    title: "Plan and treatment",
    fields: [
      { id: "treatmentPlan", label: "Treatment plan", type: "textarea" },
      { id: "medications", label: "Medications", type: "textarea" },
      { id: "recommendations", label: "Recommendations", type: "textarea" },
      { id: "warningSigns", label: "Warning signs", type: "textarea" },
      { id: "followUpAppointment", label: "Follow-up appointment", type: "date" }
    ]
  },
  {
    id: "closure",
    title: "Closure",
    fields: [
      { id: "prognosis", label: "Prognosis", type: "textarea" },
      { id: "observations", label: "Observations", type: "textarea" },
      { id: "signature", label: "Doctor name and signature placeholder", type: "signature" }
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
    name: "General medical note",
    specialty: "General Medicine",
    description: "Comprehensive clinical note for a general consultation.",
    sections: generalSections
  },
  specialtyTemplate("nutrition", "Nutrition note", "Nutrition", "Nutrition consultation with goals, habits, and plan summary.", [
    {
      id: "nutrition-assessment",
      title: "Nutrition assessment",
      fields: [
        { id: "eatingHabits", label: "Eating habits", type: "textarea" },
        { id: "dietaryRecall", label: "24-hour dietary recall", type: "textarea" },
        { id: "physicalActivity", label: "Physical activity", type: "textarea" },
        { id: "bodyMeasurements", label: "Body measurements", type: "textarea" },
        {
          id: "nutritionGoal",
          label: "Goal",
          type: "select",
          options: ["Fat loss", "Muscle gain", "Metabolic control", "Performance", "General wellness"]
        },
        { id: "nutritionPlanSummary", label: "Nutrition plan summary", type: "textarea" },
        { id: "followUpGoals", label: "Follow-up goals", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate("aesthetic-medicine", "Aesthetic medicine note", "Aesthetic Medicine", "Procedure-focused aesthetic medicine template.", [
    {
      id: "aesthetic-procedure",
      title: "Aesthetic procedure",
      fields: [
        { id: "procedureRequested", label: "Procedure requested", type: "text" },
        { id: "skinType", label: "Skin type", type: "select", options: ["I", "II", "III", "IV", "V", "VI"] },
        { id: "contraindications", label: "Contraindications checklist", type: "textarea" },
        { id: "previousProcedures", label: "Previous aesthetic procedures", type: "textarea" },
        { id: "treatmentArea", label: "Treatment area", type: "text" },
        { id: "procedureDetails", label: "Product/procedure details", type: "textarea" },
        { id: "preProcedureNotes", label: "Pre-procedure notes", type: "textarea" },
        { id: "postProcedureCare", label: "Post-procedure care", type: "textarea" },
        { id: "consentReminder", label: "Informed consent reminder placeholder", type: "checkbox" }
      ]
    }
  ]),
  specialtyTemplate("psychology", "Psychology session note", "Psychology", "Structured session note without automated diagnosis suggestions.", [
    {
      id: "psychology-session",
      title: "Psychology session",
      fields: [
        { id: "psychologyReason", label: "Reason for consultation", type: "textarea" },
        { id: "emotionalState", label: "Emotional state", type: "textarea" },
        { id: "sleep", label: "Sleep", type: "textarea" },
        { id: "appetite", label: "Appetite", type: "textarea" },
        { id: "riskScreening", label: "Risk screening placeholder", type: "textarea" },
        { id: "therapeuticApproach", label: "Therapeutic approach", type: "textarea" },
        { id: "sessionNotes", label: "Session notes", type: "textarea" },
        { id: "psychologyFollowUp", label: "Follow-up plan", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate("dentistry", "Dentistry note", "Dentistry", "Dental visit note with procedure and follow-up details.", [
    {
      id: "dentistry-record",
      title: "Dental record",
      fields: [
        { id: "dentalHistory", label: "Dental history", type: "textarea" },
        { id: "oralExamination", label: "Oral examination", type: "textarea" },
        { id: "odontogram", label: "Odontogram placeholder", type: "textarea" },
        { id: "painScale", label: "Pain scale", type: "number", placeholder: "0-10" },
        { id: "procedurePerformed", label: "Procedure performed", type: "textarea" },
        { id: "materialsUsed", label: "Materials used", type: "textarea" },
        { id: "postTreatmentIndications", label: "Post-treatment indications", type: "textarea" },
        { id: "nextDentalAppointment", label: "Next appointment", type: "date" }
      ]
    }
  ]),
  specialtyTemplate("gynecology", "Gynecology note", "Gynecology", "Gynecology consultation template with history and follow-up fields.", [
    {
      id: "gynecology-record",
      title: "Gynecology record",
      fields: [
        { id: "menstrualHistory", label: "Menstrual history", type: "textarea" },
        { id: "obstetricHistory", label: "Obstetric history", type: "textarea" },
        { id: "lastMenstrualPeriod", label: "Last menstrual period", type: "date" },
        { id: "contraceptiveMethod", label: "Contraceptive method", type: "text" },
        { id: "relevantGynecologySymptoms", label: "Relevant symptoms", type: "textarea" },
        { id: "gynecologyPhysicalExam", label: "Physical examination placeholder", type: "textarea" },
        { id: "gynecologyStudies", label: "Requested studies", type: "textarea" },
        { id: "gynecologyFollowUp", label: "Follow-up plan", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate("pediatrics", "Pediatrics note", "Pediatrics", "Pediatric visit template for guardian, development, and assessment notes.", [
    {
      id: "pediatrics-record",
      title: "Pediatrics record",
      fields: [
        { id: "guardianInformation", label: "Guardian information", type: "textarea" },
        { id: "birthHistory", label: "Birth history", type: "textarea" },
        { id: "vaccinationStatus", label: "Vaccination status placeholder", type: "textarea" },
        { id: "growthDevelopment", label: "Growth and development notes", type: "textarea" },
        { id: "pediatricWeight", label: "Weight", type: "vitals", placeholder: "kg" },
        { id: "pediatricHeight", label: "Height", type: "vitals", placeholder: "cm" },
        { id: "pediatricTemperature", label: "Temperature", type: "vitals", placeholder: "C" },
        { id: "pediatricAssessment", label: "Pediatric assessment", type: "textarea" },
        { id: "guardianRecommendations", label: "Parent/guardian recommendations", type: "textarea" }
      ]
    }
  ]),
  specialtyTemplate(
    "physiotherapy-rehabilitation",
    "Physiotherapy / Rehabilitation note",
    "Physiotherapy / Rehabilitation",
    "Rehabilitation note for assessment, therapy plan, and progress tracking.",
    [
      {
        id: "rehabilitation-record",
        title: "Rehabilitation record",
        fields: [
          { id: "injuryCondition", label: "Injury or condition", type: "textarea" },
          { id: "rehabPainScale", label: "Pain scale", type: "number", placeholder: "0-10" },
          { id: "rangeOfMotion", label: "Range of motion", type: "textarea" },
          { id: "functionalLimitations", label: "Functional limitations", type: "textarea" },
          { id: "physicalAssessment", label: "Physical assessment", type: "textarea" },
          { id: "therapyPlan", label: "Therapy plan", type: "textarea" },
          { id: "exercisesPrescribed", label: "Exercises prescribed", type: "textarea" },
          { id: "progressNotes", label: "Progress notes", type: "textarea" }
        ]
      }
    ]
  )
];

export function getMedicalNoteTemplate(templateId: string) {
  return medicalNoteTemplates.find((template) => template.id === templateId) ?? medicalNoteTemplates[0];
}
