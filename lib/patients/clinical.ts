export type HistoryStatus = "draft" | "pending" | "completed";
export type Reliability = "reliable" | "partially_reliable" | "unreliable" | "unknown";

export function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}
export function formBoolean(formData: FormData, name: string) { return formData.get(name) === "on"; }
export function formNullableBoolean(formData: FormData, name: string) {
  const value=formText(formData,name); return value==="yes"?true:value==="no"?false:null;
}
export function formLines(formData: FormData, name: string) {
  return formText(formData, name).split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 100);
}
export function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function calculateBmi(weightKg: number | null, heightCm: number | null) {
  if (weightKg === null || heightCm === null || weightKg <= 0 || heightCm <= 0) return null;
  return Math.round((weightKg / ((heightCm / 100) ** 2)) * 100) / 100;
}

export type VitalInput = {
  measuredAt: string; weightKg: number | null; heightCm: number | null; temperatureC: number | null;
  systolic: number | null; diastolic: number | null; heartRate: number | null; respiratoryRate: number | null;
  oxygenSaturation: number | null; capillaryGlucose: number | null; painScale: number | null;
  notes: string; outlierJustification: string;
};

export function parseVitalForm(formData: FormData): VitalInput {
  const n = (name: string) => optionalNumber(formText(formData, name));
  return { measuredAt: formText(formData,"measured_at"), weightKg:n("weight_kg"), heightCm:n("height_cm"), temperatureC:n("temperature_c"),
    systolic:n("systolic_mmhg"), diastolic:n("diastolic_mmhg"), heartRate:n("heart_rate_bpm"), respiratoryRate:n("respiratory_rate_bpm"),
    oxygenSaturation:n("oxygen_saturation_percent"), capillaryGlucose:n("capillary_glucose_mg_dl"), painScale:n("pain_scale"),
    notes:formText(formData,"notes"), outlierJustification:formText(formData,"outlier_justification") };
}

export function validateVitalInput(input: VitalInput) {
  const measurements = [input.weightKg,input.heightCm,input.temperatureC,input.systolic,input.diastolic,input.heartRate,input.respiratoryRate,input.oxygenSaturation,input.capillaryGlucose,input.painScale];
  if (!measurements.some(value => value !== null)) return "Captura al menos una medición.";
  if (!input.measuredAt || Number.isNaN(new Date(input.measuredAt).getTime())) return "Indica una fecha y hora válidas.";
  if (input.painScale !== null && (!Number.isInteger(input.painScale) || input.painScale < 0 || input.painScale > 10)) return "La escala de dolor debe ser un entero entre 0 y 10.";
  if (input.oxygenSaturation !== null && (input.oxygenSaturation < 0 || input.oxygenSaturation > 100)) return "La saturación debe estar entre 0 y 100 %.";
  const outlier = (input.weightKg !== null && (input.weightKg < .2 || input.weightKg > 500)) || (input.heightCm !== null && (input.heightCm < 20 || input.heightCm > 250)) ||
    (input.temperatureC !== null && (input.temperatureC < 25 || input.temperatureC > 45)) || (input.systolic !== null && (input.systolic < 40 || input.systolic > 300)) ||
    (input.diastolic !== null && (input.diastolic < 20 || input.diastolic > 200)) || (input.heartRate !== null && (input.heartRate < 20 || input.heartRate > 300)) ||
    (input.respiratoryRate !== null && (input.respiratoryRate < 4 || input.respiratoryRate > 100)) || (input.capillaryGlucose !== null && (input.capillaryGlucose < 10 || input.capillaryGlucose > 1000));
  if (outlier && !input.outlierJustification) return "Agrega una justificación para conservar una medición fuera del rango habitual.";
  return null;
}
