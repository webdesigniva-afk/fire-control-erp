import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  children: ReactNode;
};

export function Card({
  hover = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-soft)] ${
        hover
          ? "transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[var(--shadow-lift)]"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
