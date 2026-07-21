"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "error";
type FinanceStatus =
  | "draft"
  | "issued"
  | "partial"
  | "paid"
  | "overdue"
  | "ready";
type FinanceKind = "invoice" | "payment" | "expense" | "billable";
type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "orange" | "info";

type FinanceDocument = {
  id: string;
  kind: FinanceKind;
  number: string;
  client: string;
  objectName: string;
  basis: string;
  date: string;
  dueDate: string;
  amount: number;
  vat: number;
  status: FinanceStatus;
  linkedHref: string;
  responsible: string;
};

const fallbackDocuments: FinanceDocument[] = [
  {
    id: "fin-1001",
    kind: "invoice",
    number: "INV-2026-0041",
    client: "Шумен Ритейл Груп АД",
    objectName: "МОЛ Шумен",
    basis: "Месечна абонаментна поддръжка и проверка на пожарогасители",
    date: "2026-07-03",
    dueDate: "2026-07-17",
    amount: 1840,
    vat: 368,
    status: "overdue",
    linkedHref: "/sales",
    responsible: "Офис",
  },
  {
    id: "fin-1002",
    kind: "invoice",
    number: "INV-2026-0042",
    client: "Централ Хотелс ООД",
    objectName: "Хотел Централ",
    basis: "Профилактика на ПИС и аварийно осветление",
    date: "2026-07-08",
    dueDate: "2026-07-22",
    amount: 960,
    vat: 192,
    status: "issued",
    linkedHref: "/protocols",
    responsible: "Мария Георгиева",
  },
  {
    id: "fin-1003",
    kind: "payment",
    number: "PAY-2026-0037",
    client: "Север Логистик ЕООД",
    objectName: "Склад Север",
    basis: "Плащане по договор за пожарогасители",
    date: "2026-07-12",
    dueDate: "2026-07-12",
    amount: 2320,
    vat: 464,
    status: "paid",
    linkedHref: "/contracts",
    responsible: "Банка",
  },
  {
    id: "fin-1004",
    kind: "expense",
    number: "EXP-2026-0028",
    client: "ПожарТех Снабдяване",
    objectName: "Сервизен склад",
    basis: "Прах ABC, пломби и стикери за годишни проверки",
    date: "2026-07-14",
    dueDate: "2026-07-14",
    amount: 740,
    vat: 148,
    status: "paid",
    linkedHref: "/warehouse",
    responsible: "Склад",
  },
  {
    id: "fin-1005",
    kind: "billable",
    number: "BILL-2026-0019",
    client: "Алфа Ритейл ООД",
    objectName: "Магазин Север",
    basis: "Приключен протокол за първоначален оглед - за фактуриране",
    date: "2026-07-18",
    dueDate: "2026-07-25",
    amount: 420,
    vat: 84,
    status: "ready",
    linkedHref: "/protocols",
    responsible: "Иван Петров",
  },
  {
    id: "fin-1006",
    kind: "expense",
    number: "EXP-2026-0031",
    client: "Оперативни разходи",
    objectName: "Офис Шумен",
    basis: "Гориво и консумативи за сервизни посещения",
    date: "2026-07-19",
    dueDate: "2026-07-19",
    amount: 286,
    vat: 57.2,
    status: "paid",
    linkedHref: "/tasks",
    responsible: "Логистика",
  },
];

const statusLabels: Record<FinanceStatus, string> = {
  draft: "Чернова",
  issued: "Издадена",
  partial: "Частично платена",
  paid: "Платена",
  overdue: "Просрочена",
  ready: "За фактуриране",
};

const statusVariants: Record<FinanceStatus, BadgeVariant> = {
  draft: "neutral",
  issued: "orange",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  ready: "info",
};

  const kindLabels: Record<FinanceKind, string> = {
  invoice: "Фактура",
  payment: "Плащане",
  expense: "Разход",
  billable: "За фактуриране",
};

const protocolTypePrices: Record<string, number> = {
  "Абонаментно обслужване / профилактичен преглед": 380,
  "Пожарогасители": 520,
  "Протокол за поддръжка на ПИС": 460,
};

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return `${value.toLocaleString("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}\u00a0€`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("bg-BG").replace(" г.", "\u00a0г.");
}

function protocolTypeFromDb(value: string) {
  if (value === "subscription") {
    return "Абонаментно обслужване / профилактичен преглед";
  }
  if (value === "extinguisher") return "Пожарогасители";
  if (value === "service") return "Протокол за поддръжка на ПИС";
  if (value === "Сервизен протокол") return "Протокол за поддръжка на ПИС";
  return value || "Протокол";
}

