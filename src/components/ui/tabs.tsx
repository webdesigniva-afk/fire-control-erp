import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type TabsProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type TabButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

export function Tabs({ className = "", children, ...props }: TabsProps) {
  return (
    <div
      className={`flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function TabButton({
  active = false,
  className = "",
  children,
  ...props
}: TabButtonProps) {
  return (
    <button
      className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${
        active
          ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
