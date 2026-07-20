import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your email and MariMail will send a one-hour reset link."
      footer={
        <Link href="/login" className="font-semibold text-ocean">
          Back to login
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
