"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ClipboardPlus, Save, UserPlus } from "lucide-react";
import { createPatientAction } from "@/app/dashboard/patients/new/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { getPatientSexOptionLabel, patientSexValues, type PatientFieldErrors, type PatientFormField, type PatientFormState } from "@/lib/patients/create";
import { getPatientStatusLabel } from "@/lib/patients/query";
import type { PatientDoctorOption } from "@/lib/server/create-patient";

type Props = { doctors: PatientDoctorOption[]; clinicToday: string };
const initialState: PatientFormState = {};

function errorId(field: PatientFormField) { return `${field}-error`; }
function FieldError({ field, errors }: { field: PatientFormField; errors?: PatientFieldErrors }) {
  const message = errors?.[field];
  return message ? <span id={errorId(field)} className="text-xs font-medium text-rose-700">{message}</span> : null;
}
function a11y(state: PatientFormState, field: PatientFormField) {
  return { "aria-invalid": Boolean(state.fieldErrors?.[field]), "aria-describedby": state.fieldErrors?.[field] ? errorId(field) : undefined };
}

function SubmitChoices() {
  const { pending } = useFormStatus();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button type="submit" name="flow_intent" value="complete_history" disabled={pending} className="min-h-12">
        <ClipboardPlus className="h-4 w-4" />{pending ? "Guardando..." : "Guardar y completar historia clínica"}
      </Button>
      <Button type="submit" name="flow_intent" value="later" disabled={pending} variant="secondary" className="min-h-12">
        <Save className="h-4 w-4" />{pending ? "Guardando..." : "Guardar y hacerlo después"}
      </Button>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white/80 p-4 sm:p-5"><legend className="px-2 font-bold text-ink">{title}</legend><p className="text-sm text-slate-500">{description}</p>{children}</fieldset>;
}

