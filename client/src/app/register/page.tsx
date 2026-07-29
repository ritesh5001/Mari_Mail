import { RegisterPanel } from "@/components/auth/RegisterPanel";

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
    plan: typeof searchParams.plan === "string" ? searchParams.plan : "",
  };

  return <RegisterPanel defaults={defaults} serverError={error} />;
}
