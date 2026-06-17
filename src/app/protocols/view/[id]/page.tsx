"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Frown, Meh, PenLine, Printer, Smile, Trash2 } from "lucide-react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import {
  DeleteConfirmDialog,
  type DeleteConfirmDialogState,
} from "../../../../components/ui/delete-confirm-dialog";
import {
  deleteProtocolEverywhere,
  protocolsStorageKey,
} from "../../../../lib/protocols-delete";
import { readProtocolPhotosByNumber } from "../../../../lib/protocol-photos";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

const PROTOCOLS_STORAGE_KEY = protocolsStorageKey;

type SubscriptionCheckValue = "добро" | "лошо" | "непопълнено";
type CheckValue = "Изпълнено" | "Неизпълнено" | "Неприложимо";
type ServiceQualityValue = "happy" | "neutral" | "sad" | "";
type StoredStatus = "draft" | "completed";

type ExtinguisherRow = {
  id: string;
  rowNumber: string;
  identificationMarking: string;
  category: string;
  serviceType: string;
  serviceDate: string;
  servicePersonName: string;
  stickerNumber: string;
};

type StoredProtocol = {
  number: string;
  status: StoredStatus;
  protocolType: string;
  date: string;
  client: string;
  objectName: string;
  address: string;
  region?: string;
  phone?: string;
  technician: string;
  contractReference: string;
  clientRepresentative: string;
  personnelFunctions: Record<"A" | "B" | "C", boolean>;
  subscriptionChecks: Record<string, SubscriptionCheckValue>;
  serviceQuality: ServiceQualityValue;
  notes: string;
  serviceDefects?: string;
  serviceDeviations?: string;
  serviceSystemStatus?: string;
  nextVisitDate?: string;
  technicianSignatureDataUrl: string;
  clientSignatureDataUrl: string;
  extinguisherRows: ExtinguisherRow[];
  checks: Record<string, CheckValue>;
  savedAt: number;
  completedAt?: number;
};

type ProtocolPreviewPhoto = {
  id: string;
  name: string;
  dataUrl: string;
  description?: string;
};

type DataRecord = Record<string, unknown>;

const subscriptionChecklistRows: Array<{
  number: string;
  label: string;
  periodicity: string;
}> = [
  {
    number: "1.",
    label: "Външен оглед на възлите на ПГИ",
    periodicity: "ежемесечно",
  },
  {
    number: "2.",
    label:
      "Проверка на блоковете за управление и работа на ПГИ в ръчен и автоматичен режим",
    periodicity: "на три месеца (3/6/9/12)",
  },
  {
    number: "3.",
    label: "Тест изправността и напрежението на линиите за активиране на ПГИ",
    periodicity: "ежемесечно",
  },
  {
    number: "4.",
    label: "Тест работата на ПГИ в режим местно и дистанционно управление",
    periodicity: "ежемесечно",
  },
  {
    number: "5.",
    label:
      "Проверка на изправността на изнесените сигнализатори за тревога / сирени, алармени звънци, блиц лампи и др.",
    periodicity: "годишно (12)",
  },
  {
    number: "6.",
    label: "Тест на ПГИ в „Автономен“ и „Ръчен“ режим на активиране",
    periodicity: "годишно",
  },
  {
    number: "7.",
    label: "Проверка на данните за работа на ПГИ",
    periodicity: "на три месеца",
  },
  {
    number: "8.",
    label: "Хардуерен тест на контролните устройства",
    periodicity: "годишно",
  },
];

const printSlugByType: Record<string, string> = {
  "Абонаментно обслужване / профилактичен преглед": "subscription-service",
  "Пожарогасители": "extinguisher-handover",
  "Протокол за поддръжка на ПИС": "service-maintenance",
  "Сервизен протокол": "service-maintenance",
};

function formatDateForDisplay(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (day && month && year) {
    return `${day}.${month}.${year}`;
  }
  return value;
}

function loadProtocolByNumber(number: string): StoredProtocol | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(PROTOCOLS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const found = (parsed as StoredProtocol[]).find(
      (item) => item.number === number
    );
    return found ?? null;
  } catch {
    return null;
  }
}

