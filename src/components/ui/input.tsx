import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      {...props}
    />
  );
}
