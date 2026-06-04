import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { patients } from "@/lib/mock-data";

export default function NewAppointmentPage() {
  return (
    <>
      <PageHeader title="Create appointment" description="Schedule a mock appointment for the daily agenda." />
      <form className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Patient" htmlFor="patient">
            <Select id="patient" defaultValue="">
              <option value="" disabled>
                Select patient
              </option>
              {patients.map((patient) => (
                <option key={patient.id}>{patient.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Doctor" htmlFor="doctor">
            <Select id="doctor" defaultValue="Dr. Morgan">
              <option>Dr. Morgan</option>
              <option>Dr. Ellis</option>
              <option>Dr. Patel</option>
            </Select>
          </Field>
          <Field label="Date" htmlFor="date">
            <Input id="date" type="date" />
          </Field>
          <Field label="Time" htmlFor="time">
            <Input id="time" type="time" />
          </Field>
          <Field label="Visit type" htmlFor="type">
            <Input id="type" placeholder="Follow-up, consultation, lab review" />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" defaultValue="Confirmed">
              <option>Confirmed</option>
              <option>Waiting</option>
              <option>Completed</option>
            </Select>
          </Field>
        </div>
        <Field label="Visit notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Reason for visit or front-desk notes" />
        </Field>
        <div className="flex justify-end">
          <Button type="button">
            <CalendarPlus className="h-4 w-4" />
            Save mock appointment
          </Button>
        </div>
      </form>
    </>
  );
}
