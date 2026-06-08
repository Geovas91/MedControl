import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { patients } from "@/lib/mock-data";

export default function NewAppointmentPage() {
  return (
    <>
      <PageHeader title="Crear cita" description="Programa una cita de ejemplo para la agenda diaria." />
      <form className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Paciente" htmlFor="patient">
            <Select id="patient" defaultValue="">
              <option value="" disabled>
                Selecciona paciente
              </option>
              {patients.map((patient) => (
                <option key={patient.id}>{patient.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Médico" htmlFor="doctor">
            <Select id="doctor" defaultValue="Dr. Morgan">
              <option>Dr. Morgan</option>
              <option>Dr. Ellis</option>
              <option>Dr. Patel</option>
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="date">
            <Input id="date" type="date" />
          </Field>
          <Field label="Hora" htmlFor="time">
            <Input id="time" type="time" />
          </Field>
          <Field label="Tipo de visita" htmlFor="type">
            <Input id="type" placeholder="Seguimiento, consulta, revisión de laboratorio" />
          </Field>
          <Field label="Estado" htmlFor="status">
            <Select id="status" defaultValue="Confirmada">
              <option>Confirmada</option>
              <option>En espera</option>
              <option>Completada</option>
            </Select>
          </Field>
          <Field label="Opción de invitación" htmlFor="invite-option">
            <Select id="invite-option" defaultValue="Enviar invitación de Google Calendar">
              <option>Enviar invitación de Google Calendar</option>
              <option>Generar invitación iCalendar</option>
              <option>Enviar invitación por email</option>
              <option>Enviar recordatorio por WhatsApp</option>
              <option>No enviar invitación</option>
            </Select>
          </Field>
          <Field label="Estado de invitación" htmlFor="invite-status">
            <Select id="invite-status" defaultValue="No enviada">
              <option>No enviada</option>
              <option>Enviada</option>
              <option>Aceptada</option>
              <option>Rechazada</option>
              <option>Pendiente</option>
              <option>Fallida</option>
            </Select>
          </Field>
          <Field label="Ubicación o enlace en línea" htmlFor="location">
            <Input id="location" placeholder="Consultorio 2 o enlace seguro" />
          </Field>
          <Field label="Estado de recordatorio" htmlFor="reminder-status">
            <Select id="reminder-status" defaultValue="No programado">
              <option>No programado</option>
              <option>Programado</option>
              <option>Enviado</option>
              <option>Fallido</option>
            </Select>
          </Field>
        </div>
        <Field label="Notas de visita" htmlFor="notes">
          <Textarea id="notes" placeholder="Motivo de visita o notas de recepción" />
        </Field>
        <section className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-700">Paciente:</span> Paciente seleccionado
          </p>
          <p>
            <span className="font-semibold text-slate-700">Médico:</span> Dr. Morgan
          </p>
          <p>
            <span className="font-semibold text-slate-700">Fecha/hora:</span> Selección pendiente
          </p>
          <p>
            <span className="font-semibold text-slate-700">Ubicación:</span> Ubicación pendiente
          </p>
          <p>
            <span className="font-semibold text-slate-700">Estado de invitación:</span> No enviada
          </p>
          <p>
            <span className="font-semibold text-slate-700">Estado de recordatorio:</span> No programado
          </p>
        </section>
        <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          Las invitaciones de calendario no deben incluir información clínica sensible.
        </p>
        <div className="flex justify-end">
          <Button type="button">
            <CalendarPlus className="h-4 w-4" />
            Guardar cita demo
          </Button>
        </div>
      </form>
    </>
  );
}
