import type { ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { AppShell } from "./app-shell";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "orange";

type Field = {
  label: string;
  value: string;
};

export type PipelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  status: string;
  statusVariant: BadgeVariant;
  fields: Field[];
  action: string;
  meta?: ReactNode;
};

type CommercialPipelinePageProps = {
  title: string;
  description: string;
  searchPlaceholder: string;
  primaryAction: string;
  items: PipelineItem[];
};

export function CommercialPipelinePage({
  title,
  description,
  searchPlaceholder,
  primaryAction,
  items,
}: CommercialPipelinePageProps) {
  return (
    <AppShell title={title} description={description}>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xl">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input placeholder={searchPlaceholder} className="w-full pl-11" />
            </div>

            <Button className="w-full lg:w-auto">
              <Plus size={18} />
              {primaryAction}
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} hover className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-black text-slate-950">
                      {item.title}
                    </h2>
                    <Badge variant={item.statusVariant}>{item.status}</Badge>
                  </div>
                  {item.subtitle ? (
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>

                {item.meta ? (
                  <div className="shrink-0 text-right">{item.meta}</div>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {item.fields.map((field) => (
                  <div
                    key={`${item.id}-${field.label}`}
                    className="rounded-2xl bg-slate-50 p-4"
                  >
                    <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {field.label}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-end">
                <Button variant="outline" className="w-full sm:w-auto">
                  {item.action}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
