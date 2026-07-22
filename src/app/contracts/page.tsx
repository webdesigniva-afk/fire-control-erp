"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CalendarPlus,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

const contractsPerPage = 10;

type ContractListItem = {
  id: string;
  opportunityId: string;
  number: string;
  client: string;
  objectName: string;
  href: string;
  offerHref: string;
  offerNumber: string;
  status: "accepted" | "draft" | "terminated";
  createdAt: string;
  expiresAt: string;
  terminatedAt: string;
  terminationReason: string;
  serviceCount: number;
  payload: DataRecord;
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

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYearsToDateValue(value: string, years: number) {
  if (!value || !value.includes("-")) return "";

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";

  date.setFullYear(date.getFullYear() + years);
  return dateKey(date);
}

function addMonthsToDateValue(value: string, months: number) {
  if (!value || !value.includes("-")) return "";

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";

  date.setMonth(date.getMonth() + months);
  return dateKey(date);
}

function formatDateValue(value: string) {
  if (!value) return "—";
  if (!value.includes("-")) return value;

  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function countContractServices(contract: DataRecord) {
  const lines = contract["lines"];
  return Array.isArray(lines) ? lines.length : 0;
}

function servicesCountLabel(count: number) {
  if (count === 1) return "1 услуга";
  return `${count} услуги`;
}

function daysBetween(fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function contractState(contract: ContractListItem, todayKey: string) {
  if (contract.status === "terminated") {
    return { label: "Прекратен", variant: "danger" as const };
  }

  const days = daysBetween(todayKey, contract.expiresAt);

  if (contract.expiresAt && days < 0) {
    return { label: "Изтекъл", variant: "danger" as const };
  }

  if (contract.expiresAt && days <= 30) {
    return { label: "Изтича скоро", variant: "warning" as const };
  }

  if (contract.status === "accepted") {
    return { label: "Договор приет", variant: "success" as const };
  }

  return { label: "Чернова", variant: "neutral" as const };
}

function savedContractIsAccepted(payload: unknown) {
  if (!isRecord(payload)) return false;
  const signature = isRecord(payload.signature) ? payload.signature : {};
  return payload.status === "accepted" || signature.status === "signed";
}

function opportunityIdFromContract(row: DataRecord, href: string) {
  const payload = isRecord(row.payload) ? row.payload : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const fromPayload = textValue(contract, ["opportunityId", "opportunity_id"]);
  if (fromPayload) return fromPayload;

  const fromId = textValue(row, ["id"]).replace(/^contract-/, "");
  if (fromId) return fromId;

  const match = href.match(/\/sales\/contract\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function mapContract(row: DataRecord): ContractListItem {
  const payload = isRecord(row.payload) ? row.payload : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const href = textValue(row, ["href"]) || `/sales/contract/${textValue(row, ["id"]).replace(/^contract-/, "")}`;
  const opportunityId = opportunityIdFromContract(row, href);
  const offerNumber =
    textValue(contract, ["offerNumber", "offer_number"]) ||
    textValue(payload, ["offerNumber", "offer_number"]);
  const createdAt =
    textValue(contract, ["date", "createdAt", "created_at"]) ||
    textValue(row, ["updated_at", "created_at"]).slice(0, 10);
  const status = textValue(payload, ["status"]) || textValue(contract, ["status"]);
  const expiresAt =
    textValue(contract, ["expiresAt", "expires_at", "endDate", "end_date"]) ||
    textValue(payload, ["expiresAt", "expires_at"]) ||
    addYearsToDateValue(createdAt, 1);

  return {
    id: textValue(row, ["id"]),
    opportunityId,
    number: textValue(row, ["number"]) || textValue(contract, ["number"]) || "Без номер",
    client: textValue(row, ["client"]) || textValue(contract, ["client"]) || "Без клиент",
    objectName: textValue(row, ["object"]) || textValue(contract, ["object"]) || "Без обект",
    href: `${href}${href.includes("?") ? "&" : "?"}mode=view`,
    offerHref: opportunityId ? `/sales/offer/${encodeURIComponent(opportunityId)}?mode=view` : "",
    offerNumber,
    status: status === "terminated" ? "terminated" : savedContractIsAccepted(payload) ? "accepted" : "draft",
    createdAt,
    expiresAt,
    terminatedAt: textValue(contract, ["terminatedAt", "terminated_at"]) || textValue(payload, ["terminatedAt", "terminated_at"]),
    terminationReason:
      textValue(contract, ["terminationReason", "termination_reason"]) ||
      textValue(payload, ["terminationReason", "termination_reason"]),
    serviceCount: countContractServices(contract),
    payload,
  };
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [deleteTarget, setDeleteTarget] = useState<ContractListItem | null>(null);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "error">("idle");
  const [extendTarget, setExtendTarget] = useState<ContractListItem | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const [extendNote, setExtendNote] = useState("");
  const [extendState, setExtendState] = useState<"idle" | "saving" | "error">("idle");
  const [terminateTarget, setTerminateTarget] = useState<ContractListItem | null>(null);
  const [terminateDate, setTerminateDate] = useState("");
  const [terminateReason, setTerminateReason] = useState("По взаимно съгласие");
  const [terminateNote, setTerminateNote] = useState("");
  const [terminateStopTasks, setTerminateStopTasks] = useState(true);
  const [terminateState, setTerminateState] = useState<"idle" | "saving" | "error">("idle");
  const [contractPage, setContractPage] = useState(1);
  const todayKey = useMemo(() => dateKey(new Date()), []);

  useEffect(() => {
    let cancelled = false;

    async function loadContracts() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("saved_documents")
          .select("id,number,client,object,href,payload,updated_at")
          .eq("kind", "contract")
          .order("updated_at", { ascending: false });

        if (error) throw new Error(error.message);
        if (cancelled) return;

        setContracts(((data as DataRecord[]) ?? []).map(mapContract));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadContracts();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredContracts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return contracts;

    return contracts.filter((contract) =>
      [
        contract.number,
        contract.client,
        contract.objectName,
        contract.offerNumber,
        String(contract.serviceCount),
      ].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [contracts, query]);

  const totalContractPages = Math.max(1, Math.ceil(filteredContracts.length / contractsPerPage));
  const safeContractPage = Math.min(contractPage, totalContractPages);
  const contractPageStart = (safeContractPage - 1) * contractsPerPage;
  const pagedContracts = filteredContracts.slice(
    contractPageStart,
    contractPageStart + contractsPerPage
  );
  const visibleContractStart = filteredContracts.length ? contractPageStart + 1 : 0;
  const visibleContractEnd = Math.min(contractPageStart + contractsPerPage, filteredContracts.length);

  useEffect(() => {
    setContractPage(1);
  }, [query]);

  useEffect(() => {
    if (contractPage > totalContractPages) {
      setContractPage(totalContractPages);
    }
  }, [contractPage, totalContractPages]);

  async function deleteContractEverywhere(contract: ContractListItem) {
    setDeleteState("deleting");
    try {
      const supabase = createSupabaseBrowserClient();

      const { error: portalError } = await supabase
        .from("client_portal_documents")
        .delete()
        .eq("saved_document_id", contract.id);
      if (portalError) throw new Error(portalError.message);

      const { error: savedDocumentError } = await supabase
        .from("saved_documents")
        .delete()
        .eq("id", contract.id)
        .eq("kind", "contract");
      if (savedDocumentError) throw new Error(savedDocumentError.message);

      setContracts((current) => current.filter((item) => item.id !== contract.id));
      setDeleteTarget(null);
      setDeleteState("idle");
    } catch {
      setDeleteState("error");
    }
  }

  function openExtendContract(contract: ContractListItem) {
    setExtendTarget(contract);
    setExtendDate(addMonthsToDateValue(contract.expiresAt || contract.createdAt, 12));
    setExtendNote("");
    setExtendState("idle");
  }

  function openTerminateContract(contract: ContractListItem) {
    setTerminateTarget(contract);
    setTerminateDate(dateKey(new Date()));
    setTerminateReason("По взаимно съгласие");
    setTerminateNote("");
    setTerminateStopTasks(true);
    setTerminateState("idle");
  }

  function contractPayloadWithEvent(
    contract: ContractListItem,
    updates: DataRecord,
    event: DataRecord
  ) {
    const payload = contract.payload;
    const contractData = isRecord(payload.contract) ? payload.contract : {};
    const events = Array.isArray(payload.contractEvents) ? payload.contractEvents : [];

    return {
      ...payload,
      ...updates,
      contract: {
        ...contractData,
        ...updates,
      },
      contractEvents: [
        ...events,
        {
          ...event,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  async function extendContract() {
    if (!extendTarget || !extendDate) return;
    setExtendState("saving");
    try {
      const now = new Date().toISOString();
      const payload = contractPayloadWithEvent(
        extendTarget,
        {
          status: "accepted",
          expiresAt: extendDate,
        },
        {
          type: "extended",
          title: "Договорът е удължен",
          description: extendNote || `Договорът е удължен до ${formatDateValue(extendDate)}.`,
          previousExpiresAt: extendTarget.expiresAt,
          nextExpiresAt: extendDate,
        }
      );

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("saved_documents")
        .update({ payload, updated_at: now })
        .eq("id", extendTarget.id)
        .eq("kind", "contract");
      if (error) throw new Error(error.message);

      setContracts((current) =>
        current.map((item) =>
          item.id === extendTarget.id
            ? {
                ...item,
                status: "accepted",
                expiresAt: extendDate,
                payload,
              }
            : item
        )
      );
      setExtendTarget(null);
      setExtendState("idle");
    } catch {
      setExtendState("error");
    }
  }

  async function terminateContract() {
    if (!terminateTarget || !terminateDate) return;
    setTerminateState("saving");
    try {
      const now = new Date().toISOString();
      const payload = contractPayloadWithEvent(
        terminateTarget,
        {
          status: "terminated",
          terminatedAt: terminateDate,
          terminationReason: terminateReason,
          terminationNote: terminateNote,
        },
        {
          type: "terminated",
          title: "Договорът е прекратен",
          description: terminateNote || terminateReason,
          terminatedAt: terminateDate,
          reason: terminateReason,
        }
      );

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("saved_documents")
        .update({ payload, updated_at: now })
        .eq("id", terminateTarget.id)
        .eq("kind", "contract");
      if (error) throw new Error(error.message);

      if (terminateTarget.opportunityId) {
        await supabase
          .from("sales_opportunities")
          .update({ status: "Прекратен", updated_at: now, last_activity_at: now })
          .eq("id", terminateTarget.opportunityId);
      }

      if (terminateStopTasks) {
        await supabase
          .from("service_tasks")
          .update({
            status: "cancelled",
            resolution_note: `Прекратен договор ${terminateTarget.number}. ${terminateReason}`,
            resolved_at: now,
            updated_at: now,
          })
          .eq("client", terminateTarget.client)
          .eq("object_name", terminateTarget.objectName)
          .gte("due_date", terminateDate)
          .in("status", ["planned", "pending", "active"]);
      }

      setContracts((current) =>
        current.map((item) =>
          item.id === terminateTarget.id
            ? {
                ...item,
                status: "terminated",
                terminatedAt: terminateDate,
                terminationReason: terminateReason,
                payload,
              }
            : item
        )
      );
      setTerminateTarget(null);
      setTerminateState("idle");
    } catch {
      setTerminateState("error");
    }
  }

  return (
    <AppShell
      title="Договори"
      description="Всички договори, срокове и свързани обекти"
      showSearch={false}
    >
      <div className="space-y-4">
        <div className="relative w-full lg:max-w-xl">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Търсене по номер, клиент или обект..."
            className="pl-11"
          />
        </div>

        {loadState === "loading" ? (
          <Card className="flex min-h-48 items-center justify-center p-8">
            <Loader2 className="animate-spin text-orange-500" size={28} />
          </Card>
        ) : null}

        {loadState === "error" ? (
          <Card className="p-8">
            <div className="text-sm font-bold text-red-600">Договорите не могат да се заредят.</div>
          </Card>
        ) : null}

        {loadState === "ready" && filteredContracts.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <FileText size={22} />
            </div>
            <div className="mt-3 text-sm font-bold text-slate-500">Няма намерени договори.</div>
          </Card>
        ) : null}

        {loadState === "ready" && filteredContracts.length > 0 ? (
          <div className="grid gap-3">
            {pagedContracts.map((contract) => {
              const state = contractState(contract, todayKey);

              return (
                <Card key={contract.id} hover className="px-5 py-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(300px,1.25fr)_minmax(360px,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-black text-slate-950">{contract.number}</div>
                        <Badge variant={state.variant}>{state.label}</Badge>
                        {contract.offerHref ? (
                          <Link
                            href={contract.offerHref}
                            title={contract.offerNumber || "Отвори оферта"}
                            className="inline-flex min-w-0 max-w-44 items-center gap-1 text-xs font-black text-orange-700 transition hover:text-orange-800"
                          >
                            <ExternalLink size={12} className="shrink-0" />
                            <span className="truncate">{contract.offerNumber || "Отвори оферта"}</span>
                          </Link>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-slate-600">{contract.client}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-400">{contract.objectName}</div>
                    </div>

                    <div className="grid gap-3 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:py-0.5 lg:pl-5">
                      <div>
                        <div className="uppercase text-slate-400">Създаден</div>
                        <div className="mt-1 text-sm text-slate-800">{formatDateValue(contract.createdAt)}</div>
                      </div>
                      <div>
                        <div className="uppercase text-slate-400">Изтича</div>
                        <div className="mt-1 text-sm text-slate-800">{formatDateValue(contract.expiresAt)}</div>
                      </div>
                      <div>
                        <div className="uppercase text-slate-400">Услуги</div>
                        <div className="mt-1 text-sm text-slate-800">{servicesCountLabel(contract.serviceCount)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {contract.status !== "terminated" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openExtendContract(contract)}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-100"
                            aria-label={`Удължи договор ${contract.number}`}
                            title="Удължи договор"
                          >
                            <CalendarPlus size={17} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openTerminateContract(contract)}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-700 shadow-sm transition hover:border-amber-200 hover:bg-amber-100"
                            aria-label={`Прекрати договор ${contract.number}`}
                            title="Прекрати договор"
                          >
                            <Ban size={17} />
                          </button>
                        </>
                      ) : null}
                      <Link
                        href={contract.href}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md"
                        aria-label={`Отвори договор ${contract.number}`}
                        title="Отвори договор"
                      >
                        <Eye size={17} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(contract);
                          setDeleteState("idle");
                        }}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 shadow-sm transition hover:border-red-200 hover:bg-red-100"
                        aria-label={`Изтрий договор ${contract.number}`}
                        title="Изтрий договор"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
            <div className="flex flex-col gap-3 px-1 py-2 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Показани {visibleContractStart}-{visibleContractEnd} от {filteredContracts.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safeContractPage <= 1}
                    onClick={() => setContractPage((page) => Math.max(1, page - 1))}
                  >
                    Предишна
                  </Button>
                  <div className="min-w-20 text-center text-xs font-black uppercase text-slate-400">
                    {safeContractPage} / {totalContractPages}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safeContractPage >= totalContractPages}
                    onClick={() =>
                      setContractPage((page) => Math.min(totalContractPages, page + 1))
                    }
                  >
                    Следваща
                  </Button>
                </div>
            </div>
          </div>
        ) : null}
      </div>

      {extendTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-emerald-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <CalendarPlus size={20} />
                </div>
                <h2 className="mt-4 text-xl font-black text-slate-950">Удължаване на договор</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Изберете нова крайна дата за <span className="font-black text-slate-800">{extendTarget.number}</span>.
                  Договорът остава приет и промяната се записва в историята му.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExtendTarget(null);
                  setExtendState("idle");
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                aria-label="Затвори"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Нова крайна дата
                <input
                  type="date"
                  value={extendDate}
                  onChange={(event) => setExtendDate(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Бележка
                <textarea
                  value={extendNote}
                  onChange={(event) => setExtendNote(event.target.value)}
                  placeholder="Например: Удължаване при същите условия."
                  rows={3}
                  className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            </div>

            {extendState === "error" ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                Договорът не беше удължен. Опитайте отново.
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setExtendTarget(null);
                  setExtendState("idle");
                }}
                disabled={extendState === "saving"}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Отказ
              </button>
              <button
                type="button"
                onClick={() => void extendContract()}
                disabled={extendState === "saving" || !extendDate}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {extendState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <CalendarPlus size={17} />}
                Удължи договора
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {terminateTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-amber-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <Ban size={20} />
                </div>
                <h2 className="mt-4 text-xl font-black text-slate-950">Прекратяване на договор</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Договор <span className="font-black text-slate-800">{terminateTarget.number}</span> ще бъде маркиран
                  като прекратен. Документът остава в историята и няма да се изтрива.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTerminateTarget(null);
                  setTerminateState("idle");
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                aria-label="Затвори"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Дата на прекратяване
                <input
                  type="date"
                  value={terminateDate}
                  onChange={(event) => setTerminateDate(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Причина
                <select
                  value={terminateReason}
                  onChange={(event) => setTerminateReason(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                >
                  <option value="По взаимно съгласие">По взаимно съгласие</option>
                  <option value="По желание на клиента">По желание на клиента</option>
                  <option value="Неплащане">Неплащане</option>
                  <option value="Изтекъл срок">Изтекъл срок</option>
                  <option value="Друго">Друго</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Бележка
                <textarea
                  value={terminateNote}
                  onChange={(event) => setTerminateNote(event.target.value)}
                  placeholder="Добавете кратка вътрешна бележка, ако е нужно."
                  rows={3}
                  className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                />
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={terminateStopTasks}
                  onChange={(event) => setTerminateStopTasks(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600"
                />
                Спри бъдещите планирани дейности за този клиент и обект.
              </label>
            </div>

            {terminateState === "error" ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                Договорът не беше прекратен. Опитайте отново.
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setTerminateTarget(null);
                  setTerminateState("idle");
                }}
                disabled={terminateState === "saving"}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Отказ
              </button>
              <button
                type="button"
                onClick={() => void terminateContract()}
                disabled={terminateState === "saving" || !terminateDate}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
              >
                {terminateState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Ban size={17} />}
                Прекрати договора
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <Trash2 size={20} />
                </div>
                <h2 className="mt-4 text-xl font-black text-slate-950">Изтриване на договор</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Сигурни ли сте, че искате да изтриете договор <span className="font-black text-slate-800">{deleteTarget.number}</span>?
                  Договорът ще бъде премахнат от списъка с договори и от клиентския портал.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteState("idle");
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                aria-label="Затвори"
              >
                <X size={18} />
              </button>
            </div>
            {deleteState === "error" ? (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                Договорът не беше изтрит. Опитайте отново.
              </div>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteState("idle");
                }}
                disabled={deleteState === "deleting"}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Отказ
              </button>
              <button
                type="button"
                onClick={() => deleteContractEverywhere(deleteTarget)}
                disabled={deleteState === "deleting"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deleteState === "deleting" ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                Изтрий окончателно
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
