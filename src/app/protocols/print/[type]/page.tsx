import { Printer } from "lucide-react";
import { Badge } from "../../../../components/ui/badge";
import { Card } from "../../../../components/ui/card";

const titleByType = {
  "subscription-service": "Абонаментно обслужване",
  "extinguisher-handover": "Пожарогасители",
  "service-maintenance": "Протокол за поддръжка на ПИС",
};

type PrintPreviewPageProps = {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ object?: string | string[] }>;
};

export default async function PrintPreviewPage({
  params,
  searchParams,
}: PrintPreviewPageProps) {
  const { type } = await params;
  const query = await searchParams;
  const objectCode = Array.isArray(query.object) ? query.object[0] : query.object;
  const title = titleByType[type as keyof typeof titleByType] ?? "Протокол";

  return (
    <main className="min-h-screen bg-[#f7f8fb] p-6 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Card className="p-8">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <div className="text-2xl font-black tracking-tight">
                FIRE<span className="text-orange-500">Control</span>
              </div>
              <h1 className="mt-4 text-3xl font-black">{title}</h1>
              <p className="mt-2 text-sm text-slate-500">
                Преглед за печат на избрания шаблон.
              </p>
            </div>
            <Badge variant="orange">
              <Printer size={14} />
              Печат
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase text-slate-400">
                Шаблон
              </div>
              <div className="mt-1 font-black text-slate-800">{type}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase text-slate-400">
                Обект от QR
              </div>
              <div className="mt-1 font-black text-slate-800">
                {objectCode ?? "Не е избран"}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-400">
            Тук ще бъде изграден печатният шаблон.
          </div>
        </Card>
      </div>
    </main>
  );
}
