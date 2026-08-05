import "server-only";
import { canViewClinicalRecord } from "@/lib/clinical-record/permissions";
import { formLines, formNullableBoolean, formText, parseVitalForm, validateVitalInput, type HistoryStatus, type Reliability } from "@/lib/patients/clinical";
import { getActiveTenantContext } from "@/lib/server/active-tenant";
import { getClinicEntitlements, canCreateWithEntitlements } from "@/lib/server/entitlements";
import { createClient } from "@/lib/supabase/server";

export type ClinicalBundle = {
  record: { id:string; opened_at:string; status:string };
  history: { id:string; status:HistoryStatus; opened_at:string; completed_at:string|null };
  identification: Record<string, any>; family: Record<string, any>; pathological: Record<string, any>;
  nonPathological: Record<string, any>; assessment: Record<string, any>;
  alerts: Array<{id:string;alert_type:"allergy"|"active_condition"|"current_medication";name:string;details:string|null}>;
  vitals: Array<Record<string, any>>;
  professionals: Array<{id:string;name:string}>;
};

export async function getPatientClinicalBundle(patientId:string): Promise<{state:"ready";data:ClinicalBundle}|{state:"forbidden"|"not_found"|"error";data:null}> {
  const context=await getActiveTenantContext();
  if(context.state!=="ready") return {state:"error",data:null};
  if(!canViewClinicalRecord(context.tenant.membership.role)) return {state:"forbidden",data:null};
  const db:any=await createClient(); const clinicId=context.tenant.clinic.id;
  const recordResult=await db.from("clinical_records").select("id, opened_at, status").eq("clinic_id",clinicId).eq("patient_id",patientId).eq("status","active").is("archived_at",null).maybeSingle();
  if(recordResult.error) return {state:"error",data:null}; if(!recordResult.data) return {state:"not_found",data:null};
  const historyResult=await db.from("initial_clinical_histories").select("id,status,opened_at,completed_at").eq("clinic_id",clinicId).eq("clinical_record_id",recordResult.data.id).is("archived_at",null).maybeSingle();
  if(historyResult.error||!historyResult.data) return {state:"error",data:null}; const historyId=historyResult.data.id;
  const [identification,family,pathological,nonPathological,assessment,alerts,vitals,professionals]=await Promise.all([
    db.from("clinical_history_identification").select("*").eq("clinic_id",clinicId).eq("history_id",historyId).maybeSingle(),
    db.from("family_medical_histories").select("*").eq("clinic_id",clinicId).eq("history_id",historyId).maybeSingle(),
    db.from("pathological_histories").select("*").eq("clinic_id",clinicId).eq("history_id",historyId).maybeSingle(),
    db.from("non_pathological_histories").select("*").eq("clinic_id",clinicId).eq("history_id",historyId).maybeSingle(),
    db.from("initial_clinical_assessments").select("*").eq("clinic_id",clinicId).eq("history_id",historyId).maybeSingle(),
    db.from("clinical_alerts").select("id,alert_type,name,details").eq("clinic_id",clinicId).eq("clinical_record_id",recordResult.data.id).eq("is_active",true).is("archived_at",null).order("created_at"),
    db.from("vital_sign_measurements").select("*").eq("clinic_id",clinicId).eq("clinical_record_id",recordResult.data.id).is("voided_at",null).order("measured_at",{ascending:false}).limit(50),
    db.from("doctor_public_profiles").select("profile_id,display_name").eq("clinic_id",clinicId).order("display_name")
  ]);
  if([identification,family,pathological,nonPathological,assessment,alerts,vitals,professionals].some(x=>x.error)) return {state:"error",data:null};
  return {state:"ready",data:{record:recordResult.data,history:historyResult.data,identification:identification.data??{},family:family.data??{},pathological:pathological.data??{},nonPathological:nonPathological.data??{},assessment:assessment.data??{},alerts:alerts.data??[],vitals:vitals.data??[],professionals:(professionals.data??[]).filter((x:any)=>x.profile_id).map((x:any)=>({id:x.profile_id,name:x.display_name}))}};
}

