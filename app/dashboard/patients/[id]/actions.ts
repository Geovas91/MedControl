"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveHistoryForActiveTenant, createVitalForActiveTenant } from "@/lib/server/patient-clinical";

export type ClinicalActionState={error?:string};
export async function saveInitialHistoryAction(patientId:string,_state:ClinicalActionState,formData:FormData):Promise<ClinicalActionState>{
  const result=await saveHistoryForActiveTenant(patientId,formData); if(!result.ok)return {error:result.error};
  revalidatePath(`/dashboard/patients/${patientId}`); redirect(`/dashboard/patients/${patientId}?tab=historia&history_saved=1`);
}
export async function createVitalAction(patientId:string,_state:ClinicalActionState,formData:FormData):Promise<ClinicalActionState>{
  const result=await createVitalForActiveTenant(patientId,formData); if(!result.ok)return {error:result.error};
  revalidatePath(`/dashboard/patients/${patientId}`); redirect(`/dashboard/patients/${patientId}?tab=signos-vitales&vital_created=1`);
}
