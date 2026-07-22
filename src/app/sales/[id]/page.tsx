"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Edit3,
  FileText,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Play,
  Save,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { PageHeader } from "../../../components/ui/page-header";
import {
  type ServiceOptionGroup,
  readActiveServiceGroupsFromSupabase,
  serviceOptionName,
} from "../../../lib/services";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { serviceTasksUpdatedEvent } from "../../../lib/tasks";
import { geocodeAddress } from "../../../lib/geocoding";
import { createObjectQrCode } from "../../../lib/object-qr";

// Types
type Stage = "lead" | "offer" | "order" | "contract";
type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "orange" | "info";

type Opportunity = {
  id: string;
  lead_client_type: "corporate" | "private";
  company_name: string;
  first_name: string;
  last_name: string;
  contact_name: string;
  phone: string;
  email: string;
  object_type: string;
  object_name: string;
  object_address: string;
  stage: Stage;
  status: string;
  next_action: string;
  next_action_date: string | null;
  notes: string;
  created_at: string;
  last_activity_at: string;
  converted_to_service: boolean;
  converted_client_id: string | null;
  converted_object_id: string | null;
  archived: boolean;
  hasOfferDraft: boolean;
  hasContractDraft: boolean;
  hasAcceptedContract: boolean;
  services: OpportunityService[];
};

type OpportunityService = {
  category: string;
  name: string;
};

type ActivityLog = {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
};

type EditForm = {
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  object_name: string;
  object_address: string;
  status: string;
  next_action: string;
  next_action_date: string;
  notes: string;
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

const NEXT_STAGE: Record<Stage, Stage | null> = {
  lead: "offer", offer: "order", order: "contract", contract: null,
};

const NEXT_STAGE_BUTTON: Record<Stage, string> = {
  lead: "Преминаване към Оферта",
  offer: "Създай оферта",
  order: "Преминаване към Договор",
  contract: "—",
};

const NEXT_STAGE_STATUS: Partial<Record<Stage, string>> = {
  order: "Потвърден",
  contract: "Потвърден",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  "Нов": "orange", "В контакт": "info", "Чака оферта": "warning",
  "Изпратена оферта": "orange", "Чака потвърждение": "warning",
  "Запазена като чернова": "warning",
  "Потвърден": "success", "Отказан": "danger",
};

const AVAILABLE_SERVICES = [
  "Абонаментно обслужване", "Пожарогасители", "Пожароизвестителна система",
  "Аварийно осветление", "Евакуационни планове", "QR етикети",
  "Хидранти", "Технически преглед", "Газово гасене",
];

const NEXT_ACTIONS = [
  "Обаждане", "Изпращане на оферта", "Оглед", "Потвърждение от клиент",
  "Подписване на договор", "Стартиране на обслужване", "Друго",
];

const STATUSES = [
  "Нов", "В контакт", "Чака оферта", "Изпратена оферта",
  "Чака потвърждение", "Потвърден", "Отказан",
];

const ACTIVITY_DOT: Record<string, string> = {
  created: "bg-orange-400",
  stage_change: "bg-blue-400",
  note: "bg-slate-400",
  converted: "bg-emerald-500",
  archive: "bg-red-400",
  restore: "bg-teal-400",
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

function parseServiceValue(value: string): OpportunityService {
  const [category, ...rest] = value.split(" / ");
  if (rest.length > 0) {
    return { category: category.trim(), name: rest.join(" / ").trim() };
  }
  return { category: "", name: value.trim() };
}

function mapOpportunityService(row: { service_category?: string | null; service_name: string }): OpportunityService {
  const category = String(row.service_category ?? "").trim();
  const name = String(row.service_name ?? "").trim();
  return category ? { category, name } : parseServiceValue(name);
}

function serviceFormValue(service: OpportunityService): string {
  return service.category && service.category !== service.name
    ? `${service.category} / ${service.name}`
    : service.name;
}

function serviceDisplayName(service: OpportunityService): string {
  return service.category && service.category !== service.name
    ? `${service.category} - ${service.name}`
    : service.name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function savedContractIsAccepted(payload: unknown) {
  if (!isRecord(payload)) return false;
  const signature = isRecord(payload.signature) ? payload.signature : {};
  return payload.status === "accepted" || signature.status === "signed";
}

function privateLeadName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function opportunityClientType(value: unknown): Opportunity["lead_client_type"] {
  return value === "private" ? "private" : "corporate";
}

function opportunityClientName(opportunity: Opportunity) {
  return opportunity.lead_client_type === "private"
    ? privateLeadName(opportunity.first_name, opportunity.last_name) ||
        opportunity.company_name.trim()
    : opportunity.company_name.trim();
}

function opportunityClientPayload(opportunity: Opportunity) {
  const clientName = opportunityClientName(opportunity);

  if (opportunity.lead_client_type === "private") {
    return {
      client_type: "private",
      name: clientName,
      company_name: "",
      first_name: opportunity.first_name.trim(),
      last_name: opportunity.last_name.trim(),
      contact_person: "",
      phone: opportunity.phone.trim(),
      email: opportunity.email.trim(),
      address: opportunity.object_address.trim(),
      bulstat: "",
      eik: "",
    };
  }

  return {
    client_type: "corporate",
    name: clientName,
    company_name: clientName,
    first_name: "",
    last_name: "",
    contact_person: opportunity.contact_name.trim(),
    phone: opportunity.phone.trim(),
    email: opportunity.email.trim(),
    address: opportunity.object_address.trim(),
    bulstat: "",
    eik: "",
  };
}

function displayOpportunityStatus(opportunity: Opportunity) {
  if (opportunity.stage === "offer" && opportunity.hasOfferDraft) {
    return "Запазена като чернова";
  }

  return opportunity.status;
}

// Sub-components
function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-500 shadow-sm">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-1 text-sm font-bold text-slate-800">{value || "—"}</div>
      </div>
    </div>
  );
}

function ServiceTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-xl border border-orange-100 bg-orange-50 px-3 py-1.5 text-sm font-bold text-orange-700">
      {name}
    </span>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-black uppercase tracking-wide text-slate-400">{label}</label>
      {children}
    </div>
  );
}

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

