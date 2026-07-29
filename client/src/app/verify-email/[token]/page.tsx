import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmailView } from "@/components/auth/VerifyEmailView";

/**
 * Landing page for the link in the confirmation email.
 *
 * This route didn't exist — the API issued links to /verify-email/<token> and
 * every one of them hit a 404.
 */
export default function VerifyEmailPage({ params }: { params: { token: string } }) {
  return (
    <AuthShell
      title="Confirming your email"
      subtitle="One moment while we activate your workspace."
      footer={
        <Link href="/login" className="font-semibold text-accent-400 hover:text-accent-300">
          Back to sign in
        </Link>
      }
    >
      <VerifyEmailView token={params.token} />
    </AuthShell>
  );
}
