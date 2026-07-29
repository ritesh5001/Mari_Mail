import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use a strong password before returning to your workspace."
      footer={
        <Link href="/login" className="font-semibold text-accent-400 hover:text-accent-300">
          Back to login
        </Link>
      }
    >
      <ResetPasswordForm token={params.token} />
    </AuthShell>
  );
}
