import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-gradient-to-r from-red-600 via-red-500 to-orange-400 text-white shadow-[0_10px_24px_rgba(239,68,68,0.18)] hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(239,68,68,0.24)] active:translate-y-0 active:shadow-[0_6px_16px_rgba(239,68,68,0.2)]",
  secondary:
    "border border-orange-200 bg-orange-50 text-orange-700 shadow-sm hover:border-orange-300 hover:bg-orange-100 hover:text-orange-800 active:bg-orange-200/70",
  outline:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md active:bg-orange-100/70",
  ghost:
    "border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70",
  danger:
    "border border-red-200 bg-red-50 text-red-700 shadow-sm hover:border-red-300 hover:bg-red-100 hover:text-red-800 active:bg-red-200/70",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-xs",
  md: "h-11 px-4.5 text-sm",
  icon: "h-9 w-9 p-0",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-bold leading-none transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
