"use client";

import { useActionState } from "react";
import { Globe2 } from "lucide-react";
import { saveDirectoryProfileAction } from "@/app/dashboard/directory/actions";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { DoctorPublicProfile } from "@/types/directory";

type DirectoryProfileFormProps = {
  profile: DoctorPublicProfile | null;
  defaultName: string;
  publicUrl: string | null;
  canEdit: boolean;
  clinicMemberId: string;
};

function publicListToText(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

export function DirectoryProfileForm({ profile, defaultName, publicUrl, canEdit, clinicMemberId }: DirectoryProfileFormProps) {
  const [state, formAction] = useActionState(saveDirectoryProfileAction, {});

  return (
    <form action={formAction} className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-clinic">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-ink">Perfil público</h2>
            <p className="text-sm text-slate-500">Controla los datos visibles en el directorio médico.</p>
          </div>
        </div>
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-clinic hover:text-teal-800"
          >
            Ver perfil público
          </a>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Solo propietarios y administradores pueden editar el perfil público.
        </p>
      ) : null}
      {state.error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p> : null}

      <fieldset disabled={!canEdit} className="grid gap-6 disabled:opacity-70">
        <input type="hidden" name="clinic_member_id" value={clinicMemberId} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre visible" htmlFor="display_name">
            <Input
              id="display_name"
              name="display_name"
              defaultValue={profile?.display_name ?? defaultName}
              placeholder="Dra. Ana López"
              required
            />
          </Field>
          <Field label="Título profesional" htmlFor="professional_title">
            <Input
              id="professional_title"
              name="professional_title"
              defaultValue={profile?.professional_title ?? ""}
              placeholder="Médico especialista"
            />
          </Field>
          <Field label="Especialidad" htmlFor="specialty">
            <Input id="specialty" name="specialty" defaultValue={profile?.specialty ?? ""} placeholder="Pediatría" />
          </Field>
          <Field label="Subespecialidad" htmlFor="subspecialty">
            <Input
              id="subspecialty"
              name="subspecialty"
              defaultValue={profile?.subspecialty ?? ""}
              placeholder="Neonatología"
            />
          </Field>
          <Field label="Cédula profesional" htmlFor="professional_license">
            <Input
              id="professional_license"
              name="professional_license"
              defaultValue={profile?.professional_license ?? ""}
              placeholder="Visible solo si decides publicarla"
            />
          </Field>
          <Field label="Cédula de especialidad" htmlFor="specialty_license">
            <Input id="specialty_license" name="specialty_license" defaultValue={profile?.specialty_license ?? ""} />
          </Field>
          <Field label="Años de experiencia" htmlFor="years_experience">
            <Input
              id="years_experience"
              name="years_experience"
              type="number"
              min={0}
              step={1}
              defaultValue={profile?.years_experience ?? ""}
            />
          </Field>
          <Field label="Modalidad de consulta" htmlFor="consultation_mode">
            <Select id="consultation_mode" name="consultation_mode" defaultValue={profile?.consultation_mode ?? "presencial"}>
              <option value="presencial">Presencial</option>
              <option value="online">Online</option>
              <option value="hibrida">Híbrida</option>
            </Select>
          </Field>
        </div>

        <Field label="Biografía" htmlFor="bio">
          <Textarea
            id="bio"
            name="bio"
            defaultValue={profile?.bio ?? ""}
            placeholder="Describe tu experiencia profesional sin prometer diagnósticos, tratamientos o resultados."
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Idiomas" htmlFor="languages">
            <Input
              id="languages"
              name="languages"
              defaultValue={publicListToText(profile?.languages)}
              placeholder="Español, Inglés"
            />
          </Field>
          <Field label="Servicios" htmlFor="services">
            <Input
              id="services"
              name="services"
              defaultValue={publicListToText(profile?.services)}
              placeholder="Consulta general, seguimiento pediátrico"
            />
          </Field>
          <Field label="Dirección pública" htmlFor="address_line">
            <Input id="address_line" name="address_line" defaultValue={profile?.address_line ?? ""} />
          </Field>
          <Field label="Ciudad" htmlFor="city">
            <Input id="city" name="city" defaultValue={profile?.city ?? ""} placeholder="Guadalajara" />
          </Field>
          <Field label="Estado" htmlFor="state">
            <Input id="state" name="state" defaultValue={profile?.state ?? ""} placeholder="Jalisco" />
          </Field>
          <Field label="WhatsApp público" htmlFor="whatsapp">
            <Input id="whatsapp" name="whatsapp" defaultValue={profile?.whatsapp ?? ""} placeholder="521XXXXXXXXXX" />
          </Field>
          <Field label="Teléfono público" htmlFor="phone">
            <Input id="phone" name="phone" defaultValue={profile?.phone ?? ""} />
          </Field>
          <Field label="Email público opcional" htmlFor="public_email">
            <Input id="public_email" name="public_email" type="email" defaultValue={profile?.public_email ?? ""} />
          </Field>
          <Field label="Sitio web público opcional" htmlFor="website_url">
            <Input id="website_url" name="website_url" type="url" defaultValue={profile?.website_url ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          <label className="flex items-center gap-3 font-medium">
            <input
              type="checkbox"
              name="accepts_new_patients"
              defaultChecked={profile?.accepts_new_patients ?? true}
              className="h-4 w-4 rounded border-slate-300 text-clinic"
            />
            Acepta nuevos pacientes
          </label>
          <label className="flex items-center gap-3 font-medium">
            <input
              type="checkbox"
              name="is_published"
              defaultChecked={profile?.is_published ?? false}
              className="h-4 w-4 rounded border-slate-300 text-clinic"
            />
            Publicado en el directorio
          </label>
          <p className="text-xs text-slate-500">
            Para publicar necesitas nombre visible y especialidad. No agregues datos clínicos de pacientes.
          </p>
        </div>
      </fieldset>

      <div>
        <AuthSubmitButton idleLabel="Guardar perfil público" pendingLabel="Guardando perfil..." />
      </div>
    </form>
  );
}
