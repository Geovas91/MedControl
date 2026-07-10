import { LoginCard } from "@/components/auth/login-card";

type AuthPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-slate-50 px-4 py-10">
      <LoginCard error={params?.error} message={params?.message} />
    </main>
  );
}
