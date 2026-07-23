import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const error = typeof searchParams.error === "string" ? searchParams.error : null;
  const defaults = {
    name: typeof searchParams.name === "string" ? searchParams.name : "",
    email: typeof searchParams.email === "string" ? searchParams.email : "",
    workspaceName: typeof searchParams.workspaceName === "string" ? searchParams.workspaceName : "",
    termsAccepted: searchParams.termsAccepted === "on" || searchParams.termsAccepted === "true",
    timezone: typeof searchParams.timezone === "string" ? searchParams.timezone : "",
    targetPortCountry:
      typeof searchParams.targetPortCountry === "string" ? searchParams.targetPortCountry : "",
  };

  return (
    <AuthShell
      title="Start for free"
      subtitle="Set up your workspace in under 2 minutes. No credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent-400 hover:text-accent-300">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm defaults={defaults} serverError={error} />
    </AuthShell>
  );
}
