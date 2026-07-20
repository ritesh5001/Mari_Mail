"use client";

const labels = ["Weak", "Fair", "Good", "Strong"] as const;
const colors = ["bg-red-500", "bg-amber-500", "bg-yellow-400", "bg-green-500"] as const;

function scorePassword(password: string) {
  let score = 0;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}

export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className={`h-1 rounded-full transition-colors ${
              item < score ? colors[Math.max(score - 1, 0) as 0 | 1 | 2 | 3] : "bg-slate-200 dark:bg-white/[0.08]"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-white/40">
        {password ? labels[Math.max(score - 1, 0) as 0 | 1 | 2 | 3] : "Use 10+ chars, mixed case, numbers & symbols"}
      </p>
    </div>
  );
}
