"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Loader2, Search } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

type ContractListItem = {
  id: string;
  number: string;
  client: string;
  objectName: string;
  href: string;
  status: "accepted" | "draft";
  createdAt: string;
  expiresAt: string;
  total: string;
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

function formatDateValue(value: string) {
  if (!value) return "—";
  if (!value.includes("-")) return value;

  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function daysBetween(fromKey: string, toKey: string) {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function contractState(contract: ContractListItem, todayKey: string) {
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

function mapContract(row: DataRecord): ContractListItem {
  const payload = isRecord(row.payload) ? row.payload : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const href = textValue(row, ["href"]) || `/sales/contract/${textValue(row, ["id"]).replace(/^contract-/, "")}`;
  const createdAt =
    textValue(contract, ["date", "createdAt", "created_at"]) ||
    textValue(row, ["updated_at", "created_at"]).slice(0, 10);

  return {
    id: textValue(row, ["id"]),
    number: textValue(row, ["number"]) || textValue(contract, ["number"]) || "Без номер",
    client: textValue(row, ["client"]) || textValue(contract, ["client"]) || "Без клиент",
    objectName: textValue(row, ["object"]) || textValue(contract, ["object"]) || "Без обект",
    href: `${href}${href.includes("?") ? "&" : "?"}mode=view`,
    status: payload.status === "accepted" ? "accepted" : "draft",
    createdAt,
    expiresAt: addYearsToDateValue(createdAt, 1),
    total: textValue(row, ["total"]) || textValue(payload, ["total"]),
  };
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
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
        contract.total,
      ].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [contracts, query]);

  return (
    <AppShell
      title="Договори"
      description="Всички договори, срокове и свързани обекти"
    >
      <div className="space-y-5">
        <Card className="p-5">
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
        </Card>

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
            {filteredContracts.map((contract) => {
              const state = contractState(contract, todayKey);

              return (
                <Card key={contract.id} hover className="p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(260px,1.2fr)_minmax(280px,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-black text-slate-950">{contract.number}</div>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-600">{contract.client}</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-400">{contract.objectName}</div>
                    </div>

                    <div className="grid gap-3 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:py-1 lg:pl-5">
                      <div>
                        <div className="uppercase text-slate-400">Създаден</div>
                        <div className="mt-1 text-sm text-slate-800">{formatDateValue(contract.createdAt)}</div>
                      </div>
                      <div>
                        <div className="uppercase text-slate-400">Изтича</div>
                        <div className="mt-1 text-sm text-slate-800">{formatDateValue(contract.expiresAt)}</div>
                      </div>
                      <div>
                        <div className="uppercase text-slate-400">Стойност</div>
                        <div className="mt-1 text-sm text-slate-800">{contract.total || "—"}</div>
                      </div>
                    </div>

                    <Link
                      href={contract.href}
                      className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4.5 text-sm font-bold leading-none text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md lg:w-auto"
                    >
                      <ExternalLink size={16} />
                      Отвори
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
