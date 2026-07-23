import { notFound } from "next/navigation";
import Link from "next/link";
import { acceptInvitationAction } from "@/app/invite/[token]/actions";
import { getPublicMemberInvitation } from "@/lib/server/member-invitations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function InvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params; const query = await searchParams;
  const invitation = await getPublicMemberInvitation(token);
  if (!invitation) notFound();
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  const next = encodeURIComponent(`/invite/${token}`);
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft"><h1 className="text-2xl font-bold text-ink">Invitación a {invitation.clinic_name}</h1><p className="mt-3 text-sm text-slate-600">Se te invita como {invitation.invited_role}. Esta invitación personal vence el {invitation.expires_at ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(invitation.expires_at)) : "pronto"}.</p>{query.error ? <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">No fue posible aceptar la invitación. Verifica que uses el correo invitado.</p> : null}{user ? <form action={acceptInvitationAction.bind(null, token)} className="mt-6"><button className="rounded-md bg-clinic px-4 py-2 text-sm font-semibold text-white">Aceptar invitación</button></form> : <div className="mt-6 flex gap-3"><Link href={`/register?next=${next}`} className="rounded-md bg-clinic px-4 py-2 text-sm font-semibold text-white">Crear cuenta</Link><Link href={`/login?next=${next}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Iniciar sesión</Link></div>}<p className="mt-5 text-xs leading-5 text-slate-500">No compartas este enlace. Si no esperabas esta invitación, puedes ignorarla.</p></section></main>;
}
