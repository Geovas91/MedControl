import Link from "next/link";
import { Pencil, Plus, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Input } from "@/components/ui/input";
import { patients } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";

type PatientsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function PatientsPage({ searchParams }: PatientsPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q?.trim().toLowerCase() ?? "";
  const filteredPatients = query
    ? patients.filter((patient) =>
        [patient.name, patient.email, patient.phone, patient.condition].some((value) => value.toLowerCase().includes(query))
      )
    : patients;

  return (
    <>
      <PageHeader
        title="Patients"
        description="Search, review, and prepare records before each visit."
        action={{ label: "New patient", href: "/dashboard/patients/new", icon: <Plus className="h-4 w-4" /> }}
      />

      <form className="mb-5">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            name="q"
            defaultValue={resolvedSearchParams.q}
            placeholder="Search patients by name, phone, email, or condition"
            className="pl-10"
          />
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr_0.5fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <span>Patient</span>
          <span>Contact</span>
          <span>Condition</span>
          <span>Next visit</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-slate-200">
          {filteredPatients.map((patient) => (
            <Link
              key={patient.id}
              href={`/dashboard/patients/${patient.id}`}
              className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr_0.5fr] lg:items-center"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-clinic">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-ink">{patient.name}</p>
                  <p className="text-sm text-slate-500">{patient.age} years · {patient.gender}</p>
                </div>
              </div>
              <div className="text-sm text-slate-600">
                <p>{patient.phone}</p>
                <p>{patient.email}</p>
              </div>
              <p className="text-sm text-slate-600">{patient.condition}</p>
              <p className="text-sm text-slate-600">{formatDate(patient.nextVisit)}</p>
              <Badge variant={patient.status === "Active" ? "green" : patient.status === "Follow-up" ? "amber" : "slate"}>
                {patient.status}
              </Badge>
            </Link>
          ))}
          {filteredPatients.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              No patients found.
              <Link href="/dashboard/patients/new" className="ml-2 inline-flex items-center gap-1 font-semibold text-clinic">
                <Pencil className="h-3.5 w-3.5" />
                Create one
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
