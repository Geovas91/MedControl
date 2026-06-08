import { Save } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export default function NewPatientPage() {
  return (
    <>
      <PageHeader title="Crear paciente" description="Captura un perfil de ejemplo. El envío sigue en modo demo hasta agregar persistencia real." />
      <form className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo" htmlFor="name">
            <Input id="name" placeholder="Nombre completo del paciente" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" placeholder="patient@example.com" />
          </Field>
          <Field label="Teléfono" htmlFor="phone">
            <Input id="phone" placeholder="+52 55 0000 0000" />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="dob">
            <Input id="dob" type="date" />
          </Field>
          <Field label="Género" htmlFor="gender">
            <Select id="gender" defaultValue="">
              <option value="" disabled>
                Selecciona género
              </option>
              <option>Femenino</option>
              <option>Masculino</option>
              <option>No binario</option>
              <option>Prefiere no decir</option>
            </Select>
          </Field>
          <Field label="Estado" htmlFor="status">
            <Select id="status" defaultValue="Activo">
              <option>Activo</option>
              <option>Seguimiento</option>
              <option>Inactivo</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Motivo principal" htmlFor="condition">
            <Input id="condition" placeholder="Motivo de atención" />
          </Field>
          <Field label="Próxima visita" htmlFor="nextVisit">
            <Input id="nextVisit" type="date" />
          </Field>
        </div>
        <Field label="Alergias" htmlFor="allergies">
          <Input id="allergies" placeholder="Penicilina, sulfas" />
        </Field>
        <Field label="Notas clínicas" htmlFor="notes">
          <Textarea id="notes" placeholder="Notas relevantes, medicamento o indicaciones de seguimiento" />
        </Field>
        <div className="flex justify-end">
          <Button type="button">
            <Save className="h-4 w-4" />
            Guardar paciente demo
          </Button>
        </div>
      </form>
    </>
  );
}
