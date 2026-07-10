import { SignupCard } from "@/components/auth/signup-card";

type SignupPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-slate-50 px-4 py-10">
      <SignupCard error={params?.error} message={params?.message} />
    </main>
  );
}
