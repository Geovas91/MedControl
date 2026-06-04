import { Save } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export default function NewPatientPage() {
  return (
    <>
      <PageHeader title="Create patient" description="Capture a new patient profile. Submission is mocked until persistence is added later." />
      <form className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full name" htmlFor="name">
            <Input id="name" placeholder="Patient full name" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" placeholder="patient@example.com" />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" placeholder="+1 (555) 000-0000" />
          </Field>
          <Field label="Date of birth" htmlFor="dob">
            <Input id="dob" type="date" />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <Select id="gender" defaultValue="">
              <option value="" disabled>
                Select gender
              </option>
              <option>Female</option>
              <option>Male</option>
              <option>Non-binary</option>
              <option>Prefer not to say</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" defaultValue="Active">
              <option>Active</option>
              <option>Follow-up</option>
              <option>Inactive</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary condition" htmlFor="condition">
            <Input id="condition" placeholder="Reason for care" />
          </Field>
          <Field label="Next visit" htmlFor="nextVisit">
            <Input id="nextVisit" type="date" />
          </Field>
        </div>
        <Field label="Allergies" htmlFor="allergies">
          <Input id="allergies" placeholder="Penicillin, Sulfa drugs" />
        </Field>
        <Field label="Clinical notes" htmlFor="notes">
          <Textarea id="notes" placeholder="Relevant notes, medication, or follow-up instructions" />
        </Field>
        <div className="flex justify-end">
          <Button type="button">
            <Save className="h-4 w-4" />
            Save mock patient
          </Button>
        </div>
      </form>
    </>
  );
}
