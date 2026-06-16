import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "orange"
  | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  children: ReactNode;
};

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  warning: "bg-amber-50 text-amber-700 ring-amber-200/80",
  danger: "bg-red-50 text-red-700 ring-red-200/80",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200/80",
  info: "bg-blue-50 text-blue-700 ring-blue-200/80",
};

export function Badge({
  variant = "neutral",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold leading-none ring-1 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
