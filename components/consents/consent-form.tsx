import { Copy, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { QrCodePlaceholder } from "@/components/consents/qr-code-placeholder";
import { patients } from "@/lib/mock-data";

export function ConsentForm() {
  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Patient" htmlFor="patient">
            <Select id="patient" defaultValue="Alicia Ramirez">
              {patients.map((patient) => (
                <option key={patient.id}>{patient.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Consent type" htmlFor="consent-type">
            <Select id="consent-type" defaultValue="General patient consent">
              <option>General patient consent</option>
              <option>Privacy and data processing</option>
              <option>Telemedicine consent</option>
              <option>Procedure information consent</option>
            </Select>
          </Field>
          <Field label="Doctor / clinic" htmlFor="doctor-clinic">
            <Input id="doctor-clinic" defaultValue="MedControl Clinic" />
          </Field>
          <Field label="Validity period" htmlFor="validity">
            <Select id="validity" defaultValue="12 months">
              <option>30 days</option>
              <option>6 months</option>
              <option>12 months</option>
              <option>24 months</option>
            </Select>
          </Field>
          <Field label="Consent text version" htmlFor="version">
            <Input id="version" defaultValue="v1.0-demo" />
          </Field>
          <Field label="Signing link" htmlFor="signing-link">
            <Input id="signing-link" readOnly value="https://app.medcontrol.local/consent/sign/demo-token" />
          </Field>
        </div>

        <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          This consent template must be reviewed and customized by a legal/healthcare compliance professional before
          real use.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary">
            <Copy className="h-4 w-4" />
            Copy signing link
          </Button>
          <Button type="button">
            <QrCode className="h-4 w-4" />
            Generate QR
          </Button>
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-ink">QR preview</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Mock QR for the public signing page. It does not create a real legal signature or store data.
        </p>
        <div className="mt-5 flex justify-center">
          <QrCodePlaceholder />
        </div>
      </aside>
    </form>
  );
}
