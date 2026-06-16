import type { ReactNode } from "react";
import { Card } from "./card";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  badge,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <Card className={`p-5 sm:p-6 ${className}`}>
      <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {title}
            </h2>
            {badge}
          </div>
          {description ? (
            <div className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap xl:w-auto xl:shrink-0 xl:flex-nowrap xl:items-center">
            {actions}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
