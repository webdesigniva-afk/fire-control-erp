import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  LockKeyhole,
  Mail,
  Printer,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { BackButton } from "../../../components/back-button";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function valueFromQuery(
  query: Record<string, string | string[] | undefined>,
  key: string,
  fallback: string
) {
  const value = query[key];
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function formatDateForDisplay(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (day && month && year) {
    return `${day}.${month}.${year}`;
  }
  return value;
}

type ProtocolSuccessPageProps = {
  searchParams: SearchParams;
};

export default async function ProtocolSuccessPage({
  searchParams,
}: ProtocolSuccessPageProps) {
  const query = await searchParams;
  const protocol = {
    number: valueFromQuery(query, "number", "PR-2026-0418"),
    type: valueFromQuery(query, "type", "Протокол за поддръжка на ПИС"),
    object: valueFromQuery(query, "object", "МОЛ Шумен"),
    date: formatDateForDisplay(
      valueFromQuery(query, "date", "2026-04-12")
    ),
    printHref: valueFromQuery(query, "printHref", ""),
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-4 py-10 text-slate-900">
      <div className="w-full max-w-2xl">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-green-50 text-green-600 shadow-sm">
            <CheckCircle2 size={42} />
          </div>

          <h1 className="mt-6 text-3xl font-black tracking-tight">
            Протоколът е завършен успешно
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Документът е генериран и готов за използване
          </p>

          <div className="mt-6 flex justify-center">
            <Badge variant="neutral">
              <LockKeyhole size={14} />
              Протоколът е заключен и не може да бъде редактиран
            </Badge>
          </div>

          <Card className="mt-8 p-5 text-left">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">
                  Номер
                </div>
                <div className="mt-1 font-black">{protocol.number}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">
                  Тип
                </div>
                <div className="mt-1 font-black">{protocol.type}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">
                  Обект
                </div>
                <div className="mt-1 font-black">{protocol.object}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase text-slate-400">
                  Дата
                </div>
                <div className="mt-1 font-black">{protocol.date}</div>
              </div>
            </div>
          </Card>

          <div className="mt-8">
            <Link
              href={`/protocols/view/${encodeURIComponent(protocol.number)}`}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md sm:w-auto"
            >
              <Eye size={18} />
              Преглед на протокола
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href={protocol.printHref || `/protocols/view/${encodeURIComponent(protocol.number)}`}
              target={protocol.printHref ? "_blank" : undefined}
              rel={protocol.printHref ? "noreferrer" : undefined}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              <Printer size={18} />
              Печат
            </Link>
            <Button variant="outline">
              <Mail size={18} />
              Изпрати по имейл
            </Button>
            <BackButton
              fallbackHref="/protocols"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              <ArrowLeft size={18} />
              Към протоколите
            </BackButton>
          </div>
        </Card>
      </div>
    </main>
  );
}