function textValue(record: DataRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function protocolTypeFromDb(value: string) {
  if (value === "subscription") {
    return "Абонаментно обслужване / профилактичен преглед";
  }
  if (value === "extinguisher") return "Пожарогасители";
  if (value === "service") return "Протокол за поддръжка на ПИС";
  return value || "Протокол";
}

function protocolDisplayType(value: string) {
  return value === "Сервизен протокол"
    ? "Протокол за поддръжка на ПИС"
    : value;
}

function payloadFromDbRow(row: DataRecord) {
  const payload = row["protocol_payload"];
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Partial<StoredProtocol>)
    : {};
}

function mapDbRowToStoredProtocol(row: DataRecord): StoredProtocol {
  const payload = payloadFromDbRow(row);
  const rowStatus = textValue(row, ["status"]);

  return {
    number:
      payload.number ||
      textValue(row, ["protocol_number", "number", "id"]),
    status:
      payload.status === "completed" || rowStatus === "completed"
        ? "completed"
        : "draft",
    protocolType: protocolDisplayType(
      payload.protocolType ||
        protocolTypeFromDb(textValue(row, ["protocol_type", "type"]))
    ),
    date: payload.date || textValue(row, ["protocol_date", "date"]),
    client: payload.client || textValue(row, ["client_name"]),
    objectName: payload.objectName || textValue(row, ["object_name"]),
    address: payload.address || "",
    region: payload.region || "",
    phone: payload.phone || "",
    technician: payload.technician || textValue(row, ["technician"]),
    contractReference: payload.contractReference || "",
    clientRepresentative: payload.clientRepresentative || "",
    personnelFunctions: payload.personnelFunctions || {
      A: false,
      B: false,
      C: false,
    },
    subscriptionChecks: payload.subscriptionChecks || {},
    serviceQuality: payload.serviceQuality || "",
    notes: payload.notes || "",
    serviceDefects: payload.serviceDefects || "",
    serviceDeviations: payload.serviceDeviations || "",
    serviceSystemStatus: payload.serviceSystemStatus || "",
    nextVisitDate: payload.nextVisitDate || "",
    technicianSignatureDataUrl: payload.technicianSignatureDataUrl || "",
    clientSignatureDataUrl: payload.clientSignatureDataUrl || "",
    extinguisherRows: payload.extinguisherRows || [],
    checks: payload.checks || {},
    savedAt:
      typeof payload.savedAt === "number"
        ? payload.savedAt
        : Date.parse(textValue(row, ["updated_at", "created_at"])) || Date.now(),
    completedAt: payload.completedAt,
  };
}

async function loadDbProtocolByNumber(number: string) {
  const supabase = createSupabaseBrowserClient();

  const canonical = await supabase
    .from("protocols")
    .select("*")
    .eq("protocol_number", number)
    .maybeSingle();

  if (!canonical.error && canonical.data) {
    return mapDbRowToStoredProtocol(canonical.data as DataRecord);
  }

  const legacy = await supabase
    .from("protocols")
    .select("*")
    .eq("number", number)
    .maybeSingle();

  if (!legacy.error && legacy.data) {
    return mapDbRowToStoredProtocol(legacy.data as DataRecord);
  }

  return null;
}

function readStoredProtocols(): StoredProtocol[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(PROTOCOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredProtocol[]) : [];
  } catch {
    return [];
  }
}

async function deleteProtocolByNumber(number: string) {
  await deleteProtocolEverywhere(number);
}