// Archive Confirm Modal
function ArchiveConfirmModal({
  companyName,
  onConfirm,
  onCancel,
  archiving,
}: {
  companyName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  archiving: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !archiving) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Архивиране</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{companyName}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={archiving}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm font-medium leading-6 text-slate-600">
            Сигурни ли сте, че искате да архивирате този запис? Той ще бъде премахнат от активното табло, но историята му ще се запази.
          </p>
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase tracking-wide text-slate-400">
              Причина (незадължително)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Напр. клиентът отказа, дублиращ запис..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={archiving}>Отказ</Button>
            <button
              type="button"
              disabled={archiving}
              onClick={() => onConfirm(reason)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {archiving ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />}
              {archiving ? "Архивиране..." : "Архивирай"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StartServiceConfirmModal({
  companyName,
  loading,
  onCancel,
  onConfirm,
}: {
  companyName: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Стартиране на обслужване</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{companyName}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-900">
            Ще бъде създаден клиент и обект в оперативната система.
            <br />
            Продължаване?
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Отказ</Button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
              Стартирай обслужване
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Modal
function EditModal({ open, opportunity, onClose, onSaved }: {
  open: boolean; opportunity: Opportunity; onClose: () => void;
  onSaved: (updated: Opportunity) => void;
}) {
  function formFromOpp(opp: Opportunity): EditForm {
    return {
      company_name: opp.company_name,
      contact_name: opp.contact_name,
      phone: opp.phone,
      email: opp.email,
      object_name: opp.object_name,
      object_address: opp.object_address,
      status: opp.status,
      next_action: opp.next_action,
      next_action_date: opp.next_action_date ?? "",
      notes: opp.notes,
      services: opp.services.map(serviceFormValue),
    };
  }

  const [form, setForm] = useState<EditForm>(() => formFromOpp(opportunity));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [serviceGroups, setServiceGroups] = useState<ServiceOptionGroup[]>([]);
  const serviceOptions = serviceGroups.length
    ? serviceGroups.flatMap((group) =>
        group.children.length
          ? group.children.map((service) => serviceOptionName(group, service))
          : [group.service.name]
      )
    : AVAILABLE_SERVICES;

  useEffect(() => {
    if (open) { setForm(formFromOpp(opportunity)); setError(""); setSaving(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    async function loadServiceGroups() {
      try {
        const supabase = createSupabaseBrowserClient();
        const groups = await readActiveServiceGroupsFromSupabase(supabase);
        if (isMounted) setServiceGroups(groups);
      } catch {
        if (isMounted) setServiceGroups([]);
      }
    }

    loadServiceGroups();

    return () => {
      isMounted = false;
    };
  }, [open]);

  function toggleService(name: string) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(name) ? f.services.filter((s) => s !== name) : [...f.services, name],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) { setError("Моля въведете ime на фирмата."); return; }
    setSaving(true); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("sales_opportunities")
        .update({
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          object_name: form.object_name.trim(),
          object_address: form.object_address.trim(),
          status: form.status,
          next_action: form.next_action,
          next_action_date: form.next_action_date || null,
          notes: form.notes.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);
      if (updateError) { setError(updateError.message); setSaving(false); return; }
      await supabase.from("sales_opportunity_services").delete().eq("opportunity_id", opportunity.id);
      if (form.services.length > 0) {
        await supabase.from("sales_opportunity_services").insert(
          form.services.map((value) => {
            const service = parseServiceValue(value);
            return {
              opportunity_id: opportunity.id,
              service_category: service.category,
              service_name: service.name,
            };
          })
        );
      }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: opportunity.id, type: "note",
        title: "Запис редактиран", description: "Данните по записа са обновени.",
      });
      onSaved({
        ...opportunity,
        ...form,
        next_action_date: form.next_action_date || null,
        services: form.services.map(parseServiceValue),
      });
      window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Неочаквана грешка."); setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Редактиране</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{opportunity.company_name}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div>
            <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Клиент</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Фирма *">
                <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
              </FormField>
              <FormField label="Лице за контакт">
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </FormField>
              <FormField label="Телефон">
                <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </FormField>
              <FormField label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </FormField>
            </div>
          </div>
          <div>
            <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Обект</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Наименование">
                <Input value={form.object_name} onChange={(e) => setForm((f) => ({ ...f, object_name: e.target.value }))} />
              </FormField>
              <FormField label="Адрес">
                <Input value={form.object_address} onChange={(e) => setForm((f) => ({ ...f, object_address: e.target.value }))} />
              </FormField>
            </div>
          </div>
          <div>
            <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Услуги</div>
            <div className="flex flex-wrap gap-2">
              {serviceOptions.map((s) => {
                const selected = form.services.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleService(s)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${selected ? "border-orange-300 bg-orange-100 text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50"}`}>
                    {selected && <CheckCircle2 size={11} className="mr-1 inline text-orange-600" />}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Статус">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Следващо действие">
              <select value={form.next_action} onChange={(e) => setForm((f) => ({ ...f, next_action: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100">
                {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Дата на следващото действие">
            <input type="date" value={form.next_action_date} onChange={(e) => setForm((f) => ({ ...f, next_action_date: e.target.value }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100" />
          </FormField>
          <FormField label="Бележки">
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100" />
          </FormField>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отказ</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Записване..." : "Запази"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main Page
export default function SalesDealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "not-found">("loading");
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [startingService, setStartingService] = useState(false);
  const [startServiceOpen, setStartServiceOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [portalOpening, setPortalOpening] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function showToast(message: string, type: Toast["type"] = "success") {
    const tid = Date.now().toString();
    setToasts((prev) => [...prev, { id: tid, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== tid)), 3_500);
  }

  async function openClientPortal() {
    if (!opportunity || portalOpening) return;
    setPortalOpening(true);
    const portalWindow = window.open("", "_blank");

    if (portalWindow) {
      portalWindow.document.title = "Клиентски портал";
      portalWindow.document.body.style.fontFamily = "Inter, Arial, sans-serif";
      portalWindow.document.body.style.padding = "32px";
      portalWindow.document.body.style.color = "#1f2a44";
      portalWindow.document.body.textContent = "Отваряне на клиентски портал...";
    }

    try {
      const response = await fetch("/api/client-portal/opportunity-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.id }),
      });
      const payload = (await response.json()) as { portalPath?: string; error?: string };

      if (!response.ok || !payload.portalPath) {
        throw new Error(payload.error || "Клиентският портал не може да се отвори.");
      }

      if (portalWindow) {
        portalWindow.location.assign(payload.portalPath);
      } else {
        window.open(payload.portalPath, "_blank");
      }

      showToast("Клиентският портал е отворен.");
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Грешка при отваряне на клиентски портал.";
      if (portalWindow) {
        portalWindow.document.body.textContent = message;
      }
      showToast(message, "error");
    } finally {
      setPortalOpening(false);
    }
  }

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoadState("loading");
    try {
      const supabase = createSupabaseBrowserClient();
      const [oppResult, logsResult, offerDraftResult, contractDraftResult] = await Promise.all([
        supabase
          .from("sales_opportunities")
          .select("*, sales_opportunity_services(service_category, service_name)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("sales_activity_logs")
          .select("*")
          .eq("opportunity_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("saved_documents")
          .select("id")
          .eq("id", `offer-${id}`)
          .eq("kind", "offer")
          .maybeSingle(),
        supabase
          .from("saved_documents")
          .select("id, payload")
          .eq("id", `contract-${id}`)
          .eq("kind", "contract")
          .maybeSingle(),
      ]);
      if (oppResult.error) { setLoadState("error"); return; }
      if (!oppResult.data) { setLoadState("not-found"); return; }
      const row = oppResult.data;
      setOpportunity({
        id: String(row.id),
        lead_client_type: opportunityClientType(row.lead_client_type),
        company_name: String(row.company_name ?? ""),
        first_name: String(row.first_name ?? ""),
        last_name: String(row.last_name ?? ""),
        contact_name: String(row.contact_name ?? ""),
        phone: String(row.phone ?? ""),
        email: String(row.email ?? ""),
        object_type: String(row.object_type ?? ""),
        object_name: String(row.object_name ?? ""),
        object_address: String(row.object_address ?? ""),
        stage: (row.stage as Stage) ?? "lead",
        status: String(row.status ?? "Нов"),
        next_action: String(row.next_action ?? ""),
        next_action_date: row.next_action_date ? String(row.next_action_date) : null,
        notes: String(row.notes ?? ""),
        created_at: String(row.created_at ?? row.created_at_ms ?? row.last_activity_at ?? new Date().toISOString()),
        last_activity_at: String(row.last_activity_at ?? new Date().toISOString()),
        converted_to_service: Boolean(row.converted_to_service),
        converted_client_id: row.converted_client_id ? String(row.converted_client_id) : null,
        converted_object_id: row.converted_object_id ? String(row.converted_object_id) : null,
        archived: Boolean(row.archived),
        hasOfferDraft: Boolean(offerDraftResult.data),
        hasContractDraft: Boolean(contractDraftResult.data),
        hasAcceptedContract: savedContractIsAccepted(contractDraftResult.data?.payload),
        services: Array.isArray(row.sales_opportunity_services)
          ? (row.sales_opportunity_services as { service_category?: string | null; service_name: string }[])
              .map(mapOpportunityService)
          : [],
      });
      setActivityLogs(
        (logsResult.data ?? []).map((l) => ({
          id: String(l.id),
          type: String(l.type ?? "note"),
          title: String(l.title ?? ""),
          description: String(l.description ?? ""),
          created_at: String(l.created_at ?? ""),
        }))
      );
      setLoadState("ready");
    } catch { setLoadState("error"); }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleMoveStage() {
    if (!opportunity) return;
    const nextStage = NEXT_STAGE[opportunity.stage];
    if (!nextStage) return;
    setMovingStage(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const defaultStatus = NEXT_STAGE_STATUS[nextStage];
      const updates: Record<string, unknown> = {
        stage: nextStage, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      if (defaultStatus) updates.status = defaultStatus;
      const { error } = await supabase.from("sales_opportunities").update(updates).eq("id", opportunity.id);
      if (error) { showToast("Грешка при преместване.", "error"); return; }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: opportunity.id, type: "stage_change",
        title: `Преминаване към ${STAGE_LABELS[nextStage]}`,
        description: `Записът е преместен в ${STAGE_LABELS[nextStage]}.`,
      });
      showToast(`Записът е преместен в ${STAGE_LABELS[nextStage]}.`);
      await loadData();
    } catch { showToast("Грешка при преместване.", "error"); }
    finally { setMovingStage(false); }
  }

  async function handleArchive(reason: string) {
    if (!opportunity) return;
    setArchiving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sales_opportunities")
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: reason.trim(),
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);
      if (error) { showToast("Грешка при архивиране.", "error"); setArchiving(false); return; }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: opportunity.id,
        type: "archive",
        title: "Записът е архивиран",
        description: reason.trim() ? `Причина: ${reason.trim()}` : "Записът е преместен в архива.",
      });
      setArchiveOpen(false);
      setArchiving(false);
      router.push("/sales");
    } catch {
      showToast("Грешка при архивиране.", "error");
      setArchiving(false);
    }
  }

  async function handleStartService() {
    if (!opportunity || startingService) return;
    if (!opportunity.hasAcceptedContract) {
      showToast("Първо запазете и приемете договора.", "error");
      return;
    }
    setStartingService(true);
    try {
      const supabase = createSupabaseBrowserClient();
      let clientId: string | null = null;
      const clientName = opportunityClientName(opportunity);
      const { data: existingClient } = await supabase
        .from("clients").select("id").ilike("name", clientName).maybeSingle();
      if (existingClient) {
        clientId = String(existingClient.id);
        const { error: clientUpdateError } = await supabase
          .from("clients")
          .update(opportunityClientPayload(opportunity))
          .eq("id", clientId);
        if (clientUpdateError) {
          showToast("Грешка при обновяване на клиента.", "error");
          return;
        }
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert(opportunityClientPayload(opportunity))
          .select("id").single();
        if (clientError || !newClient) { showToast("Грешка при създаване на клиент.", "error"); return; }
        clientId = String(newClient.id);
      }
      const qrCode = createObjectQrCode();
      const address = opportunity.object_address.trim();
      const geocoded = address ? await geocodeAddress(address) : null;
      const { data: newLocation, error: locationError } = await supabase
        .from("locations")
        .insert({
          client_id: clientId,
          object_type: opportunity.object_type.trim(),
          qr_code: qrCode,
          name: opportunity.object_name.trim() || clientName,
          address,
          region: "",
          status: "изряден",
          service: opportunity.services.map(serviceDisplayName).join(", "),
          latitude: geocoded?.latitude ?? null,
          longitude: geocoded?.longitude ?? null,
          geocoded_address: geocoded?.displayName ?? null,
          geocoded_at: geocoded ? new Date().toISOString() : null,
        })
        .select("id, qr_code").single();
      if (locationError || !newLocation) { showToast("Грешка при създаване на обект.", "error"); return; }
      const contractDocumentId = `contract-${opportunity.id}`;
      const { data: contractDocument } = await supabase
        .from("saved_documents")
        .select("payload")
        .eq("id", contractDocumentId)
        .eq("kind", "contract")
        .maybeSingle();
      const contractPayload = isRecord(contractDocument?.payload) ? contractDocument.payload : {};
      await supabase
        .from("saved_documents")
        .update({
          object: opportunity.object_name || clientName,
          payload: {
            ...contractPayload,
            locationId: String(newLocation.id),
            locationQrCode: String(newLocation.qr_code),
            convertedObjectId: String(newLocation.id),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", contractDocumentId)
        .eq("kind", "contract");
      await supabase.from("sales_opportunities").update({
        converted_to_service: true,
        converted_client_id: clientId,
        converted_object_id: String(newLocation.id),
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", opportunity.id);
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: opportunity.id, type: "converted",
        title: "Стартирано обслужване",
        description: `Създаден е клиент и обект: ${clientName} / ${opportunity.object_name || clientName}`,
      });
      setStartServiceOpen(false);
      router.push(`/locations/${encodeURIComponent(String(newLocation.qr_code))}`);
    } catch { showToast("Неочаквана грешка. Моля опитайте отново.", "error"); setStartingService(false); }
  }

  // Render states
  if (loadState === "loading") {
    return (
      <AppShell title="Продажби" description="Зареждане..." showSearch={false}>
        <div className="flex h-64 items-center justify-center">
          <Loader2 size={32} className="animate-spin text-orange-500" />
        </div>
      </AppShell>
    );
  }

  if (loadState === "not-found") {
    return (
      <AppShell title="Продажби" description="Записът не е намерен" showSearch={false}>
        <Card className="p-8 text-center">
          <p className="text-lg font-black text-slate-600">Записът не е намерен.</p>
          <Link href="/sales" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-700">
            <ArrowLeft size={16} /> Назад към продажби
          </Link>
        </Card>
      </AppShell>
    );
  }

  if (loadState === "error" || !opportunity) {
    return (
      <AppShell title="Продажби" description="Грешка" showSearch={false}>
        <Card className="p-8 text-center">
          <p className="text-lg font-black text-red-600">Грешка при зареждане.</p>
          <button onClick={loadData} className="mt-4 text-sm font-bold text-orange-600 hover:text-orange-700">Опитай отново</button>
        </Card>
      </AppShell>
    );
  }

  const nextStage = NEXT_STAGE[opportunity.stage];
  const isContract = opportunity.stage === "contract";
  const serviceLabels = Array.from(new Set(opportunity.services.map(serviceDisplayName)));
  const visibleStatus = displayOpportunityStatus(opportunity);
  const opportunityTitle = opportunityClientName(opportunity);

  return (
    <AppShell title="Продажби" description="Пълна търговска възможност и подготовка за оперативен процес" showSearch={false}>
      <div className="space-y-6">
        <PageHeader
          title={opportunityTitle}
          badge={<Badge variant={STAGE_BADGE[opportunity.stage]}>{STAGE_LABELS[opportunity.stage]}</Badge>}
          description={opportunity.object_name ? `Обект: ${opportunity.object_name}` : undefined}
          actions={
            <>
              <Link href="/sales" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700">
                <ArrowLeft size={18} />
                Назад
              </Link>
              <button
                type="button"
                onClick={() => setArchiveOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700 transition hover:bg-red-100"
              >
                <Archive size={18} />
                Архивирай
              </button>
              {opportunity.stage === "offer" && (
                <Link href={`/sales/offer/${opportunity.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 transition hover:bg-orange-100">
                  <FileText size={18} />
                  {opportunity.hasOfferDraft ? "Отвори чернова" : "Създай оферта"}
                </Link>
              )}
              {opportunity.stage === "contract" && (
                <Link href={`/sales/contract/${opportunity.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 transition hover:bg-orange-100">
                  <FileText size={18} />
                  {opportunity.hasContractDraft ? "Отвори договор" : "Създай договор"}
                </Link>
              )}
              {nextStage && opportunity.stage !== "offer" && (
                <button type="button" disabled={movingStage} onClick={handleMoveStage}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md disabled:opacity-60">
                  {movingStage ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                  {NEXT_STAGE_BUTTON[opportunity.stage]}
                </button>
              )}
              {isContract && opportunity.hasAcceptedContract && !opportunity.converted_to_service && (
                <button type="button" disabled={startingService} onClick={() => setStartServiceOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md disabled:opacity-60">
                  {startingService ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                  Стартирай обслужване
                </button>
              )}
            </>
          }
        />

        {opportunity.converted_to_service && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
            <div>
              <div className="font-black text-emerald-800">Обслужването е стартирано</div>
              <div className="text-sm font-medium text-emerald-600">Клиент и обект са създадени в оперативната система.</div>
            </div>
            <Link href="/locations" className="ml-auto shrink-0 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-black text-emerald-700 transition hover:bg-emerald-100">
              Към обектите
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_0.45fr]">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Информация за клиента</h2>
              <div className="flex flex-wrap justify-end gap-2">
                {opportunity.stage !== "lead" ? (
                  <Button variant="outline" size="sm" onClick={openClientPortal} disabled={portalOpening}>
                    {portalOpening ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                    Клиентски портал
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Edit3 size={15} />
                  Редактирай
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {opportunity.lead_client_type === "private" ? (
                <InfoRow icon={UserRound} label="Име" value={opportunityTitle} />
              ) : (
                <>
                  <InfoRow icon={Building2} label="Фирма" value={opportunity.company_name} />
                  <InfoRow icon={UserRound} label="Контакт" value={opportunity.contact_name} />
                </>
              )}
              <InfoRow icon={Phone} label="Телефон" value={opportunity.phone} />
              <InfoRow icon={Mail} label="Email" value={opportunity.email} />
              {opportunity.object_type && <InfoRow icon={Building2} label="Тип обект" value={opportunity.object_type} />}
              {opportunity.object_name && <InfoRow icon={Building2} label="Обект" value={opportunity.object_name} />}
              {opportunity.object_address && <InfoRow icon={MapPin} label="Адрес" value={opportunity.object_address} />}
            </div>
            {opportunity.notes && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Бележки</div>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{opportunity.notes}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-black">Детайли</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Статус</div>
                <Badge variant={STATUS_VARIANT[visibleStatus] ?? "warning"}>{visibleStatus}</Badge>
              </div>
              <div className="rounded-2xl bg-orange-50 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-wide text-orange-500/70">Следващо действие</div>
                <div className="mt-1 font-black text-orange-800">{opportunity.next_action || "—"}</div>
                {opportunity.next_action_date && (
                  <div className="mt-1 text-xs font-bold text-orange-600">
                    <CalendarClock size={12} className="mr-1 inline" />
                    {formatDate(opportunity.next_action_date)}
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Последна активност</div>
                <div className="mt-1 text-sm font-bold text-slate-700">{formatRelative(opportunity.last_activity_at)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Дата на създаване</div>
                <div className="mt-1 text-sm font-bold text-slate-700">{formatDate(opportunity.created_at)}</div>
              </div>
            </div>
          </Card>
        </div>

        {serviceLabels.length > 0 && (
          <Card className="p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Интерес / услуги</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Заявени направления по лийда
                </p>
              </div>
              <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                {serviceLabels.length} {serviceLabels.length === 1 ? "услуга" : "услуги"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {serviceLabels.map((service) => (
                <ServiceTag key={service} name={service} />
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-lg font-black">История</h2>
          {activityLogs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
              Няма записана активност
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {activityLogs.map((log) => (
                <div key={log.id} className="flex gap-4">
                  <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${ACTIVITY_DOT[log.type] ?? "bg-slate-300"}`} />
                  <div className="flex-1 rounded-2xl bg-slate-50 p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-black text-slate-800">{log.title}</div>
                      <div className="text-xs font-black text-slate-400">{formatRelative(log.created_at)}</div>
                    </div>
                    {log.description && <p className="mt-2 text-sm leading-6 text-slate-500">{log.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Edit3 size={18} />
            Редактирай
          </Button>
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700 transition hover:bg-red-100"
          >
            <Archive size={18} />
            Архивирай
          </button>
          <Link href="/sales" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700">
            <ArrowLeft size={18} />
            Назад към продажби
          </Link>
        </div>
      </div>

      {editOpen && opportunity && (
        <EditModal open={editOpen} opportunity={opportunity} onClose={() => setEditOpen(false)}
          onSaved={(updated) => { setOpportunity(updated); showToast("Записът е обновен успешно."); loadData(); }} />
      )}

      {archiveOpen && opportunity && (
        <ArchiveConfirmModal
          companyName={opportunityTitle}
          archiving={archiving}
          onConfirm={handleArchive}
          onCancel={() => { if (!archiving) setArchiveOpen(false); }}
        />
      )}

      {startServiceOpen && opportunity && (
        <StartServiceConfirmModal
          companyName={opportunityTitle}
          loading={startingService}
          onConfirm={handleStartService}
          onCancel={() => { if (!startingService) setStartServiceOpen(false); }}
        />
      )}

      <ToastContainer toasts={toasts} />
    </AppShell>
  );
}
