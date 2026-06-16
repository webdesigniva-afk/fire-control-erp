"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

// Types
type Stage = "lead" | "offer" | "order" | "contract";
type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "orange" | "info";

type ArchivedOpportunity = {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  object_name: string;
  object_address: string;
  stage: Stage;
  status: string;
  archived_at: string | null;
  archived_reason: string;
  last_activity_at: string;
  services: string[];
};

type Toast = { id: string; message: string; type: "success" | "error" };

// Constants
const STAGE_LABELS: Record<Stage, string> = {
  lead: "Лийд", offer: "Оферта", order: "Поръчка", contract: "Договор",
};

const STAGE_BADGE: Record<Stage, BadgeVariant> = {
  lead: "orange", offer: "warning", order: "neutral", contract: "success",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  "Нов": "orange", "В контакт": "info", "Чака оферта": "warning",
  "Изпратена оферта": "orange", "Чака потвърждение": "warning",
  "Потвърден": "success", "Отказан": "danger",
};

// Helpers
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("bg-BG", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatRelative(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 2) return "преди малко";
  if (diffMins < 60) return `преди ${diffMins} мин.`;
  if (diffHours < 24) return `преди ${diffHours} ч.`;
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `преди ${diffDays} дни`;
  return formatDate(dateString);
}