function buildPrintHref(
  protocol: StoredProtocol,
  previewId: string,
  embedded = false
) {
  const slug = printSlugByType[protocol.protocolType] ?? "subscription-service";

  const goodRows = Object.entries(protocol.subscriptionChecks ?? {})
    .filter(([, value]) => value === "добро")
    .map(([key]) => key)
    .join(",");
  const badRows = Object.entries(protocol.subscriptionChecks ?? {})
    .filter(([, value]) => value === "лошо")
    .map(([key]) => key)
    .join(",");
  const personnelFunctions = Object.entries(protocol.personnelFunctions ?? {})
    .filter(([, selected]) => selected)
    .map(([name]) => name)
    .join(",");

  const params = new URLSearchParams({
    protocolNumber: protocol.number,
    date: protocol.date,
    client: protocol.client,
    objectName: protocol.objectName,
    address: protocol.address,
    region: protocol.region || "",
    phone: protocol.phone || "",
    technician: protocol.technician,
    contractReference: protocol.contractReference,
    clientRepresentative: protocol.clientRepresentative,
    contact: protocol.clientRepresentative,
    technicianSignature: protocol.technician,
    clientSignature: protocol.clientRepresentative,
    previewId,
    serviceQuality: protocol.serviceQuality || "",
    notes: protocol.notes,
    serviceDefects: protocol.serviceDefects || "",
    serviceDeviations: protocol.serviceDeviations || "",
    serviceSystemStatus: protocol.serviceSystemStatus || "",
    nextVisitDate: protocol.nextVisitDate || "",
    personnelFunctions,
    goodRows,
    badRows,
  });

  if (embedded) {
    params.set("embedded", "1");
  }

  if (Object.keys(protocol.checks ?? {}).length) {
    params.set("checks", JSON.stringify(protocol.checks));
  }

  return `/protocols/print/${slug}?${params.toString()}`;
}

const fallbackProtocol: StoredProtocol = {
  number: "PR-2026-0418",
  status: "completed",
  protocolType: "Абонаментно обслужване / профилактичен преглед",
  date: "2026-04-12",
  client: "Шумен Ритейл Груп АД",
  objectName: "МОЛ Шумен",
  address: "бул. Симеон Велики 46, 9700 Шумен",
  technician: "Иван Петров",
  contractReference: "№ FC-2026-018",
  clientRepresentative: "Мария Георгиева",
  personnelFunctions: { A: true, B: false, C: false },
  subscriptionChecks: Object.fromEntries(
    subscriptionChecklistRows.map((row) => [row.number, "добро"])
  ) as Record<string, SubscriptionCheckValue>,
  serviceQuality: "happy",
  notes: "Системата е оставена в работен режим.",
  technicianSignatureDataUrl: "",
  clientSignatureDataUrl: "",
  extinguisherRows: [],
  checks: {},
  savedAt: Date.now(),
};

