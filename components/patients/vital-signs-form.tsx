"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createVitalAction,type ClinicalActionState } from "@/app/dashboard/patients/[id]/actions";
import { Button } from "@/components/ui/button";
import { Field,Input,Textarea } from "@/components/ui/input";
const initial:ClinicalActionState={};
function Submit(){const {pending}=useFormStatus();return <Button type="submit" disabled={pending}>{pending?"Registrando...":"Registrar medición"}</Button>}
export function VitalSignsForm({patientId}:{patientId:string}){const [state,action]=useActionState(createVitalAction.bind(null,patientId),initial);const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());const value=now.toISOString().slice(0,16);return <form action={action} className="clinical-surface grid gap-4 p-4 sm:p-5">
 <div><h3 className="font-bold">Nueva medición</h3><p className="mt-1 text-sm text-slate-500">El IMC se calcula automáticamente cuando hay peso y estatura. Los campos clínicos son opcionales, pero debes capturar al menos una medición.</p></div>
 {state.error?<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>:null}
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Fecha y hora *" htmlFor="measured_at"><Input id="measured_at" name="measured_at" type="datetime-local" defaultValue={value} required/></Field>
 {([['weight_kg','Peso (kg)','0.01'],['height_cm','Estatura (cm)','0.01'],['temperature_c','Temperatura (°C)','0.1'],['systolic_mmhg','Presión sistólica','1'],['diastolic_mmhg','Presión diastólica','1'],['heart_rate_bpm','Frecuencia cardiaca','1'],['respiratory_rate_bpm','Frecuencia respiratoria','1'],['oxygen_saturation_percent','Saturación O₂ (%)','0.01'],['capillary_glucose_mg_dl','Glucosa capilar (mg/dL)','0.1'],['pain_scale','Dolor (0-10)','1']] as const).map(([name,label,step])=><Field key={name} label={label} htmlFor={name}><Input id={name} name={name} type="number" step={step}/></Field>)}</div>
 <div className="grid gap-4 md:grid-cols-2"><Field label="Notas" htmlFor="notes"><Textarea id="notes" name="notes" rows={3}/></Field><Field label="Justificación de valor excepcional" htmlFor="outlier_justification"><Textarea id="outlier_justification" name="outlier_justification" rows={3}/></Field></div><div className="flex justify-end"><Submit/></div>
 </form>}
