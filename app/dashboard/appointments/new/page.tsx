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
          <Field label="Invitation option" htmlFor="invite-option">
            <Select id="invite-option" defaultValue="Send Google Calendar invite">
              <option>Send Google Calendar invite</option>
              <option>Generate iCalendar invite</option>
              <option>Send email invite</option>
              <option>Send WhatsApp reminder</option>
              <option>Do not send invite</option>
            </Select>
          </Field>
          <Field label="Invitation status" htmlFor="invite-status">
            <Select id="invite-status" defaultValue="Not sent">
              <option>Not sent</option>
              <option>Sent</option>
              <option>Accepted</option>
              <option>Declined</option>
              <option>Pending</option>
              <option>Failed</option>
            </Select>
          </Field>
          <Field label="Location or online link" htmlFor="location">
            <Input id="location" placeholder="Room 2 or secure video link" />
          </Field>
          <Field label="Reminder status" htmlFor="reminder-status">
            <Select id="reminder-status" defaultValue="Not scheduled">
              <option>Not scheduled</option>
              <option>Scheduled</option>
              <option>Sent</option>
              <option>Failed</option>
            </Select>
          </Field>
        </div>
        <Field label="Visit notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Reason for visit or front-desk notes" />
        </Field>
        <section className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm text-slate-600 md:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-700">Patient:</span> Selected patient
          </p>
          <p>
            <span className="font-semibold text-slate-700">Doctor:</span> Dr. Morgan
          </p>
          <p>
            <span className="font-semibold text-slate-700">Date/time:</span> Pending selection
          </p>
          <p>
            <span className="font-semibold text-slate-700">Location:</span> Pending location
          </p>
          <p>
            <span className="font-semibold text-slate-700">Calendar invite status:</span> Not sent
          </p>
          <p>
            <span className="font-semibold text-slate-700">Reminder status:</span> Not scheduled
          </p>
        </section>
        <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          Calendar invitations should not include sensitive clinical information.
        </p>
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