function payloadFromDbRow(row: DataRecord) {
  const payload = row["protocol_payload"];
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as DataRecord)
    : {};
}

function mapSavedDocument(row: DataRecord): FinanceDocument | null {
  const payload = isRecord(row.payload) ? row.payload : {};
  const offer = isRecord(payload.offer) ? payload.offer : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const kind = textValue(row, ["kind"]);
  const source = kind === "contract" ? contract : offer;
  const id = textValue(row, ["id"]);
  const date =
    textValue(source, ["date", "createdAt", "created_at"]) ||
    textValue(row, ["updated_at"]).slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const total =
    numberValue(textValue(row, ["total"])) ||
    numberValue(source.total) ||
    numberValue(source.totalWithVat);

  if (!id || total <= 0) return null;

  const isAccepted = payload.status === "accepted";
  const number = textValue(row, ["number"]) || textValue(source, ["number"]);

  return {
    id: `doc-${id}`,
    kind: isAccepted ? "invoice" : "billable",
    number: isAccepted
      ? `INV-${date.slice(0, 4)}-${number.replace(/\D/g, "").slice(-4).padStart(4, "0")}`
      : `BILL-${date.slice(0, 4)}-${number.replace(/\D/g, "").slice(-4).padStart(4, "0")}`,
    client: textValue(row, ["client"]) || textValue(source, ["client"]) || "Клиент",
    objectName: textValue(row, ["object"]) || textValue(source, ["object"]) || "Обект",
    basis:
      kind === "contract"
        ? "Договор за абонаментна пожарна поддръжка"
        : "Оферта за пожарна безопасност и сервизни дейности",
    date,
    dueDate: addDays(date, 14),
    amount: total,
    vat: total * 0.2,
    status: isAccepted ? "issued" : "ready",
    linkedHref: textValue(row, ["href"]) || (kind === "contract" ? "/contracts" : "/sales"),
    responsible: kind === "contract" ? "Офис" : "Продажби",
  };
}

