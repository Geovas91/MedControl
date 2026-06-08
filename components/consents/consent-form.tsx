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
          <Field label="Paciente" htmlFor="patient">
            <Select id="patient" defaultValue="Alicia Ramirez">
              {patients.map((patient) => (
                <option key={patient.id}>{patient.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de consentimiento" htmlFor="consent-type">
            <Select id="consent-type" defaultValue="Consentimiento general de paciente">
              <option>Consentimiento general de paciente</option>
              <option>Privacidad y tratamiento de datos</option>
              <option>Consentimiento para telemedicina</option>
              <option>Consentimiento informativo de procedimiento</option>
            </Select>
          </Field>
          <Field label="Médico / clínica" htmlFor="doctor-clinic">
            <Input id="doctor-clinic" defaultValue="Clínica MedControl" />
          </Field>
          <Field label="Periodo de vigencia" htmlFor="validity">
            <Select id="validity" defaultValue="12 meses">
              <option>30 días</option>
              <option>6 meses</option>
              <option>12 meses</option>
              <option>24 meses</option>
            </Select>
          </Field>
          <Field label="Versión del texto" htmlFor="version">
            <Input id="version" defaultValue="v1.0-demo" />
          </Field>
          <Field label="Enlace de firma" htmlFor="signing-link">
            <Input id="signing-link" readOnly value="https://app.medcontrol.local/consent/sign/demo-token" />
          </Field>
        </div>

        <p className="rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          Esta plantilla debe revisarse y personalizarse por un profesional legal y de cumplimiento sanitario antes de
          uso real.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary">
            <Copy className="h-4 w-4" />
            Copiar enlace de firma
          </Button>
          <Button type="button">
            <QrCode className="h-4 w-4" />
            Generar QR
          </Button>
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-ink">Vista previa QR</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          QR demo para la página pública de firma. No crea una firma legal real ni almacena datos.
        </p>
        <div className="mt-5 flex justify-center">
          <QrCodePlaceholder />
        </div>
      </aside>
    </form>
  );
}
