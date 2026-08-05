"use client";

import { useActionState } from "react";
import { updatePatientAction } from "@/app/dashboard/patients/[id]/edit/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { getPatientSexOptionLabel, patientSexValues, type PatientFormField, type PatientFormState, type PatientFormValues } from "@/lib/patients/create";
import type { PatientDoctorOption } from "@/lib/server/patient-form-options";

type Props = { patientId: string; initialValues: PatientFormValues; doctors: PatientDoctorOption[]; clinicToday: string };
const initialState: PatientFormState = {};

export function EditPatientForm({ patientId, initialValues, doctors, clinicToday }: Props) {
  const [state, formAction] = useActionState(updatePatientAction.bind(null, patientId), initialState);
  const v = state.values ?? initialValues;
  const error = (field: PatientFormField) => state.fieldErrors?.[field] ? <span className="text-xs text-rose-700">{state.fieldErrors[field]}</span> : null;
  return <form action={formAction} className="glass-panel grid gap-6 p-4 sm:p-6">
    <input type="hidden" name="flow_intent" value="later" />
    <div><h2 className="text-lg font-bold text-ink">Datos personales y administrativos</h2><p className="mt-1 text-sm text-slate-500">Los campos clínicos se actualizan desde la historia inicial.</p></div>
    {state.error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Nombres *" htmlFor="first_names"><Input id="first_names" name="first_names" defaultValue={v.firstNames} required />{error("firstNames")}</Field>
      <Field label="Primer apellido *" htmlFor="paternal_surname"><Input id="paternal_surname" name="paternal_surname" defaultValue={v.paternalSurname} required />{error("paternalSurname")}</Field>
      <Field label="Segundo apellido" htmlFor="maternal_surname"><Input id="maternal_surname" name="maternal_surname" defaultValue={v.maternalSurname} />{error("maternalSurname")}</Field>
      <Field label="Fecha de nacimiento *" htmlFor="date_of_birth"><Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={v.dateOfBirth} max={clinicToday} required />{error("dateOfBirth")}</Field>
      <Field label="Sexo al nacimiento *" htmlFor="sex"><Select id="sex" name="sex" defaultValue={v.sex}>{patientSexValues.map(x=><option key={x} value={x}>{getPatientSexOptionLabel(x)}</option>)}</Select>{error("sex")}</Field>
      <Field label="Género" htmlFor="gender_identity"><Input id="gender_identity" name="gender_identity" defaultValue={v.genderIdentity} />{error("genderIdentity")}</Field>
      <Field label="Estado" htmlFor="status"><Select id="status" name="status" defaultValue={v.status}><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="follow_up">Seguimiento</option></Select>{error("status")}</Field>
      <Field label="Profesional responsable" htmlFor="primary_doctor_id"><Select id="primary_doctor_id" name="primary_doctor_id" defaultValue={v.primaryDoctorId}><option value="">Por asignar</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</Select>{error("primaryDoctorId")}</Field>
      <Field label="Teléfono *" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={v.phone} required />{error("phone")}</Field>
      <Field label="Correo" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={v.email} />{error("email")}</Field>
      <div className="md:col-span-2"><Field label="Dirección" htmlFor="address"><Textarea id="address" name="address" defaultValue={v.address} rows={3} />{error("address")}</Field></div>
      <Field label="Estado civil" htmlFor="marital_status"><Input id="marital_status" name="marital_status" defaultValue={v.maritalStatus} />{error("maritalStatus")}</Field>
      <Field label="Ocupación" htmlFor="occupation"><Input id="occupation" name="occupation" defaultValue={v.occupation} />{error("occupation")}</Field>
      <Field label="Escolaridad" htmlFor="education_level"><Input id="education_level" name="education_level" defaultValue={v.educationLevel} />{error("educationLevel")}</Field>
    </div>
    <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4"><legend className="px-2 font-semibold">Contacto de emergencia</legend><div className="grid gap-4 md:grid-cols-3">
      <Field label="Nombre *" htmlFor="emergency_contact_name"><Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={v.emergencyContactName} required />{error("emergencyContactName")}</Field>
      <Field label="Parentesco *" htmlFor="emergency_contact_relationship"><Input id="emergency_contact_relationship" name="emergency_contact_relationship" defaultValue={v.emergencyContactRelationship} required />{error("emergencyContactRelationship")}</Field>
      <Field label="Teléfono *" htmlFor="emergency_contact_phone"><Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={v.emergencyContactPhone} required />{error("emergencyContactPhone")}</Field>
    </div></fieldset>
    <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row"><ButtonLink href={`/dashboard/patients/${patientId}`} variant="secondary">Cancelar</ButtonLink><div className="sm:w-52"><AuthSubmitButton idleLabel="Guardar cambios" pendingLabel="Guardando..." /></div></div>
  </form>;
}
