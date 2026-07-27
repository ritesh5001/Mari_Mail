import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * shadcn Button, adapted to this repo:
 *  - `@/lib/cn` instead of `@/lib/utils`.
 *  - stock shadcn color tokens (`bg-primary`, `bg-accent`, `ring-ring`, …)
 *    aren't defined here, so variants use the MariMail brand-blue scale
 *    (accent-500/600 = #4F6DFF / #3B4FE6) with real slate values and
 *    `dark:` variants for the marketing theme.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent-500 text-white hover:bg-accent-600",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline:
          "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]",
        ghost: "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/[0.06] dark:hover:text-white",
        link: "text-accent-500 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