export function CreatePatientForm({ doctors, clinicToday }: Props) {
  const [state, formAction] = useActionState(createPatientAction, initialState);
  const v = state.values;
  return (
    <form action={formAction} className="glass-panel grid gap-5 p-4 sm:p-6" noValidate>
      <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-clinic"><UserPlus className="h-5 w-5" /></div><div><h2 className="font-bold text-ink">Alta administrativa</h2><p className="mt-1 text-sm text-slate-500">El expediente y la historia inicial en borrador se crearán automáticamente.</p><p className="mt-1 text-xs text-slate-500">Los campos con * son obligatorios.</p></div></div>
      {state.error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}

      <Section title="Identidad" description="Datos legales y demográficos del paciente.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombres *" htmlFor="first_names"><Input id="first_names" name="first_names" defaultValue={v?.firstNames ?? ""} maxLength={120} autoComplete="given-name" required {...a11y(state,"firstNames")} /><FieldError field="firstNames" errors={state.fieldErrors} /></Field>
          <Field label="Primer apellido *" htmlFor="paternal_surname"><Input id="paternal_surname" name="paternal_surname" defaultValue={v?.paternalSurname ?? ""} maxLength={80} autoComplete="family-name" required {...a11y(state,"paternalSurname")} /><FieldError field="paternalSurname" errors={state.fieldErrors} /></Field>
          <Field label="Segundo apellido" htmlFor="maternal_surname"><Input id="maternal_surname" name="maternal_surname" defaultValue={v?.maternalSurname ?? ""} maxLength={80} {...a11y(state,"maternalSurname")} /><FieldError field="maternalSurname" errors={state.fieldErrors} /></Field>
          <Field label="Fecha de nacimiento *" htmlFor="date_of_birth"><Input id="date_of_birth" name="date_of_birth" type="date" defaultValue={v?.dateOfBirth ?? ""} max={clinicToday} required {...a11y(state,"dateOfBirth")} /><FieldError field="dateOfBirth" errors={state.fieldErrors} /></Field>
          <Field label="Sexo al nacimiento *" htmlFor="sex"><Select id="sex" name="sex" defaultValue={v?.sex ?? "unspecified"} required {...a11y(state,"sex")}>{patientSexValues.map(x=><option key={x} value={x}>{getPatientSexOptionLabel(x)}</option>)}</Select><FieldError field="sex" errors={state.fieldErrors} /></Field>
          <Field label="Género (opcional)" htmlFor="gender_identity"><Input id="gender_identity" name="gender_identity" defaultValue={v?.genderIdentity ?? ""} maxLength={100} {...a11y(state,"genderIdentity")} /><FieldError field="genderIdentity" errors={state.fieldErrors} /></Field>
          <Field label="Estado *" htmlFor="status"><Select id="status" name="status" defaultValue={v?.status ?? "active"} required {...a11y(state,"status")}><option value="active">{getPatientStatusLabel("active")}</option><option value="inactive">{getPatientStatusLabel("inactive")}</option></Select><FieldError field="status" errors={state.fieldErrors} /></Field>
          <Field label="Profesional responsable" htmlFor="primary_doctor_id"><Select id="primary_doctor_id" name="primary_doctor_id" defaultValue={v?.primaryDoctorId ?? ""} {...a11y(state,"primaryDoctorId")}><option value="">Por asignar</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</Select><FieldError field="primaryDoctorId" errors={state.fieldErrors} /></Field>
        </div>
      </Section>

      <Section title="Contacto y datos administrativos" description="El identificador interno se genera de forma segura al guardar.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Teléfono *" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={v?.phone ?? ""} autoComplete="tel" placeholder="+525500000000" required {...a11y(state,"phone")} /><FieldError field="phone" errors={state.fieldErrors} /></Field>
          <Field label="Correo" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={v?.email ?? ""} autoComplete="email" maxLength={254} {...a11y(state,"email")} /><FieldError field="email" errors={state.fieldErrors} /></Field>
          <div className="md:col-span-2"><Field label="Dirección" htmlFor="address"><Textarea id="address" name="address" defaultValue={v?.address ?? ""} rows={3} maxLength={500} autoComplete="street-address" {...a11y(state,"address")} /><FieldError field="address" errors={state.fieldErrors} /></Field></div>
          <Field label="Estado civil" htmlFor="marital_status"><Input id="marital_status" name="marital_status" defaultValue={v?.maritalStatus ?? ""} maxLength={80} {...a11y(state,"maritalStatus")} /><FieldError field="maritalStatus" errors={state.fieldErrors} /></Field>
          <Field label="Ocupación" htmlFor="occupation"><Input id="occupation" name="occupation" defaultValue={v?.occupation ?? ""} maxLength={120} {...a11y(state,"occupation")} /><FieldError field="occupation" errors={state.fieldErrors} /></Field>
          <Field label="Escolaridad" htmlFor="education_level"><Input id="education_level" name="education_level" defaultValue={v?.educationLevel ?? ""} maxLength={120} {...a11y(state,"educationLevel")} /><FieldError field="educationLevel" errors={state.fieldErrors} /></Field>
        </div>
      </Section>

      <Section title="Contacto de emergencia" description="Persona a quien contactar ante una situación urgente.">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre *" htmlFor="emergency_contact_name"><Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={v?.emergencyContactName ?? ""} maxLength={160} required {...a11y(state,"emergencyContactName")} /><FieldError field="emergencyContactName" errors={state.fieldErrors} /></Field>
          <Field label="Parentesco *" htmlFor="emergency_contact_relationship"><Input id="emergency_contact_relationship" name="emergency_contact_relationship" defaultValue={v?.emergencyContactRelationship ?? ""} maxLength={80} required {...a11y(state,"emergencyContactRelationship")} /><FieldError field="emergencyContactRelationship" errors={state.fieldErrors} /></Field>
          <Field label="Teléfono *" htmlFor="emergency_contact_phone"><Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={v?.emergencyContactPhone ?? ""} required {...a11y(state,"emergencyContactPhone")} /><FieldError field="emergencyContactPhone" errors={state.fieldErrors} /></Field>
        </div>
      </Section>
      <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-800">No se crearán consultas, notas, diagnósticos ni signos vitales ficticios. La operación se confirma solo si paciente, expediente e historia inicial se guardan juntos.</p>
      <FieldError field="flowIntent" errors={state.fieldErrors} />
      <SubmitChoices />
    </form>
  );
}