export default function ProtocolViewPage() {
  const router = useRouter();
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const params = useParams<{ id: string }>();
  const protocolNumber = decodeURIComponent(
    Array.isArray(params?.id) ? params.id[0] : params?.id ?? ""
  );

  const [protocol, setProtocol] = useState<StoredProtocol | null>(null);
  const [protocolPhotos, setProtocolPhotos] = useState<ProtocolPreviewPhoto[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "missing">(
    "loading"
  );
  const [deleteDialog, setDeleteDialog] =
    useState<DeleteConfirmDialogState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [previewId] = useState(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });

  useEffect(() => {
    if (!protocolNumber) {
      setLoadState("missing");
      return;
    }

    let isMounted = true;

    async function loadProtocol() {
      setLoadState("loading");

      const dbProtocol = await loadDbProtocolByNumber(protocolNumber);
      if (!isMounted) return;

      if (dbProtocol) {
        setProtocol(dbProtocol);
        setLoadState("loaded");
        return;
      }

      const stored = loadProtocolByNumber(protocolNumber);
      if (stored) {
        setProtocol(stored);
        setLoadState("loaded");
      } else if (protocolNumber === fallbackProtocol.number) {
        setProtocol(fallbackProtocol);
        setLoadState("loaded");
      } else {
        setProtocol(null);
        setLoadState("missing");
      }
    }

    loadProtocol();

    return () => {
      isMounted = false;
    };
  }, [protocolNumber]);

  useEffect(() => {
    if (!protocol) return;

    let isMounted = true;
    const protocolNumberForPhotos = protocol.number;

    async function loadPhotos() {
      try {
        const photos = await readProtocolPhotosByNumber(protocolNumberForPhotos);
        if (!isMounted) return;
        setProtocolPhotos(
          photos.map((photo) => ({
            id: photo.id,
            name: photo.storagePath.split("/").pop() || "Снимка",
            dataUrl: photo.fileUrl,
            description: photo.description,
          }))
        );
      } catch {
        if (isMounted) setProtocolPhotos([]);
      }
    }

    loadPhotos();

    return () => {
      isMounted = false;
    };
  }, [protocol]);

  useEffect(() => {
    if (!protocol) return;

    try {
      localStorage.setItem(
        `firecontrol:protocol-preview:${previewId}`,
        JSON.stringify({
          technicianSignatureDataUrl: protocol.technicianSignatureDataUrl,
          clientSignatureDataUrl: protocol.clientSignatureDataUrl,
          extinguisherRows: protocol.extinguisherRows ?? [],
          photos: protocolPhotos,
          savedAt: Date.now(),
        })
      );
    } catch {
      // The print preview can still render without embedded signatures.
    }
  }, [previewId, protocol, protocolPhotos]);

  const printHref = useMemo(
    () => (protocol ? buildPrintHref(protocol, previewId) : null),
    [previewId, protocol]
  );
  const embeddedPrintHref = useMemo(
    () => (protocol ? buildPrintHref(protocol, previewId, true) : null),
    [previewId, protocol]
  );

  async function deleteProtocol() {
    if (!protocol) return;

    setIsDeleting(true);
    setActionError("");
    try {
      await deleteProtocolByNumber(protocol.number);
      setDeleteDialog(null);
      router.push("/protocols");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Неуспешно изтриване от базата.");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDeleteProtocol() {
    if (!protocol) return;

    setDeleteDialog({
      title: "Изтриване на протокол",
      itemLabel: `протокол ${protocol.number}`,
      onConfirm: deleteProtocol,
    });
  }

  function handlePrintProtocol() {
    const printWindow = printFrameRef.current?.contentWindow;
    if (!printWindow) return;

    printWindow.focus();
    printWindow.print();
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-4 py-6 text-slate-900">
        <div className="text-sm font-bold text-slate-500">Зареждане...</div>
      </main>
    );
  }

  if (loadState === "missing" || !protocol) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-4 py-6 text-slate-900">
        <Card className="max-w-lg p-8 text-center">
          <h1 className="text-2xl font-black">Протоколът не е намерен</h1>
          <p className="mt-3 text-sm text-slate-500">
            Не успяхме да намерим протокол с номер „{protocolNumber}". Възможно
            е да е изтрит или да не е бил запазен на това устройство.
          </p>
          <Link
            href="/protocols"
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
          >
            <ArrowLeft size={18} />
            Към протоколите
          </Link>
        </Card>
      </main>
    );
  }

  if (embeddedPrintHref && printHref) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-6 text-slate-900">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/protocols"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              <ArrowLeft size={18} />
              Назад
            </Link>

            <div className="flex flex-col gap-3 sm:flex-row">
              {protocol.status === "draft" ? (
                <Link
                  href={`/protocols/new?draft=${encodeURIComponent(protocol.number)}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 shadow-sm transition hover:bg-orange-100"
                >
                  <PenLine size={18} />
                  Редактирай
                </Link>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={handlePrintProtocol}
              >
                <Printer size={18} />
                Печат
              </Button>
              <Button variant="outline">
                <Download size={18} />
                Изтегли PDF
              </Button>
              <Button type="button" variant="danger" onClick={handleDeleteProtocol}>
                <Trash2 size={18} />
                Изтрий
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <iframe
              ref={printFrameRef}
              title={`Преглед на протокол ${protocol.number}`}
              src={embeddedPrintHref}
              className="h-[calc(100vh-150px)] min-h-[760px] w-full bg-slate-100"
            />
          </div>
        </div>
      </main>
    );
  }

  const displayDate = formatDateForDisplay(protocol.date);
  const isSubscription =
    protocol.protocolType === "Абонаментно обслужване / профилактичен преглед";
  const isExtinguisher = protocol.protocolType === "Пожарогасители";
  const personnelLabel = (
    Object.entries(protocol.personnelFunctions ?? {}) as Array<
      ["A" | "B" | "C", boolean]
    >
  )
    .filter(([, selected]) => selected)
    .map(([name]) => name)
    .join(", ");
  const serviceQualityLabel =
    protocol.serviceQuality === "happy"
      ? "Доволен"
      : protocol.serviceQuality === "neutral"
        ? "Неутрален"
        : protocol.serviceQuality === "sad"
          ? "Недоволен"
          : "Не е отбелязано";
  const ServiceQualityIcon =
    protocol.serviceQuality === "happy"
      ? Smile
      : protocol.serviceQuality === "neutral"
        ? Meh
        : protocol.serviceQuality === "sad"
          ? Frown
          : null;

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-5xl">
        {actionError ? (
          <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {actionError}
          </Card>
        ) : null}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/protocols"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <ArrowLeft size={18} />
            Назад
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row">
            {protocol.status === "draft" ? (
              <Link
                href={`/protocols/new?draft=${encodeURIComponent(protocol.number)}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 shadow-sm transition hover:bg-orange-100"
              >
                <PenLine size={18} />
                Редактирай
              </Link>
            ) : null}
            {printHref ? (
              <Link
                href={printHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                <Printer size={18} />
                Печат
              </Link>
            ) : null}
            <Button variant="outline">
              <Download size={18} />
              Изтегли PDF
            </Button>
            <Button type="button" variant="danger" onClick={handleDeleteProtocol}>
              <Trash2 size={18} />
              Изтрий
            </Button>
          </div>
        </div>

        <Card className="p-6 md:p-10">
          <header className="border-b border-slate-200 pb-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-2xl font-black tracking-tight">
                  FIRE<span className="text-orange-500">Control</span>
                </div>
                <h1 className="mt-5 text-3xl font-black">
                  {protocol.protocolType}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {protocol.status === "completed"
                    ? "Завършен сервизен документ"
                    : "Чернова на протокол"}
                </p>
              </div>
              <div className="text-left md:text-right">
                <Badge
                  variant={
                    protocol.status === "completed" ? "success" : "neutral"
                  }
                >
                  {protocol.status === "completed" ? "Завършен" : "Чернова"}
                </Badge>
                <div className="mt-3 text-lg font-black">{protocol.number}</div>
                <div className="text-sm font-medium text-slate-500">
                  {displayDate}
                </div>
              </div>
            </div>
          </header>

          <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Обект", protocol.objectName || "—"],
              ["Клиент", protocol.client || "—"],
              ["Дата", displayDate || "—"],
              ["Техник", protocol.technician || "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase text-slate-400">
                  {label}
                </div>
                <div className="mt-1 font-black text-slate-800">{value}</div>
              </div>
            ))}
          </section>

          {isSubscription ? (
            <>
              <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  ["Договор / основание", protocol.contractReference || "—"],
                  [
                    "Представител на клиента",
                    protocol.clientRepresentative || "—",
                  ],
                  ["Адрес", protocol.address || "—"],
                  [
                    "Персонал, изпълняващ функция",
                    personnelLabel || "не е отбелязан",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="text-xs font-bold uppercase text-slate-400">
                      {label}
                    </div>
                    <div className="mt-1 font-black text-slate-800">{value}</div>
                  </div>
                ))}
              </section>

              <section className="mt-8">
                <h2 className="text-xl font-black">
                  АПГИ – спринклерна инсталация
                </h2>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse bg-white text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
                        <tr>
                          <th className="px-4 py-4">№</th>
                          <th className="px-4 py-4">Наименование</th>
                          <th className="px-4 py-4">Периодичност</th>
                          <th className="px-4 py-4">Състояние</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {subscriptionChecklistRows.map((row) => {
                          const state =
                            protocol.subscriptionChecks?.[row.number] ??
                            "непопълнено";
                          const variant =
                            state === "добро"
                              ? "success"
                              : state === "лошо"
                                ? "danger"
                                : "neutral";
                          const label =
                            state === "добро"
                              ? "Добро"
                              : state === "лошо"
                                ? "Лошо"
                                : "Непопълнено";
                          return (
                            <tr key={row.number}>
                              <td className="px-4 py-4 font-black text-slate-500">
                                {row.number}
                              </td>
                              <td className="px-4 py-4 font-bold text-slate-800">
                                {row.label}
                              </td>
                              <td className="px-4 py-4 text-slate-600">
                                {row.periodicity}
                              </td>
                              <td className="px-4 py-4">
                                <Badge variant={variant}>{label}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-black text-slate-800">
                    Качество на услугата
                  </div>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm leading-6 text-slate-600">
                    {ServiceQualityIcon ? (
                      <ServiceQualityIcon size={17} className="text-orange-600" />
                    ) : null}
                    {serviceQualityLabel}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-black text-slate-800">Бележки</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {protocol.notes || "Няма бележки."}
                  </p>
                </div>
              </section>
            </>
          ) : null}

          {isExtinguisher && protocol.extinguisherRows?.length ? (
            <section className="mt-8">
              <h2 className="text-xl font-black">Пожарогасители</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse bg-white text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
                      <tr>
                        <th className="px-4 py-4">№</th>
                        <th className="px-4 py-4">Идентификация</th>
                        <th className="px-4 py-4">Тип</th>
                        <th className="px-4 py-4">Стикер</th>
                        <th className="px-4 py-4">Дата на обслужване</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {protocol.extinguisherRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-4 font-black text-slate-500">
                            {row.rowNumber}
                          </td>
                          <td className="px-4 py-4 font-bold text-slate-800">
                            {row.identificationMarking}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {row.category}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {row.stickerNumber || "—"}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatDateForDisplay(row.serviceDate) || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          {!isSubscription &&
          !isExtinguisher &&
          Object.keys(protocol.checks ?? {}).length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-black">Извършени дейности</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse bg-white text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
                      <tr>
                        <th className="px-4 py-4">№</th>
                        <th className="px-4 py-4">Описание</th>
                        <th className="px-4 py-4">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(protocol.checks).map(
                        ([item, status], index) => (
                          <tr key={item}>
                            <td className="px-4 py-4 font-black text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-4 font-bold text-slate-800">
                              {item}
                            </td>
                            <td className="px-4 py-4">
                              <Badge
                                variant={
                                  status === "Изпълнено" ? "success" : "neutral"
                                }
                              >
                                {status}
                              </Badge>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          <footer className="mt-10 grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
            <div>
              <div className="font-black">Техник</div>
              <div className="mt-2 text-sm text-slate-600">
                {protocol.technician || "—"}
              </div>
              <div className="mt-4 flex min-h-[60px] items-end border-b border-slate-300">
                {protocol.technicianSignatureDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={protocol.technicianSignatureDataUrl}
                    alt={`Подпис - ${protocol.technician}`}
                    className="max-h-12 max-w-full object-contain"
                  />
                ) : (
                  <div className="pb-2 text-xs text-slate-400">
                    <PenLine size={14} className="mr-1 inline" />
                    Без подпис
                  </div>
                )}
              </div>
              <div className="mt-1 text-center text-xs text-slate-400">
                подпис
              </div>
            </div>
            <div>
              <div className="font-black">Клиент</div>
              <div className="mt-2 text-sm text-slate-600">
                {protocol.clientRepresentative ||
                  protocol.client ||
                  "—"}
              </div>
              <div className="mt-4 flex min-h-[60px] items-end border-b border-slate-300">
                {protocol.clientSignatureDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={protocol.clientSignatureDataUrl}
                    alt={`Подпис - ${protocol.clientRepresentative}`}
                    className="max-h-12 max-w-full object-contain"
                  />
                ) : (
                  <div className="pb-2 text-xs text-slate-400">
                    <PenLine size={14} className="mr-1 inline" />
                    Без подпис
                  </div>
                )}
              </div>
              <div className="mt-1 text-center text-xs text-slate-400">
                подпис
              </div>
            </div>
          </footer>
        </Card>
      </div>
      <DeleteConfirmDialog
        dialog={deleteDialog}
        busy={isDeleting}
        onCancel={() => {
          if (!isDeleting) setDeleteDialog(null);
        }}
      />
    </main>
  );
}

