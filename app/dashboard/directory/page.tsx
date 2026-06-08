import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { DirectoryProfileForm } from "@/components/dashboard/directory-profile-form";
import { getAppBaseUrl } from "@/lib/supabase/config";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getClinicDoctorPublicProfiles, getDoctorPublicProfileForClinicMember } from "@/lib/server/directory";
import { listClinicMembersForClinic, type ManagedClinicMember } from "@/lib/supabase/clinic-members";

type DashboardDirectoryPageProps = {
  searchParams?: Promise<{
    member?: string;
  }>;
};

const roleLabels = {
  owner: "Propietario",
  admin: "Administrador",
  doctor: "Médico",
  assistant: "Asistente"
} as const;

function profileDefaultName(member: ManagedClinicMember | null, currentFullName: string | null) {
  return member?.full_name?.trim() || currentFullName?.trim() || "Mi perfil médico";
}

function canHavePublicProfile(member: ManagedClinicMember) {
  return member.role === "owner" || member.role === "doctor";
}

function canEditSelectedMember(currentMember: ManagedClinicMember, selectedMember: ManagedClinicMember) {
  if (currentMember.role === "owner" || currentMember.role === "admin") {
    return true;
  }

  return currentMember.id === selectedMember.id && currentMember.role === "doctor";
}

export default async function DashboardDirectoryPage({ searchParams }: DashboardDirectoryPageProps) {
  const onboardingStatus = await getOnboardingStatus();

  if (onboardingStatus.state === "unauthenticated") {
    redirect("/login");
  }

  if (onboardingStatus.state !== "complete") {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const [{ data: members }, { data: clinicProfiles }] = await Promise.all([
    listClinicMembersForClinic(onboardingStatus.membership.clinic_id),
    getClinicDoctorPublicProfiles(onboardingStatus.membership.clinic_id)
  ]);
  const profileMembers = (members ?? []).filter(canHavePublicProfile);
  const currentMember =
    (members ?? []).find((member) => member.id === onboardingStatus.membership.id) ??
    ({
      id: onboardingStatus.membership.id,
      clinic_id: onboardingStatus.membership.clinic_id,
      user_id: onboardingStatus.membership.user_id,
      full_name: onboardingStatus.profile.full_name,
      email: onboardingStatus.profile.email,
      role: onboardingStatus.membership.role,
      status: onboardingStatus.membership.status,
      created_at: onboardingStatus.membership.created_at
    } satisfies ManagedClinicMember);
  const selectedMember =
    profileMembers.find((member) => member.id === params?.member) ??
    profileMembers.find((member) => member.id === onboardingStatus.membership.id) ??
    profileMembers[0] ??
    currentMember;
  const { data: profile } = await getDoctorPublicProfileForClinicMember(selectedMember.id);
  const publicUrl = profile?.slug ? `${getAppBaseUrl()}/directorio/${profile.slug}` : null;
  const canEdit = canEditSelectedMember(currentMember, selectedMember);

  return (
    <>
      <PageHeader
        title="Directorio médico"
        description="Configura el perfil público que aparecerá en el directorio de médicos registrados en MedControl."
        action={
          publicUrl
            ? {
                label: "Ver perfil",
                href: publicUrl,
                icon: <ExternalLink className="h-4 w-4" />
              }
            : undefined
        }
      />

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Estado</p>
          <div className="mt-2">
            <Badge variant={profile?.is_published ? "green" : "slate"}>
              {profile?.is_published ? "Publicado" : "No publicado"}
            </Badge>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Slug público</p>
          <p className="mt-1 truncate text-lg font-bold text-ink">{profile?.slug ?? "Se generará al guardar"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Visibilidad</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Solo perfiles publicados aparecen en las rutas públicas del directorio.
          </p>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold text-ink">Perfiles de la clínica</h2>
            <p className="mt-1 text-sm text-slate-500">
              Los propietarios y administradores pueden revisar perfiles de médicos de su clínica.
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-500">{clinicProfiles?.length ?? 0} perfiles creados</p>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {profileMembers.map((member) => {
            const memberProfile = clinicProfiles?.find((item) => item.clinic_member_id === member.id);
            const selected = member.id === selectedMember.id;

            return (
              <Link
                key={member.id}
                href={`/dashboard/directory?member=${member.id}`}
                className={`min-w-60 rounded-md border p-3 text-left transition ${
                  selected ? "border-clinic bg-teal-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="truncate text-sm font-bold text-ink">{member.full_name ?? member.email ?? "Sin nombre"}</p>
                <p className="mt-1 text-xs text-slate-500">{roleLabels[member.role]}</p>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {memberProfile?.is_published ? "Publicado" : memberProfile ? "Borrador" : "Sin perfil"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <DirectoryProfileForm
        profile={profile}
        defaultName={profileDefaultName(selectedMember, onboardingStatus.profile.full_name)}
        publicUrl={publicUrl}
        canEdit={canEdit}
        clinicMemberId={selectedMember.id}
      />
    </>
  );
}
