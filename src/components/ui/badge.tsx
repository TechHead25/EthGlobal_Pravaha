import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        verified: "border-verified/20 bg-verified-soft text-verified",
        pending: "border-pending/25 bg-pending-soft text-pending",
        failed: "border-destructive/20 bg-destructive-soft text-destructive",
        disputed: "border-destructive/30 bg-destructive-soft text-destructive",
        completed: "border-primary/15 bg-primary/5 text-primary",
        info: "border-sky-700/20 bg-sky-50 text-sky-800",
        dark: "border-white/15 bg-white/5 text-white/80",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
