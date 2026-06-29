"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncProtocolsToSupabase } from "../../lib/protocols-sync";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  FileText,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  DeleteConfirmDialog,
  type DeleteConfirmDialogState,
} from "../../components/ui/delete-confirm-dialog";
import { Input } from "../../components/ui/input";
import { TabButton, Tabs } from "../../components/ui/tabs";
import {
  deleteProtocolEverywhere,
  protocolsStorageKey,
  protocolsUpdatedEvent,
  readDeletedProtocolNumbers,
} from "../../lib/protocols-delete";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type ProtocolStatus = "Чернова" | "За преглед" | "Завършен" | "Изпратен";

type ProtocolListItem = {
  number: string;
  type: string;
  client: string;
  object: string;
  technician: string;
  date: string;
  status: ProtocolStatus;
  photos: number;
  signed: boolean;
  emailed: boolean;
  source: "stored" | "demo";
  savedAt?: number;
};

type StoredProtocol = {
  number: string;
  status: "draft" | "completed";
  protocolType: string;
  date: string;
  client: string;
  objectName: string;
  technician: string;
  photos?: unknown[];
  technicianSignatureDataUrl?: string;
  clientSignatureDataUrl?: string;
  savedAt: number;
};

type DataRecord = Record<string, unknown>;

const PROTOCOLS_STORAGE_KEY = protocolsStorageKey;
const PROTOCOLS_UPDATED_EVENT = protocolsUpdatedEvent;

const filterTabs: Array<{ label: string; value: ProtocolStatus | "all" }> = [
  { label: "Всички", value: "all" },
  { label: "Чернови", value: "Чернова" },
  { label: "За преглед", value: "За преглед" },
  { label: "Завършени", value: "Завършен" },
  { label: "Изпратени", value: "Изпратен" },
];

const demoProtocols: ProtocolListItem[] = [
  {
    number: "PR-2026-0418",
    type: "Месечна проверка",
    client: "Шумен Ритейл Груп АД",
    object: "МОЛ Шумен",
    technician: "Иван Петров",
    date: "12.04.2026",
    status: "Завършен",
    photos: 8,
    signed: true,
    emailed: true,
    source: "demo",
  },
  {
    number: "PR-2026-0417",
    type: "Пожарогасители",
    client: "Север Логистик ЕООД",
    object: "Склад Север",
    technician: "Георги Димитров",
    date: "11.04.2026",
    status: "За преглед",
    photos: 5,
    signed: true,
    emailed: false,
    source: "demo",
  },
  {
    number: "PR-2026-0416",
    type: "Протокол за поддръжка на ПИС",
    client: "Хотел Централ ООД",
    object: "Хотел Централ",
    technician: "Николай Стоянов",
    date: "10.04.2026",
    status: "Чернова",
    photos: 2,
    signed: false,
    emailed: false,
    source: "demo",
  },
  {
    number: "PR-2026-0415",
    type: "Месечна проверка",
    client: "Варна Бизнес Парк АД",
    object: "Бизнес център Варна",
    technician: "Иван Петров",
    date: "09.04.2026",
    status: "Изпратен",
    photos: 11,
    signed: true,
    emailed: true,
    source: "demo",
  },
  {
    number: "PR-2026-0414",
    type: "Пожарогасители",
    client: "Тракия Инвест ЕАД",
    object: "Логистичен парк Изток",
    technician: "Георги Димитров",
    date: "08.04.2026",
    status: "Завършен",
    photos: 6,
    signed: true,
    emailed: false,
    source: "demo",
  },
  {
    number: "PR-2026-0413",
    type: "Протокол за поддръжка на ПИС",
    client: "Офис Център Шумен",
    object: "Офис сграда Център",
    technician: "Николай Стоянов",
    date: "07.04.2026",
    status: "За преглед",
    photos: 4,
    signed: false,
    emailed: false,
    source: "demo",
  },
];

const statusVariant = {
  "Чернова": "neutral",
  "За преглед": "warning",
  "Завършен": "success",
  "Изпратен": "orange",
} as const;

function formatStoredDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (day && month && year) {
    return `${day}.${month}.${year}`;
  }
  return value;
}

function mapStoredToListItem(record: StoredProtocol): ProtocolListItem {
  const status: ProtocolStatus =
    record.status === "completed" ? "Завършен" : "Чернова";
  const signed = Boolean(
    record.technicianSignatureDataUrl && record.clientSignatureDataUrl
  );

  return {
    number: record.number,
    type: record.protocolType || "Протокол",
    client: record.client || "—",
    object: record.objectName || "—",
    technician: record.technician || "—",
    date: formatStoredDate(record.date),
    status,
    photos: Array.isArray(record.photos) ? record.photos.length : 0,
    signed,
    emailed: false,
    source: "stored",
    savedAt: record.savedAt,
  };
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

function photoCountLabel(count: number) {
  return count === 1 ? "1 снимка" : `${count} снимки`;
}

function payloadFromDbRow(row: DataRecord) {
  const payload = row["protocol_payload"];
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Partial<StoredProtocol>)
    : {};
}

function mapDbRowToListItem(row: DataRecord): ProtocolListItem {
  const payload = payloadFromDbRow(row);
  const number =
    payload.number ||
    textValue(row, ["protocol_number", "number", "id"]) ||
    "";
  const rowStatus = textValue(row, ["status"]);
  const statusValue =
    payload.status === "completed" || rowStatus === "completed"
      ? "completed"
      : "draft";
  const protocolType =
    protocolDisplayType(
      payload.protocolType ||
        protocolTypeFromDb(textValue(row, ["protocol_type", "type"]))
    );
  const date = payload.date || textValue(row, ["protocol_date", "date"]);

  return mapStoredToListItem({
    number,
    status: statusValue,
    protocolType,
    date,
    client: payload.client || textValue(row, ["client_name"]),
    objectName: payload.objectName || textValue(row, ["object_name"]),
    technician: payload.technician || textValue(row, ["technician"]),
    technicianSignatureDataUrl: payload.technicianSignatureDataUrl || "",
    clientSignatureDataUrl: payload.clientSignatureDataUrl || "",
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    savedAt:
      typeof payload.savedAt === "number"
        ? payload.savedAt
        : Date.parse(textValue(row, ["updated_at", "created_at"])) || Date.now(),
  });
}

async function readDbProtocols(): Promise<ProtocolListItem[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("protocols").select("*");

  if (error) {
    console.warn("[protocols] failed to load Supabase protocols", error.message);
    return [];
  }

  const deletedNumbers = readDeletedProtocolNumbers();

  const protocols = ((data as DataRecord[]) ?? [])
    .map(mapDbRowToListItem)
    .filter((item) => item.number && !deletedNumbers.has(item.number))
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));

  const protocolNumbers = protocols.map((item) => item.number).filter(Boolean);
  if (!protocolNumbers.length) return protocols;

  const { data: photoRows, error: photosError } = await supabase
    .from("protocol_photos")
    .select("protocol_number")
    .in("protocol_number", protocolNumbers);

  if (photosError) {
    console.warn("[protocols] failed to load photo counts", photosError.message);
    return protocols;
  }

  const photoCounts = new Map<string, number>();
  for (const row of (photoRows as DataRecord[]) ?? []) {
    const protocolNumber = textValue(row, ["protocol_number"]);
    if (!protocolNumber) continue;
    photoCounts.set(protocolNumber, (photoCounts.get(protocolNumber) ?? 0) + 1);
  }

  return protocols.map((item) => ({
    ...item,
    photos: Math.max(item.photos, photoCounts.get(item.number) ?? 0),
  }));
}

function readStoredProtocols(): ProtocolListItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(PROTOCOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredProtocol[]).map(mapStoredToListItem);
  } catch {
    return [];
  }
}

function readDeletedDemoProtocolNumbers() {
  if (typeof window === "undefined") return new Set<string>();
  return readDeletedProtocolNumbers();
}

