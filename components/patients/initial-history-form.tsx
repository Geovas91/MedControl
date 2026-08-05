"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveInitialHistoryAction, type ClinicalActionState } from "@/app/dashboard/patients/[id]/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { ClinicalBundle } from "@/lib/server/patient-clinical";

function Submit(){const {pending}=useFormStatus();return <Button type="submit" disabled={pending}>{pending?"Guardando borrador...":"Guardar historia clínica"}</Button>}
const initial:ClinicalActionState={};
const familyFields=[['family_diabetes','Diabetes','diabetes'],['family_hypertension','Hipertensión','hypertension'],['family_cardiovascular','Enfermedades cardiovasculares','cardiovascular_disease'],['family_cancer','Cáncer','cancer'],['family_neurological','Enfermedades neurológicas','neurological_disease'],['family_psychiatric','Trastornos psiquiátricos','psychiatric_disorders'],['family_hereditary','Enfermedades hereditarias','hereditary_diseases']] as const;
const pathologicalFields=[['chronic_diseases','Enfermedades crónicas'],['surgeries','Cirugías'],['hospitalizations','Hospitalizaciones'],['injuries','Traumatismos'],['transfusions','Transfusiones'],['relevant_infections','Infecciones relevantes'],['disability','Discapacidad'],['mental_health_history','Antecedentes de salud mental'],['pathological_other','Otros']] as const;
const nonPathologicalFields=[['diet','Alimentación'],['physical_activity','Actividad física'],['tobacco_use','Tabaquismo'],['alcohol_use','Alcohol'],['substance_use','Sustancias'],['sleep','Sueño'],['hygiene','Higiene'],['housing','Vivienda'],['vaccination','Vacunación'],['non_pathological_other','Otros']] as const;
const assessmentFields=[['chief_complaint','Motivo de consulta'],['present_illness','Padecimiento actual'],['clinical_observations','Observaciones clínicas'],['initial_impression','Impresión inicial (opcional)'],['initial_plan','Plan inicial (opcional)']] as const;
function lines(bundle:ClinicalBundle,type:string){return bundle.alerts.filter(a=>a.alert_type===type).map(a=>a.name).join('\n')}

export function InitialHistoryForm({patientId,bundle}:{patientId:string;bundle:ClinicalBundle}){
 const [state,action]=useActionState(saveInitialHistoryAction.bind(null,patientId),initial); const i=bundle.identification;
 return <form action={action} className="grid gap-5">
  {state.error?<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>:null}
  <section className="clinical-surface grid gap-4 p-4 sm:p-5"><div><h3 className="font-bold">Identificación clínica</h3><p className="mt-1 text-sm text-slate-500">Fecha de apertura: {i.opening_date??'Sin registro'}</p></div><div className="grid gap-4 md:grid-cols-2">
   <Field label="Responsable que proporciona la información" htmlFor="information_provider_name"><Input id="information_provider_name" name="information_provider_name" defaultValue={i.information_provider_name??''}/></Field>
   <Field label="Parentesco con el paciente" htmlFor="information_provider_relationship"><Input id="information_provider_relationship" name="information_provider_relationship" defaultValue={i.information_provider_relationship??''}/></Field>
   <Field label="Confiabilidad" htmlFor="information_reliability"><Select id="information_reliability" name="information_reliability" defaultValue={i.information_reliability??'unknown'}><option value="unknown">Sin evaluar</option><option value="reliable">Confiable</option><option value="partially_reliable">Parcialmente confiable</option><option value="unreliable">No confiable</option></Select></Field>
   <Field label="Profesional responsable" htmlFor="responsible_professional_id"><Select id="responsible_professional_id" name="responsible_professional_id" defaultValue={i.responsible_professional_id??''}><option value="">Por asignar</option>{bundle.professionals.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
   <Field label="Grupo sanguíneo (opcional)" htmlFor="blood_type"><Input id="blood_type" name="blood_type" defaultValue={i.blood_type??''} maxLength={20}/></Field>
   <Field label="Estado de la historia" htmlFor="status"><Select id="status" name="status" defaultValue={bundle.history.status}><option value="draft">Borrador</option><option value="pending">Pendiente</option><option value="completed">Completada</option></Select></Field>
  </div></section>
  <section className="clinical-surface grid gap-4 p-4 sm:p-5"><div><h3 className="font-bold">Alertas clínicas</h3><p className="text-sm text-slate-500">Registra un elemento por línea.</p></div><div className="grid gap-4 md:grid-cols-3">
   <Field label="Alergias" htmlFor="allergies"><Textarea id="allergies" name="allergies" defaultValue={lines(bundle,'allergy')} rows={5}/></Field>
   <Field label="Enfermedades activas" htmlFor="active_conditions"><Textarea id="active_conditions" name="active_conditions" defaultValue={lines(bundle,'active_condition')} rows={5}/></Field>
   <Field label="Medicamentos actuales" htmlFor="current_medications"><Textarea id="current_medications" name="current_medications" defaultValue={lines(bundle,'current_medication')} rows={5}/></Field>
  </div></section>
  <section className="clinical-surface grid gap-4 p-4 sm:p-5"><h3 className="font-bold">Antecedentes heredofamiliares</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{familyFields.map(([name,label,key])=><Field key={name} label={label} htmlFor={name}><Select id={name} name={name} defaultValue={bundle.family[key]===true?'yes':bundle.family[key]===false?'no':''}><option value="">Sin registrar</option><option value="yes">Sí</option><option value="no">No</option></Select></Field>)}</div><Field label="Otros y detalles" htmlFor="family_details"><Textarea id="family_details" name="family_details" defaultValue={bundle.family.details??''}/></Field></section>
  <section className="clinical-surface grid gap-4 p-4 sm:p-5"><h3 className="font-bold">Antecedentes personales patológicos</h3><div className="grid gap-4 md:grid-cols-2">{pathologicalFields.map(([name,label])=><Field key={name} label={label} htmlFor={name}><Textarea id={name} name={name} defaultValue={bundle.pathological[name==='pathological_other'?'other_history':name]??''} rows={3}/></Field>)}</div></section>
  <section className="clinical-surface grid gap-4 p-4 sm:p-5"><h3 className="font-bold">Antecedentes personales no patológicos</h3><div className="grid gap-4 md:grid-cols-2">{nonPathologicalFields.map(([name,label])=><Field key={name} label={label} htmlFor={name}><Textarea id={name} name={name} defaultValue={bundle.nonPathological[name==='non_pathological_other'?'other_history':name]??''} rows={3}/></Field>)}</div></section>
  <section className="clinical-surface grid gap-4 p-4 sm:p-5"><h3 className="font-bold">Evaluación inicial</h3><div className="grid gap-4 md:grid-cols-2">{assessmentFields.map(([name,label])=><Field key={name} label={label} htmlFor={name}><Textarea id={name} name={name} defaultValue={bundle.assessment[name]??''} rows={4}/></Field>)}</div></section>
  <div className="sticky bottom-3 z-10 flex justify-end rounded-xl border border-white/80 bg-white/90 p-3 shadow-lg backdrop-blur"><Submit/></div>
 </form>
}