// Toast
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${t.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {t.type === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// Restore Confirm Modal
function RestoreConfirmModal({
  companyName,
  onConfirm,
  onCancel,
  restoring,
}: {
  companyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  restoring: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !restoring) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Разархивиране</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{companyName}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={restoring}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm font-medium leading-6 text-slate-600">`r`n            Сигурни ли сте, че искате да изтриете "{companyName}" завинаги? Записът ще бъде изтрит от търговския поток, заедно със свързаните услуги, история и търговски follow-up задачи.`r`n          </p>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={restoring}>Отказ</Button>
            <button
              type="button"
              disabled={restoring}
              onClick={onConfirm}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {restoring ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              {restoring ? "Разархивиране..." : "Разархивирай"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  companyName,
  onConfirm,
  onCancel,
  deleting,
}: {
  companyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Окончателно изтриване</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{companyName}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm font-medium leading-6 text-slate-600">`r`n            Сигурни ли сте, че искате да изтриете "{companyName}" завинаги? Записът ще бъде изтрит от търговския поток, заедно със свързаните услуги, история и търговски follow-up задачи.`r`n          </p>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={deleting}>Отказ</Button>
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirm}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {deleting ? "Изтриване..." : "Изтрий"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Page
export default function SalesArchivePage() {
  const [items, setItems] = useState<ArchivedOpportunity[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function showToast(message: string, type: Toast["type"] = "success") {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3_500);
  }

  const loadArchived = useCallback(async () => {
    setLoadState("loading");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("sales_opportunities")
        .select("*, sales_opportunity_services(service_name)")
        .eq("archived", true)
        .order("archived_at", { ascending: false });
      if (error) { setLoadState("error"); return; }
      setItems(
        (data ?? []).map((row) => ({
          id: String(row.id),
          company_name: String(row.company_name ?? ""),
          contact_name: String(row.contact_name ?? ""),
          phone: String(row.phone ?? ""),
          email: String(row.email ?? ""),
          object_name: String(row.object_name ?? ""),
          object_address: String(row.object_address ?? ""),
          stage: (row.stage as Stage) ?? "lead",
          status: String(row.status ?? ""),
          archived_at: row.archived_at ? String(row.archived_at) : null,
          archived_reason: String(row.archived_reason ?? ""),
          last_activity_at: String(row.last_activity_at ?? new Date().toISOString()),
          services: Array.isArray(row.sales_opportunity_services)
            ? (row.sales_opportunity_services as { service_name: string }[]).map((s) => s.service_name)
            : [],
        }))
      );
      setLoadState("ready");
    } catch { setLoadState("error"); }
  }, []);

  useEffect(() => { loadArchived(); }, [loadArchived]);

  async function handleRestore() {
    if (!restoreTargetId) return;
    setRestoring(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sales_opportunities")
        .update({
          archived: false,
          restored_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", restoreTargetId);
      if (error) { showToast("Грешка при разархивиране.", "error"); setRestoring(false); return; }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: restoreTargetId,
        type: "restore",
        title: "Записът е разархивиран",
        description: "Записът е върнат в активния pipeline.",
      });
      setRestoreTargetId(null);
      setRestoring(false);
      showToast("Записът е върнат в активния pipeline.");
      await loadArchived();
    } catch {
      showToast("Грешка при разархивиране.", "error");
      setRestoring(false);
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      const taskCleanup = await supabase
        .from("service_tasks")
        .delete()
        .eq("source_protocol_id", deleteTargetId)
        .eq("source_protocol_type", "sales_lead");
      if (taskCleanup.error) throw new Error(taskCleanup.error.message);

      const servicesCleanup = await supabase
        .from("sales_opportunity_services")
        .delete()
        .eq("opportunity_id", deleteTargetId);
      if (servicesCleanup.error) throw new Error(servicesCleanup.error.message);

      const logsCleanup = await supabase
        .from("sales_activity_logs")
        .delete()
        .eq("opportunity_id", deleteTargetId);
      if (logsCleanup.error) throw new Error(logsCleanup.error.message);

      const { error } = await supabase
        .from("sales_opportunities")
        .delete()
        .eq("id", deleteTargetId)
        .eq("archived", true);

      if (error) throw new Error(error.message);

      setDeleteTargetId(null);
      setDeleting(false);
      showToast("Архивният запис е изтрит окончателно.");
      await loadArchived();
    } catch {
      showToast("Грешка при окончателно изтриване.", "error");
      setDeleting(false);
    }
  }

  const restoreTarget = restoreTargetId ? items.find((i) => i.id === restoreTargetId) : null;
  const deleteTarget = deleteTargetId ? items.find((i) => i.id === deleteTargetId) : null;

  return (
    <AppShell title="Архив — Продажби" description="Архивирани търговски записи">
      <div className="space-y-6">
        {/* Header card */}
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                <Archive size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Архив</h2>
                <p className="text-sm font-medium text-slate-500">
                  {loadState === "ready" ? `${items.length} архивирани записа` : "Зареждане..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {loadState === "error" && <span className="text-sm font-bold text-red-600">Грешка при зареждане</span>}
              <button type="button" onClick={loadArchived} disabled={loadState === "loading"}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50" title="Обнови">
                <RefreshCw size={16} className={loadState === "loading" ? "animate-spin" : ""} />
              </button>
              <Link
                href="/sales"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                <ArrowLeft size={15} />
                Назад към продажби
              </Link>
            </div>
          </div>
        </Card>

        {/* Content */}
        {loadState === "loading" ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={28} className="animate-spin text-orange-500" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
              <Archive size={28} className="text-slate-400" />
            </div>
            <p className="mt-4 text-base font-black text-slate-500">Архивът е празен</p>
            <p className="mt-1 text-sm font-medium text-slate-400">Архивираните записи ще се появят тук.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  {/* Left: main info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-slate-950">{item.company_name}</h3>
                      <Badge variant={STAGE_BADGE[item.stage]}>{STAGE_LABELS[item.stage]}</Badge>
                      <Badge variant={STATUS_VARIANT[item.status] ?? "neutral"}>{item.status}</Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {item.object_name && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Building2 size={13} className="shrink-0 text-orange-500" />
                          <span className="font-semibold truncate">{item.object_name}</span>
                        </div>
                      )}
                      {item.contact_name && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <UserRound size={13} className="shrink-0 text-orange-500" />
                          <span className="font-semibold truncate">{item.contact_name}</span>
                        </div>
                      )}
                      {item.phone && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone size={13} className="shrink-0 text-orange-500" />
                          <span className="font-semibold">{item.phone}</span>
                        </div>
                      )}
                      {item.email && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Mail size={13} className="shrink-0 text-orange-500" />
                          <span className="font-semibold truncate">{item.email}</span>
                        </div>
                      )}
                      {item.archived_at && (
                        <div className="flex items-center gap-2 text-slate-500">
                          <Archive size={13} className="shrink-0 text-slate-400" />
                          <span className="font-semibold">Архивиран: {formatDate(item.archived_at)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-slate-500">
                        <CalendarClock size={13} className="shrink-0 text-slate-400" />
                        <span className="font-semibold">Активност: {formatRelative(item.last_activity_at)}</span>
                      </div>
                    </div>

                    {item.archived_reason && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                        <span className="font-black text-slate-600">Причина: </span>{item.archived_reason}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-row gap-2 lg:flex-col">
                    <Link
                      href={`/sales/${item.id}`}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    >
                      Отвори
                    </Link>
                    <button
                      type="button"
                      onClick={() => setRestoreTargetId(item.id)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <RotateCcw size={14} />
                      Разархивирай
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(item.id)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 transition hover:bg-red-100"
                    >
                      <Trash2 size={14} />
                      Изтрий
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {restoreTargetId && restoreTarget && (
        <RestoreConfirmModal
          companyName={restoreTarget.company_name}
          restoring={restoring}
          onConfirm={handleRestore}
          onCancel={() => { if (!restoring) setRestoreTargetId(null); }}
        />
      )}

      {deleteTargetId && deleteTarget && (
        <DeleteConfirmModal
          companyName={deleteTarget.company_name}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => { if (!deleting) setDeleteTargetId(null); }}
        />
      )}

      <ToastContainer toasts={toasts} />
    </AppShell>
  );
}