function mapProtocolToBillable(row: DataRecord): FinanceDocument | null {
  const payload = payloadFromDbRow(row);
  const number =
    textValue(payload, ["number", "protocolNumber"]) ||
    textValue(row, ["protocol_number", "number"]);
  const status = textValue(row, ["status"]) || textValue(payload, ["status"]);

  if (!number || status !== "completed") return null;

  const protocolType = protocolTypeFromDb(
    textValue(payload, ["protocolType"]) ||
      textValue(row, ["protocol_type", "type"])
  );
  const date =
    textValue(payload, ["date"]) ||
    textValue(row, ["protocol_date", "date", "created_at"]).slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const amount = protocolTypePrices[protocolType] ?? 420;

  return {
    id: `protocol-${number}`,
    kind: "billable",
    number: `BILL-${number}`,
    client:
      textValue(payload, ["client"]) ||
      textValue(row, ["client_name"]) ||
      "Клиент",
    objectName:
      textValue(payload, ["objectName"]) ||
      textValue(row, ["object_name"]) ||
      "Обект",
    basis: `${protocolType} - протокол ${number}`,
    date,
    dueDate: addDays(date, 7),
    amount,
    vat: amount * 0.2,
    status: "ready",
    linkedHref: `/protocols/view/${encodeURIComponent(number)}`,
    responsible:
      textValue(payload, ["technician"]) ||
      textValue(row, ["technician"]) ||
      "Техник",
  };
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "orange" | "emerald" | "red" | "slate" | "blue";
}) {
  const toneClasses = {
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    red: "bg-red-50 text-red-600 ring-red-100",
    slate: "bg-slate-50 text-slate-600 ring-slate-100",
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-500">{detail}</div>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${toneClasses[tone]}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function FinanceDocumentRow({ document }: { document: FinanceDocument }) {
  return (
    <div className="grid gap-4 px-4 py-4 transition hover:bg-orange-50/50 lg:grid-cols-[minmax(170px,0.85fr)_minmax(210px,1fr)_minmax(250px,1.25fr)_minmax(230px,0.9fr)_minmax(230px,0.85fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="break-words font-black text-slate-950">
            {document.number}
          </div>
          <Badge variant={statusVariants[document.status]}>
            {statusLabels[document.status]}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
          <ReceiptText size={14} />
          {kindLabels[document.kind]}
        </div>
      </div>

      <div className="min-w-0">
        <div className="break-words text-sm font-black text-slate-800">
          {document.client}
        </div>
        <div className="mt-1 break-words text-xs font-semibold text-slate-500">
          {document.objectName}
        </div>
      </div>

      <div className="min-w-0">
        <div className="break-words text-sm font-semibold leading-5 text-slate-600">
          {document.basis}
        </div>
        <Link
          href={document.linkedHref}
          className="mt-2 inline-flex items-center gap-1 text-xs font-black text-orange-600 hover:text-orange-700"
        >
          <FileText size={13} />
          Свързан документ
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 lg:bg-transparent lg:p-0">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Дата</div>
          <div className="mt-1 whitespace-nowrap text-sm font-bold text-slate-700">
            {formatDate(document.date)}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Падеж</div>
          <div className="mt-1 whitespace-nowrap text-sm font-bold text-slate-700">
            {formatDate(document.dueDate)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 lg:bg-transparent lg:p-0 lg:text-right">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Сума</div>
          <div className="mt-1 whitespace-nowrap text-sm font-black text-slate-950 lg:text-[13px] 2xl:text-sm">
            {formatMoney(document.amount)}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">ДДС</div>
          <div className="mt-1 whitespace-nowrap text-sm font-bold text-slate-600 lg:text-[13px] 2xl:text-sm">
            {formatMoney(document.vat)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [documents, setDocuments] = useState<FinanceDocument[]>(fallbackDocuments);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<"all" | FinanceKind>("all");

  async function loadFinanceDocuments() {
    setLoadState("loading");
    try {
      const supabase = createSupabaseBrowserClient();
      const [documentsResult, protocolsResult] = await Promise.all([
        supabase
          .from("saved_documents")
          .select("id,kind,number,title,client,object,href,total,payload,updated_at")
          .in("kind", ["offer", "contract"])
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("protocols")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

      if (documentsResult.error) throw new Error(documentsResult.error.message);
      if (protocolsResult.error) throw new Error(protocolsResult.error.message);

      const mappedDocuments = ((documentsResult.data as DataRecord[] | null) ?? [])
        .map(mapSavedDocument)
        .filter(Boolean) as FinanceDocument[];
      const mappedProtocols = ((protocolsResult.data as DataRecord[] | null) ?? [])
        .map(mapProtocolToBillable)
        .filter(Boolean) as FinanceDocument[];
      const mapped = [...mappedProtocols, ...mappedDocuments];

      setDocuments(mapped.length ? [...mapped, ...fallbackDocuments.slice(3)] : fallbackDocuments);
      setLoadState("ready");
    } catch {
      setDocuments(fallbackDocuments);
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadFinanceDocuments();
  }, []);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return documents.filter((document) => {
      if (activeKind !== "all" && document.kind !== activeKind) return false;
      if (!normalized) return true;

      return [
        document.number,
        document.client,
        document.objectName,
        document.basis,
        document.responsible,
        statusLabels[document.status],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [activeKind, documents, query]);

  const invoices = documents.filter((document) => document.kind === "invoice");
  const payments = documents.filter((document) => document.kind === "payment");
  const expenses = documents.filter((document) => document.kind === "expense");
  const billable = documents.filter((document) => document.kind === "billable");
  const unpaid = invoices.filter((document) =>
    ["issued", "partial", "overdue"].includes(document.status)
  );
  const overdue = documents.filter((document) => document.status === "overdue");
  const revenue = [...invoices, ...payments].reduce((total, document) => total + document.amount, 0);
  const expenseTotal = expenses.reduce((total, document) => total + document.amount, 0);
  const receivables = unpaid.reduce((total, document) => total + document.amount, 0);
  const vatTotal = invoices.reduce((total, document) => total + document.vat, 0);

  const filters: Array<{ value: "all" | FinanceKind; label: string; count: number }> = [
    { value: "all", label: "Всички", count: documents.length },
    { value: "invoice", label: "Фактури", count: invoices.length },
    { value: "payment", label: "Плащания", count: payments.length },
    { value: "expense", label: "Разходи", count: expenses.length },
    { value: "billable", label: "За фактуриране", count: billable.length },
  ];

  return (
    <AppShell
      title="Финанси"
      description="Финансов контрол, фактуриране и плащания по клиенти, обекти и сервизни документи"
      showSearch={false}
      headerAction={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline">
            <Download size={16} />
            Експорт
          </Button>
          <Button type="button">
            <Plus size={16} />
            Нова фактура
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Приходи"
            value={formatMoney(revenue)}
            detail="издадени фактури и постъпления"
            icon={<TrendingUp size={21} />}
            tone="emerald"
          />
          <StatCard
            label="Неплатени"
            value={formatMoney(receivables)}
            detail={`${unpaid.length} активни вземания`}
            icon={<WalletCards size={21} />}
            tone="orange"
          />
          <StatCard
            label="Просрочени"
            value={String(overdue.length)}
            detail="изискват последващо действие"
            icon={<AlertTriangle size={21} />}
            tone="red"
          />
          <StatCard
            label="Разходи"
            value={formatMoney(expenseTotal)}
            detail="материали, гориво, външни услуги"
            icon={<TrendingDown size={21} />}
            tone="slate"
          />
          <StatCard
            label="ДДС"
            value={formatMoney(vatTotal)}
            detail="начислен ДДС по фактури"
            icon={<Banknote size={21} />}
            tone="blue"
          />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <Card className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-black text-slate-950">
                  Финансови документи
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  Фактури, плащания, разходи и приключени дейности за фактуриране
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={loadFinanceDocuments}
                disabled={loadState === "loading"}
              >
                {loadState === "loading" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Обнови
              </Button>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)] xl:items-start">
              <div className="relative min-w-0">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Търсене по фактура, клиент, обект или основание..."
                  className="pl-11"
                />
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveKind(filter.value)}
                    className={`inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl px-3 text-sm font-black transition xl:min-w-[128px] ${
                      activeKind === filter.value
                        ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate">{filter.label}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs">
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {loadState === "error" ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Заредени са примерни финансови редове. При активна база модулът използва записаните оферти и договори.
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-400 lg:grid lg:grid-cols-[minmax(170px,0.85fr)_minmax(210px,1fr)_minmax(250px,1.25fr)_minmax(230px,0.9fr)_minmax(230px,0.85fr)]">
                <div>Документ</div>
                <div>Клиент / обект</div>
                <div>Основание</div>
                <div>Дати</div>
                <div className="text-right">Сума / ДДС</div>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredDocuments.map((document) => (
                  <FinanceDocumentRow key={document.id} document={document} />
                ))}
              </div>
              {filteredDocuments.length === 0 ? (
                <div className="p-8 text-center text-sm font-bold text-slate-500">
                  Няма финансови документи по избрания филтър.
                </div>
              ) : null}
            </div>
          </Card>

          <div className="min-w-0 space-y-5">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-950">
                    Паричен поток
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    Офис, банка и сервизни дейности
                  </div>
                </div>
                <WalletCards className="text-orange-500" size={22} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3 2xl:grid-cols-1">
                {[
                  {
                    label: "Банкова сметка",
                    value: formatMoney(revenue - expenseTotal),
                    detail: "постъпления минус разходи",
                    tone: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
                  },
                  {
                    label: "Каса офис",
                    value: formatMoney(620),
                    detail: "наличност за дребни разходи",
                    tone: "border-slate-100 bg-slate-50 text-slate-700",
                  },
                  {
                    label: "Очаквани плащания",
                    value: formatMoney(receivables),
                    detail: "издадени и просрочени фактури",
                    tone: "border-amber-100 bg-amber-50/70 text-amber-700",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`rounded-2xl border p-4 ${row.tone}`}
                  >
                    <div className="text-xs font-black uppercase text-current/70">
                      {row.label}
                    </div>
                    <div className="mt-2 whitespace-nowrap text-xl font-black tracking-tight">
                      {row.value}
                    </div>
                    <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
                      {row.detail}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-950">
                    Предстоящи действия
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    Финансови задачи за офиса
                  </div>
                </div>
                <CalendarDays className="text-orange-500" size={22} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3 2xl:block 2xl:divide-y 2xl:divide-slate-100">
                {[
                  {
                    title: "Изпрати напомняне за просрочена фактура",
                    meta: "Шумен Ритейл Груп АД · днес",
                    icon: <AlertTriangle size={16} />,
                    tone: "text-red-600",
                  },
                  {
                    title: "Издай фактура по приключен протокол",
                    meta: "Алфа Ритейл ООД · тази седмица",
                    icon: <ReceiptText size={16} />,
                    tone: "text-blue-600",
                  },
                  {
                    title: "Осчетоводи доставка към сервизен склад",
                    meta: "ПожарТех Снабдяване · 740.00 €",
                    icon: <CheckCircle2 size={16} />,
                    tone: "text-emerald-600",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 2xl:rounded-none 2xl:bg-transparent 2xl:px-0"
                  >
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ${item.tone}`}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-sm font-black leading-5 text-slate-900">{item.title}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{item.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
