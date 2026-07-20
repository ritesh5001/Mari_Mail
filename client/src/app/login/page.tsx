import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const defaults = {
    email: typeof searchParams.email === "string" ? searchParams.email : "",
    remember: searchParams.remember === "on" || searchParams.remember === "true",
  };
  const registered = Boolean(searchParams.registered);
  const error = typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your MariMail workspace."
      footer={
        <>
          New to MariMail?{" "}
          <Link href="/register" className="font-semibold text-accent-400 hover:text-accent-300">
            Create a free account
          </Link>
        </>
      }
    >
      <LoginForm defaults={defaults} registered={registered} serverError={error} />
    </AuthShell>
  );
}