export default function ProtocolsPage() {
  const [storedProtocols, setStoredProtocols] = useState<ProtocolListItem[]>(
    []
  );
  const [dbProtocols, setDbProtocols] = useState<ProtocolListItem[]>([]);
  const [deletedDemoProtocolNumbers, setDeletedDemoProtocolNumbers] = useState<
    Set<string>
  >(new Set());
  const [activeFilter, setActiveFilter] = useState<ProtocolStatus | "all">(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] =
    useState<DeleteConfirmDialogState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState("");

  async function refreshProtocols() {
    setIsRefreshing(true);
    setStoredProtocols(readStoredProtocols());
    setDeletedDemoProtocolNumbers(readDeletedDemoProtocolNumbers());

    try {
      setDbProtocols(await readDbProtocols());
    } finally {
      setIsRefreshing(false);
    }
  }

  // Sync any localStorage-only protocols to Supabase once on mount.
  // This is idempotent — only records missing from the DB are pushed.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    syncProtocolsToSupabase().then(({ synced, errors }) => {
      if (synced > 0) console.log(`[protocols-sync] pushed ${synced} protocol(s) to Supabase`);
      if (errors.length > 0) console.warn("[protocols-sync] errors:", errors);
    });
  }, []);

  useEffect(() => {
    void refreshProtocols();

    const params = new URLSearchParams(window.location.search);
    if (params.get("filter") === "drafts") {
      setActiveFilter("Чернова");
    }

    function onStorage(event: StorageEvent) {
      if (event.key && event.key !== PROTOCOLS_STORAGE_KEY) return;
      void refreshProtocols();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(PROTOCOLS_UPDATED_EVENT, refreshProtocols);

    function onFocus() {
      void refreshProtocols();
    }

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        PROTOCOLS_UPDATED_EVENT,
        refreshProtocols
      );
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const allProtocols = useMemo(() => {
    // Supabase is first because localStorage is only a compact UI cache.
    const seen = new Set<string>();
    const combined: ProtocolListItem[] = [];
    for (const item of dbProtocols) {
      if (seen.has(item.number)) continue;
      seen.add(item.number);
      combined.push(item);
    }
    for (const item of storedProtocols) {
      if (seen.has(item.number)) continue;
      seen.add(item.number);
      combined.push(item);
    }
    for (const item of demoProtocols) {
      if (deletedDemoProtocolNumbers.has(item.number)) continue;
      if (seen.has(item.number)) continue;
      seen.add(item.number);
      combined.push(item);
    }
    return combined;
  }, [dbProtocols, deletedDemoProtocolNumbers, storedProtocols]);

  const counts = useMemo(() => {
    const result: Record<ProtocolStatus | "all", number> = {
      all: allProtocols.length,
      "Чернова": 0,
      "За преглед": 0,
      "Завършен": 0,
      "Изпратен": 0,
    };
    for (const item of allProtocols) {
      result[item.status] += 1;
    }
    return result;
  }, [allProtocols]);

  const filteredProtocols = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allProtocols.filter((item) => {
      if (activeFilter !== "all" && item.status !== activeFilter) return false;
      if (!query) return true;
      return (
        item.number.toLowerCase().includes(query) ||
        item.client.toLowerCase().includes(query) ||
        item.object.toLowerCase().includes(query) ||
        item.technician.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query)
      );
    });
  }, [allProtocols, activeFilter, searchQuery]);

  async function deleteProtocol(protocol: ProtocolListItem) {
    setIsDeleting(true);
    setActionError("");
    try {
      await deleteProtocolEverywhere(protocol.number);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Неуспешно изтриване от базата."
      );
      return;
    } finally {
      setIsDeleting(false);
    }

    setDeleteDialog(null);
    await refreshProtocols();
  }

  function handleDeleteProtocol(protocol: ProtocolListItem) {
    setDeleteDialog({
      title: "Изтриване на протокол",
      itemLabel: `протокол ${protocol.number}`,
      onConfirm: () => deleteProtocol(protocol),
    });
  }

  return (
    <AppShell
      title="Протоколи"
      description="Сервизни протоколи, проверки и история на обслужване"
      showSearch={false}
    >
      {actionError ? (
        <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {actionError}
        </Card>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xl">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Търсене по номер, клиент или обект..."
            className="w-full pl-11"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/protocols/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
          >
            <Plus size={18} />
            Нов протокол
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={refreshProtocols}
            disabled={isRefreshing}
          >
            <RefreshCw
              size={17}
              className={isRefreshing ? "animate-spin" : ""}
            />
            Обнови
          </Button>
        </div>
      </div>

      <Tabs className="mt-6">
        {filterTabs.map((tab) => (
          <TabButton
            key={tab.value}
            type="button"
            active={activeFilter === tab.value}
            onClick={() => setActiveFilter(tab.value)}
          >
            {tab.label}
            <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-black text-slate-600">
              {counts[tab.value]}
            </span>
          </TabButton>
        ))}
      </Tabs>

      {filteredProtocols.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <FileText size={22} />
          </div>
          <div className="mt-3 text-base font-black text-slate-800">
            Няма протоколи в тази категория
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery
              ? "Опитайте друго търсене или сменете филтъра."
              : "Създайте нов протокол или сменете филтъра."}
          </p>
          <Link
            href="/protocols/new"
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
          >
            <Plus size={18} />
            Нов протокол
          </Link>
        </div>
      ) : (
        <section className="mt-6 space-y-4">
          {filteredProtocols.map((protocol) => (
              <Card
                key={protocol.number}
                hover
                className="rounded-2xl p-5 transition hover:-translate-y-0.5"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                        <FileText size={20} />
                      </div>
                      <div>
                        <Link
                          href={`/protocols/view/${encodeURIComponent(protocol.number)}`}
                          className="text-lg font-black text-slate-900 transition hover:text-orange-700"
                        >
                          {protocol.number}
                        </Link>
                        <div className="mt-1 text-sm font-bold text-slate-500">
                          {protocol.type}
                        </div>
                      </div>
                      <Badge variant={statusVariant[protocol.status]}>
                        {protocol.status}
                      </Badge>
                      {protocol.source === "stored" ? (
                        <Badge variant="orange">Нов</Badge>
                      ) : null}
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-xs font-bold uppercase text-slate-400">
                          Клиент
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-800">
                          {protocol.client}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase text-slate-400">
                          Обект
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-800">
                          {protocol.object}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase text-slate-400">
                          Техник
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm font-black text-slate-800">
                          <UserRound size={15} />
                          {protocol.technician}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase text-slate-400">
                          Дата
                        </div>
                        <div className="mt-1 text-sm font-black text-slate-800">
                          {protocol.date}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 xl:items-end">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="neutral">
                        <Camera size={14} />
                        {photoCountLabel(protocol.photos)}
                      </Badge>
                      <Badge variant={protocol.signed ? "success" : "neutral"}>
                        <PenLine size={14} />
                        {protocol.signed ? "Подписан" : "Без подпис"}
                      </Badge>
                      <Badge variant={protocol.emailed ? "success" : "neutral"}>
                        {protocol.emailed ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Mail size={14} />
                        )}
                        {protocol.emailed ? "Имейл изпратен" : "Неизпратен"}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => handleDeleteProtocol(protocol)}
                      >
                        <Trash2 size={17} />
                        Изтрий
                      </Button>

                      <Link
                        href={`/protocols/view/${encodeURIComponent(protocol.number)}`}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                      >
                      Отвори
                      <ArrowRight size={17} />
                      </Link>
                      {protocol.status === "Чернова" ? (
                        <Link
                          href={`/protocols/new?draft=${encodeURIComponent(protocol.number)}`}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 transition hover:bg-orange-100"
                        >
                          Редактирай
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
          ))}
        </section>
      )}
      <DeleteConfirmDialog
        dialog={deleteDialog}
        busy={isDeleting}
        onCancel={() => {
          if (!isDeleting) setDeleteDialog(null);
        }}
      />
    </AppShell>
  );
}