export async function saveHistoryForActiveTenant(patientId:string, formData:FormData) {
  const context=await getActiveTenantContext();
  if(context.state!=="ready"||!canViewClinicalRecord(context.tenant.membership.role)) return {ok:false,error:"No tienes permiso para actualizar la historia clínica."};
  if(!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) return {ok:false,error:"La clínica no tiene permisos de escritura disponibles."};
  const status=formText(formData,"status") as HistoryStatus; const reliability=formText(formData,"information_reliability") as Reliability;
  if(!["draft","pending","completed"].includes(status)) return {ok:false,error:"Selecciona un estado válido."};
  if(!["reliable","partially_reliable","unreliable","unknown"].includes(reliability)) return {ok:false,error:"Selecciona la confiabilidad de la información."};
  const db:any=await createClient();
  const {error}=await db.rpc("save_initial_clinical_history",{
    p_clinic_id:context.tenant.clinic.id,p_patient_id:patientId,p_status:status,
    p_information_provider_name:formText(formData,"information_provider_name"),p_information_provider_relationship:formText(formData,"information_provider_relationship"),
    p_information_reliability:reliability,p_responsible_professional_id:formText(formData,"responsible_professional_id")||null,p_blood_type:formText(formData,"blood_type"),
    p_allergies:formLines(formData,"allergies"),p_active_conditions:formLines(formData,"active_conditions"),p_current_medications:formLines(formData,"current_medications"),
    p_family_diabetes:formNullableBoolean(formData,"family_diabetes"),p_family_hypertension:formNullableBoolean(formData,"family_hypertension"),p_family_cardiovascular:formNullableBoolean(formData,"family_cardiovascular"),
    p_family_cancer:formNullableBoolean(formData,"family_cancer"),p_family_neurological:formNullableBoolean(formData,"family_neurological"),p_family_psychiatric:formNullableBoolean(formData,"family_psychiatric"),p_family_hereditary:formNullableBoolean(formData,"family_hereditary"),p_family_details:formText(formData,"family_details"),
    p_chronic_diseases:formText(formData,"chronic_diseases"),p_surgeries:formText(formData,"surgeries"),p_hospitalizations:formText(formData,"hospitalizations"),p_injuries:formText(formData,"injuries"),p_transfusions:formText(formData,"transfusions"),p_relevant_infections:formText(formData,"relevant_infections"),p_disability:formText(formData,"disability"),p_mental_health_history:formText(formData,"mental_health_history"),p_pathological_other:formText(formData,"pathological_other"),
    p_diet:formText(formData,"diet"),p_physical_activity:formText(formData,"physical_activity"),p_tobacco_use:formText(formData,"tobacco_use"),p_alcohol_use:formText(formData,"alcohol_use"),p_substance_use:formText(formData,"substance_use"),p_sleep:formText(formData,"sleep"),p_hygiene:formText(formData,"hygiene"),p_housing:formText(formData,"housing"),p_vaccination:formText(formData,"vaccination"),p_non_pathological_other:formText(formData,"non_pathological_other"),
    p_chief_complaint:formText(formData,"chief_complaint"),p_present_illness:formText(formData,"present_illness"),p_clinical_observations:formText(formData,"clinical_observations"),p_initial_impression:formText(formData,"initial_impression"),p_initial_plan:formText(formData,"initial_plan")
  });
  return error?{ok:false,error:"No fue posible guardar la historia clínica. No se aplicaron cambios parciales."}:{ok:true as const};
}

export async function createVitalForActiveTenant(patientId:string,formData:FormData){
  const context=await getActiveTenantContext(); if(context.state!=="ready"||!canViewClinicalRecord(context.tenant.membership.role)) return {ok:false,error:"No tienes permiso para registrar signos vitales."};
  if(!canCreateWithEntitlements(await getClinicEntitlements(context.tenant.clinic.id))) return {ok:false,error:"La clínica no tiene permisos de escritura disponibles."};
  const input=parseVitalForm(formData); const validation=validateVitalInput(input); if(validation)return {ok:false,error:validation};
  const db:any=await createClient(); const record=await db.from("clinical_records").select("id").eq("clinic_id",context.tenant.clinic.id).eq("patient_id",patientId).eq("status","active").is("archived_at",null).maybeSingle();
  if(record.error||!record.data)return {ok:false,error:"El expediente clínico no está disponible."};
  const {error}=await db.from("vital_sign_measurements").insert({clinic_id:context.tenant.clinic.id,clinical_record_id:record.data.id,patient_id:patientId,measured_at:new Date(input.measuredAt).toISOString(),weight_kg:input.weightKg,height_cm:input.heightCm,temperature_c:input.temperatureC,systolic_mmhg:input.systolic,diastolic_mmhg:input.diastolic,heart_rate_bpm:input.heartRate,respiratory_rate_bpm:input.respiratoryRate,oxygen_saturation_percent:input.oxygenSaturation,capillary_glucose_mg_dl:input.capillaryGlucose,pain_scale:input.painScale,notes:input.notes||null,outlier_justification:input.outlierJustification||null,recorded_by:context.user.id,created_by:context.user.id});
  return error?{ok:false,error:"No fue posible registrar la medición."}:{ok:true as const};
}
