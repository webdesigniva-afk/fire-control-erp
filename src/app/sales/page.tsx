"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  Flame,
  Loader2,
  MoveRight,
  Phone,
  Plus,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ContactLink } from "../../components/contact-link";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  defaultProtocolSettings,
  readProtocolSettings,
  readProtocolSettingsFromSupabase,
  writeProtocolSettingsToSupabase,
  type ProtocolSettings,
} from "../../lib/settings";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { geocodeAddress } from "../../lib/geocoding";
import { createObjectQrCode } from "../../lib/object-qr";
import {
  readActiveServiceGroupsFromSupabase,
} from "../../lib/services";
import { serviceTasksUpdatedEvent } from "../../lib/tasks";

// Types
type Stage = "lead" | "offer" | "order" | "contract";
type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "orange" | "info";

type Opportunity = {
  id: string;
  lead_client_type: "corporate" | "private";
  company_name: string;
  company_eik: string;
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
  archived: boolean;
  hasOfferDraft: boolean;
  hasContractDraft: boolean;
  hasAcceptedContract: boolean;
  services: OpportunityService[];
};

type NewLeadForm = {
  lead_client_type: "corporate" | "private";
  company_name: string;
  company_eik: string;
  first_name: string;
  last_name: string;
  contact_name: string;
  phone: string;
  email: string;
  object_type: string;
  object_name: string;
  object_address: string;
  service_categories: string[];
  services: LeadSelectedService[];
  next_action: string;
  next_action_date: string;
  notes: string;
};

type Toast = { id: string; message: string; type: "success" | "error" };
type DuplicateMatch = { id: string; label: string; href: string; source: "client" | "lead" };
type LeadSelectedService = { category: string; service: string };
type OpportunityService = { category: string; name: string };

// Constants
const STAGES: { key: Stage; label: string; accent: string }[] = [
  { key: "lead",     label: "Лийдове",  accent: "from-orange-400 to-red-500" },
  { key: "offer",    label: "Оферти",   accent: "from-red-500 to-orange-400" },
  { key: "order",    label: "Поръчки",  accent: "from-slate-700 to-slate-500" },
  { key: "contract", label: "Договори", accent: "from-green-500 to-emerald-400" },
];

const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  lead:     "Запитвания и потенциални клиенти",
  offer:    "Изготвени и изпратени оферти",
  order:    "Приети оферти за изпълнение",
  contract: "В готовност за обслужване",
};

const NEXT_STAGE: Record<Stage, Stage | null> = {
  lead: "offer", offer: "order", order: null, contract: null,
};

const NEXT_STAGE_LABEL: Record<Stage, string> = {
  lead:     "Към оферта",
  offer:    "Създай оферта",
  order:    "Към договор",
  contract: "—",
};

const NEXT_STAGE_STATUS: Partial<Record<Stage, string>> = {
  order:    "Приета оферта",
  contract: "Потвърден",
};

const STAGE_LABELS: Record<Stage, string> = {
  lead: "Лийдове",
  offer: "Оферти",
  order: "Поръчки",
  contract: "Договори",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  "Нов":               "orange",
  "В контакт":         "info",
  "Чака оферта":       "warning",
  "Изпратена оферта":  "orange",
  "Запазена като чернова": "warning",
  "Чака потвърждение": "warning",
  "Приета оферта":       "success",
  "Потвърден":         "success",
  "Отказан":           "danger",
};

const NEXT_ACTIONS = [
  "Обаждане",
  "Оглед",
  "Изпращане на оферта",
  "Среща",
  "Друго",
];

const DEFAULT_OBJECT_TYPES = [
  "Магазин",
  "Склад",
  "Офис",
  "Хотел",
  "Производствен обект",
  "Болница",
  "Училище",
  "Жилищна сграда",
  "Друго",
];

const ADD_OBJECT_TYPE_VALUE = "__add_object_type__";
const SALES_LEAD_SETTINGS_KEY = "firecontrol:sales:lead-catalogs";

type LeadServiceCatalog = Record<string, string[]>;

const DEFAULT_SERVICE_CATALOG: LeadServiceCatalog = {
  "Пожароизвестителни системи": ["Проектиране", "Монтаж", "Поддръжка", "Инспекция", "Ремонт"],
  "Пожарогасители": ["Поддръжка", "Продажба", "Презареждане", "Проверка", "Нов монтаж"],
  "Пожарогасителни системи": ["Проектиране", "Монтаж", "Поддръжка", "Инспекция", "Ремонт"],
  "Документация": ["План за евакуация", "Пожарно досие", "Инструктаж", "Оценка на риска"],
  "Пасивна защита": ["Пожарозащитно уплътняване", "Пожарозащитни врати", "Обследване"],
  "Противопожарно оборудване и сервиз": ["Аварийно осветление", "Хидранти", "Маркировка", "Сервиз"],
  "Друго": [],
};

const EMPTY_FORM: NewLeadForm = {
  lead_client_type: "corporate",
  company_name: "",
  company_eik: "",
  first_name: "",
  last_name: "",
  contact_name: "",
  phone: "",
  email: "",
  object_type: "",
  object_name: "",
  object_address: "",
  service_categories: ["Пожарогасители"],
  services: [],
  next_action: "Обаждане",
  next_action_date: "",
  notes: "",
};

// Helpers
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
  return date.toLocaleDateString("bg-BG");
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("bg-BG");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function savedContractIsAccepted(payload: unknown) {
  if (!isRecord(payload)) return false;
  const signature = isRecord(payload.signature) ? payload.signature : {};
  return payload.status === "accepted" || signature.status === "signed";
}

function serviceDisplayName(service: OpportunityService): string {
  return service.category && service.category !== service.name
    ? `${service.category} - ${service.name}`
    : service.name;
}

function leadServiceLabel(service: LeadSelectedService): string {
  return service.category && service.category !== service.service
    ? `${service.category} - ${service.service}`
    : service.service;
}

function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? "neutral";
}

function displayOpportunityStatus(opportunity: Opportunity) {
  if (opportunity.stage === "offer" && opportunity.hasOfferDraft) {
    return "Запазена като чернова";
  }

  if (opportunity.stage === "order" && opportunity.hasContractDraft) {
    return "Чернова на договор";
  }

  if (opportunity.stage === "order" && opportunity.status === "Потвърден") {
    return "Приета оферта";
  }

  return opportunity.status;
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function objectTypeOptions(settings: ProtocolSettings, selectedValue = "") {
  return uniqueValues([
    ...DEFAULT_OBJECT_TYPES,
    ...(settings.objectTypes?.length ? settings.objectTypes : defaultProtocolSettings.objectTypes),
    selectedValue,
  ]);
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function privateLeadName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function leadDisplayName(form: NewLeadForm) {
  return form.lead_client_type === "private"
    ? privateLeadName(form.first_name, form.last_name)
    : form.company_name.trim();
}

function opportunityClientType(value: unknown): Opportunity["lead_client_type"] {
  return value === "private" ? "private" : "corporate";
}

function opportunityClientPayload(opportunity: Opportunity) {
  if (opportunity.lead_client_type === "private") {
    const displayName =
      privateLeadName(opportunity.first_name, opportunity.last_name) ||
      opportunity.company_name.trim();

    return {
      client_type: "private",
      name: displayName,
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
    name: opportunity.company_name.trim(),
    company_name: opportunity.company_name.trim(),
    first_name: "",
    last_name: "",
    contact_person: opportunity.contact_name.trim(),
    phone: opportunity.phone.trim(),
    email: opportunity.email.trim(),
    address: opportunity.object_address.trim(),
    bulstat: opportunity.company_eik.trim(),
    eik: opportunity.company_eik.trim(),
  };
}

async function readLeadServiceCatalogFromSupabase(): Promise<LeadServiceCatalog> {
  const supabase = createSupabaseBrowserClient();
  const groups = await readActiveServiceGroupsFromSupabase(supabase);

  if (groups.length) {
    return groups.reduce<LeadServiceCatalog>((catalog, group) => {
      const category = group.service.name;
      catalog[category] = group.children.length
        ? group.children.map((service) => service.name)
        : [];
      return catalog;
    }, {});
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SALES_LEAD_SETTINGS_KEY)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const value = (data as { value?: unknown } | null)?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_SERVICE_CATALOG;

  const merged: LeadServiceCatalog = { ...DEFAULT_SERVICE_CATALOG };
  for (const [category, services] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(services)) {
      merged[category] = uniqueValues(services.map(String));
    }
  }
  return merged;
}

// Sub-components
function EmptyState({ stage }: { stage: Stage }) {
  const label =
    stage === "contract" ? "Няма записи в готовност" : "Няма активни записи";

  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm font-bold text-slate-400">
      {label}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <div className="flex items-center gap-2 text-base font-black text-slate-950">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-600 shadow-sm">
          {icon}
        </span>
        <span>{title}</span>
      </div>
      <p className="mt-1 pl-10 text-xs font-bold text-slate-500">{subtitle}</p>
    </div>
  );
}

function PipelineCard({
  item,
  onMoveStage,
  onStartService,
  movingId,
  startingServiceId,
  onArchive,
}: {
  item: Opportunity;
  onMoveStage: (id: string, nextStage: Stage) => void;
  onStartService: (item: Opportunity) => void;
  movingId: string;
  startingServiceId: string;
  onArchive: (id: string) => void;
}) {
  const nextStage = NEXT_STAGE[item.stage];
  const visibleStatus = displayOpportunityStatus(item);
  const shouldShowStatus = !(item.stage === "offer" && item.status === "Изпратена оферта" && !item.hasOfferDraft);
  return (
    <Card hover className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-black leading-6 text-slate-950">{item.company_name}</h3>
          {shouldShowStatus ? (
            <div className="mt-2">
              <Badge variant={statusVariant(visibleStatus)}>{visibleStatus}</Badge>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          title="Архивирай"
          onClick={() => onArchive(item.id)}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <Archive size={13} />
        </button>
      </div>
      <div className="mt-4 space-y-2.5 text-sm">
        {item.contact_name && (
          <div className="grid grid-cols-[18px_1fr] items-start gap-2 text-slate-600">
            <UserRound size={15} className="mt-0.5 text-orange-500" />
            <span className="break-words font-bold leading-5">{item.contact_name}</span>
          </div>
        )}
        {item.phone && (
          <div className="grid grid-cols-[18px_1fr] items-start gap-2 text-slate-600">
            <Phone size={15} className="mt-0.5 text-orange-500" />
            <ContactLink kind="phone" value={item.phone} className="break-words font-bold leading-5" />
          </div>
        )}
        {item.object_name && (
          <div className="grid grid-cols-[18px_1fr] items-start gap-2 text-slate-600">
            <Building2 size={15} className="mt-0.5 text-orange-500" />
            <span className="break-words font-bold leading-5">{item.object_name}</span>
          </div>
        )}
        <div className="grid grid-cols-[18px_1fr] items-start gap-2 text-xs text-slate-400">
          <CalendarClock size={14} className="mt-0.5" />
          <span className="font-semibold leading-5">Създаден: {formatDate(item.created_at)}</span>
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-orange-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-black text-orange-700">
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={12} />
            {item.next_action || "-"}
          </span>
          {item.next_action_date ? (
            <span className="font-bold text-orange-600/80">
              - {formatDate(item.next_action_date)}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-xs font-semibold text-slate-400">
          Последна активност: {formatRelative(item.last_activity_at)}
        </div>
      </div>
      <div className="mt-auto grid grid-cols-1 gap-2 pt-3">
        <Link
          href={`/sales/${item.id}`}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
        >
          Отвори
        </Link>
        {item.stage === "offer" ? (
          <Link
            href={`/sales/offer/${item.id}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <FileText size={14} />
            {item.hasOfferDraft ? "Отвори чернова" : "Създай оферта"}
          </Link>
        ) : item.stage === "order" ? (
          <Link
            href={`/sales/contract/${item.id}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <FileText size={14} />
            {item.hasContractDraft ? "Отвори договор" : "Създай договор"}
          </Link>
        ) : item.stage === "contract" && item.hasAcceptedContract ? (
          <button
            type="button"
            disabled={startingServiceId === item.id}
            onClick={() => onStartService(item)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-black transition ${
              "bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-sm hover:shadow-md disabled:opacity-60"
            }`}
          >
            {startingServiceId === item.id ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            Премини към обслужване
          </button>
        ) : item.stage === "contract" ? (
          <Link
            href={`/sales/contract/${item.id}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <FileText size={14} />
            {item.hasContractDraft ? "Отвори договор" : "Създай договор"}
          </Link>
        ) : nextStage ? (
          <button
            type="button"
            disabled={movingId === item.id}
            onClick={() => onMoveStage(item.id, nextStage)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-60"
          >
            {movingId === item.id
              ? <Loader2 size={14} className="animate-spin" />
              : <ArrowRight size={14} />}
            {NEXT_STAGE_LABEL[item.stage]}
          </button>
        ) : null}
      </div>
    </Card>
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
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Архивиране</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{companyName}</p>
          </div>
          <button type="button" onClick={onCancel} disabled={archiving}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm font-medium text-slate-600">
            Записът ще бъде скрит от активния pipeline. Можете да го възстановите по всяко време от Архива.
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
              {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
              Стартирай обслужване
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// New Lead Modal
function NewLeadModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState<NewLeadForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [protocolSettings, setProtocolSettings] = useState<ProtocolSettings>(defaultProtocolSettings);
  const [serviceCatalog, setServiceCatalog] = useState<LeadServiceCatalog>(DEFAULT_SERVICE_CATALOG);
  const [addingObjectType, setAddingObjectType] = useState(false);
  const [newObjectType, setNewObjectType] = useState("");
  const [savingObjectType, setSavingObjectType] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const serviceCategories = Object.keys(serviceCatalog);
  const availableObjectTypes = objectTypeOptions(protocolSettings, form.object_type);

  function alignFormServicesWithCatalog(catalog: LeadServiceCatalog) {
    const categories = Object.keys(catalog);
    setForm((current) => {
      const selectedCategories = current.service_categories.filter((category) =>
        categories.includes(category)
      );
      const nextCategories = selectedCategories.length
        ? selectedCategories
        : categories[0]
          ? [categories[0]]
          : [];
      const alignedServices = current.services.filter(
        (item) =>
          nextCategories.includes(item.category) &&
          ((catalog[item.category] ?? []).includes(item.service) ||
            (!(catalog[item.category] ?? []).length && item.service === item.category))
      );

      for (const category of nextCategories) {
        if (
          !(catalog[category] ?? []).length &&
          !alignedServices.some((item) => item.category === category && item.service === category)
        ) {
          alignedServices.push({ category, service: category });
        }
      }

      return {
        ...current,
        service_categories: nextCategories,
        services: alignedServices,
      };
    });
  }

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setError("");
      setSaving(false);
      setDuplicates([]);
      setDuplicateAcknowledged(false);
      setAddingObjectType(false);
      setSavingObjectType(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    async function loadCatalogs() {
      const localSettings = readProtocolSettings();
      if (isMounted) setProtocolSettings(localSettings);

      try {
        const [dbSettings, dbCatalog] = await Promise.all([
          readProtocolSettingsFromSupabase(),
          readLeadServiceCatalogFromSupabase(),
        ]);
        if (!isMounted) return;
        setProtocolSettings(dbSettings);
        setServiceCatalog(dbCatalog);
        alignFormServicesWithCatalog(dbCatalog);
      } catch {
        if (isMounted) {
          setServiceCatalog(DEFAULT_SERVICE_CATALOG);
          alignFormServicesWithCatalog(DEFAULT_SERVICE_CATALOG);
        }
      }
    }

    loadCatalogs();

    return () => {
      isMounted = false;
    };
  }, [open]);

  function updateForm(key: keyof NewLeadForm, value: string) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "lead_client_type") {
        if (value === "private" && !current.object_name.trim()) {
          next.object_name = "Частен имот";
        }
        if (value === "corporate" && current.object_name.trim() === "Частен имот") {
          next.object_name = "";
        }
      }
      return next;
    });
    if (key === "company_name" || key === "first_name" || key === "last_name" || key === "phone") {
      setDuplicates([]);
      setDuplicateAcknowledged(false);
    }
  }

  function toggleServiceCategory(category: string) {
    setForm((current) => {
      const selected = current.service_categories.includes(category);
      const categoryOptions = serviceCatalog[category] ?? [];
      const nextServices = selected
        ? current.services.filter((item) => item.category !== category)
        : categoryOptions.length
          ? current.services
          : current.services.some((item) => item.category === category && item.service === category)
            ? current.services
            : [...current.services, { category, service: category }];

      return {
        ...current,
        service_categories: selected
          ? current.service_categories.filter((item) => item !== category)
          : [...current.service_categories, category],
        services: nextServices,
      };
    });
  }

  function toggleService(category: string, service: string) {
    setForm((f) => ({
      ...f,
      services: f.services.some((item) => item.category === category && item.service === service)
        ? f.services.filter((item) => item.category !== category || item.service !== service)
        : [...f.services, { category, service }],
    }));
  }

  async function addObjectType() {
    const value = newObjectType.trim();
    if (!value || savingObjectType) return;

    setSavingObjectType(true);
    setError("");
    try {
      const databaseSettings = await readProtocolSettingsFromSupabase().catch(() => protocolSettings);
      const nextSettings = {
        ...databaseSettings,
        objectTypes: uniqueValues([
          ...DEFAULT_OBJECT_TYPES,
          ...(defaultProtocolSettings.objectTypes ?? []),
          ...(databaseSettings.objectTypes ?? []),
          ...(protocolSettings.objectTypes ?? []),
          value,
        ]),
      };

      await writeProtocolSettingsToSupabase(nextSettings);
      setProtocolSettings(nextSettings);
      updateForm("object_type", value);
      setNewObjectType("");
      setAddingObjectType(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Грешка при запис на типа обект.");
    } finally {
      setSavingObjectType(false);
    }
  }

  async function findDuplicates() {
    const supabase = createSupabaseBrowserClient();
    const leadName = leadDisplayName(form);
    const phone = form.phone.trim();
    const normalized = normalizePhone(phone);
    const matches: DuplicateMatch[] = [];

    const [clientsResult, opportunitiesResult] = await Promise.all([
      supabase.from("clients").select("*").limit(50),
      supabase.from("sales_opportunities").select("id,company_name,phone").eq("archived", false).limit(50),
    ]);

    for (const client of (clientsResult.data as Record<string, unknown>[] | null) ?? []) {
      const clientName = String(client.name ?? client.organization ?? client.company_name ?? "");
      const clientPhone = String(client.phone ?? "");
      if (
        (leadName && clientName.trim().toLowerCase() === leadName.toLowerCase()) ||
        (normalized && normalizePhone(clientPhone) === normalized)
      ) {
        matches.push({ id: String(client.id), label: clientName || clientPhone, href: "/clients", source: "client" });
      }
    }

    for (const opportunity of (opportunitiesResult.data as Record<string, unknown>[] | null) ?? []) {
      const opportunityName = String(opportunity.company_name ?? "");
      const opportunityPhone = String(opportunity.phone ?? "");
      if (
        (leadName && opportunityName.trim().toLowerCase() === leadName.toLowerCase()) ||
        (normalized && normalizePhone(opportunityPhone) === normalized)
      ) {
        matches.push({ id: String(opportunity.id), label: opportunityName || opportunityPhone, href: `/sales/${opportunity.id}`, source: "lead" });
      }
    }

    return matches.filter((match, index, all) =>
      all.findIndex((item) => item.href === match.href) === index
    );
  }

  async function createFollowUpTask(opportunityId: string) {
    if (!form.next_action_date) return;

    const supabase = createSupabaseBrowserClient();
    const clientName = leadDisplayName(form);
    const title = `${form.next_action}: ${clientName}`;
    const description = [
      `Лийд: ${clientName}`,
      form.contact_name.trim() ? `Контакт: ${form.contact_name.trim()}` : "",
      form.phone.trim() ? `Телефон: ${form.phone.trim()}` : "",
      form.services.length
        ? `Интерес: ${form.services.map(leadServiceLabel).join(", ")}`
        : "",
    ].filter(Boolean).join("\n");

    const { error: taskError } = await supabase.from("service_tasks").insert({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `lead-${Date.now()}`,
      title,
      description,
      task_type: "Търговско проследяване",
      activities: [],
      object_id: opportunityId,
      object_code: "",
      object_name: form.object_name.trim(),
      client: clientName,
      due_date: form.next_action_date,
      source_protocol_id: opportunityId,
      source_protocol_number: "",
      source_protocol_row: "",
      source_protocol_type: "sales_lead",
      source_label: "Лийд",
      status: "planned",
      created_at_ms: Date.now(),
      updated_at: new Date().toISOString(),
    });

    if (taskError) throw new Error(taskError.message);
    window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clientName = leadDisplayName(form);
    if (form.lead_client_type === "corporate" && !form.company_name.trim()) { setError("Моля въведете име на фирмата."); return; }
    if (form.lead_client_type === "private" && !form.first_name.trim()) { setError("Моля въведете име."); return; }
    if (form.lead_client_type === "private" && !form.last_name.trim()) { setError("Моля въведете фамилия."); return; }
    if (!form.phone.trim()) { setError("Моля въведете телефон."); return; }
    if (!isValidEmail(form.email)) { setError("Моля въведете валиден email или оставете полето празно."); return; }
    setSaving(true); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (!duplicateAcknowledged) {
        const foundDuplicates = await findDuplicates();
        if (foundDuplicates.length > 0) {
          setDuplicates(foundDuplicates);
          setSaving(false);
          return;
        }
      }

      const { data: opp, error: oppError } = await supabase
        .from("sales_opportunities")
        .insert({
          lead_client_type: form.lead_client_type,
          company_name: clientName,
          company_eik: form.lead_client_type === "corporate" ? form.company_eik.trim() : "",
          first_name: form.lead_client_type === "private" ? form.first_name.trim() : "",
          last_name: form.lead_client_type === "private" ? form.last_name.trim() : "",
          contact_name: form.lead_client_type === "corporate" ? form.contact_name.trim() : "",
          phone: form.phone.trim(),
          email: form.email.trim(),
          object_type: form.object_type.trim(),
          object_name: form.object_name.trim(),
          object_address: form.object_address.trim(),
          stage: "lead",
          status: "Нов",
          next_action: form.next_action,
          next_action_date: form.next_action_date || null,
          notes: form.notes.trim(),
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (oppError || !opp) { setError(oppError?.message ?? "Грешка при създаване."); setSaving(false); return; }
      if (form.services.length > 0) {
        const { error: servicesError } = await supabase.from("sales_opportunity_services").insert(
          form.services.map(({ category, service }) => ({
            opportunity_id: opp.id,
            service_category: category,
            service_name: service,
          }))
        );
        if (servicesError) throw new Error(servicesError.message);
      }
      await createFollowUpTask(String(opp.id));
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: opp.id, type: "created",
        title: "Лийд създаден",
        description: `Нов запис: ${clientName}`,
      });
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неочаквана грешка.");
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Нов лийд</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Добавяне на нов търговски запис</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <section>
            <SectionHeader icon={<UserRound size={17} />} title="Клиент" subtitle="Контактна информация" />
            <FormField label="Тип клиент">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "corporate", label: "Корпоративен" },
                  { value: "private", label: "Частен" },
                ].map((option) => {
                  const selected = form.lead_client_type === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-black transition ${
                        selected
                          ? "border-orange-200 bg-orange-50 text-orange-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="leadClientType"
                        value={option.value}
                        checked={selected}
                        onChange={() =>
                          updateForm(
                            "lead_client_type",
                            option.value as NewLeadForm["lead_client_type"]
                          )
                        }
                        className="h-4 w-4 accent-orange-600"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </FormField>

            {form.lead_client_type === "corporate" ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <FormField label="Име на фирма *">
                    <Input autoFocus required value={form.company_name} onChange={(e) => updateForm("company_name", e.target.value)} placeholder="Алфа Ритейл ООД" />
                  </FormField>
                  <FormField label="ЕИК / Булстат">
                    <Input value={form.company_eik} onChange={(e) => updateForm("company_eik", e.target.value)} placeholder="123456789" />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,0.9fr)_210px_minmax(260px,1.15fr)]">
                  <FormField label="Контактно лице">
                    <Input value={form.contact_name} onChange={(e) => updateForm("contact_name", e.target.value)} placeholder="Иван Иванов" />
                  </FormField>
                  <FormField label="Телефон *">
                    <Input required type="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="+359 88 ..." />
                  </FormField>
                  <FormField label="Email">
                    <Input type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="office@firma.bg" />
                  </FormField>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Име *">
                  <Input autoFocus required value={form.first_name} onChange={(e) => updateForm("first_name", e.target.value)} placeholder="Иван" />
                </FormField>
                <FormField label="Фамилия *">
                  <Input required value={form.last_name} onChange={(e) => updateForm("last_name", e.target.value)} placeholder="Иванов" />
                </FormField>
                <FormField label="Телефон *">
                  <Input required type="tel" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="+359 88 ..." />
                </FormField>
                <FormField label="Email">
                  <Input type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} placeholder="email@example.com" />
                </FormField>
              </div>
            )}
            {duplicates.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-amber-900">
                  <AlertTriangle size={16} />
                  Намерен е съществуващ клиент
                </div>
                <div className="mt-1 text-xs font-bold text-amber-800">
                  {duplicates[0]?.label}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={duplicates[0]?.href ?? "/sales"}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 text-sm font-black text-amber-800 transition hover:bg-amber-100"
                  >
                    Отвори
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateAcknowledged(true);
                      setDuplicates([]);
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-600 px-3 text-sm font-black text-white transition hover:bg-amber-700"
                  >
                    Продължи като нов
                  </button>
                </div>
              </div>
            )}
          </section>
          <section>
            <SectionHeader icon={<Building2 size={17} />} title="Обект" subtitle="Данни за обекта" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Тип обект">
                <select
                  value={form.object_type}
                  onChange={(e) => {
                    if (e.target.value === ADD_OBJECT_TYPE_VALUE) {
                      setAddingObjectType(true);
                      updateForm("object_type", "");
                      return;
                    }
                    setAddingObjectType(false);
                    updateForm("object_type", e.target.value);
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  <option value="">Изберете тип</option>
                  {availableObjectTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  <option value={ADD_OBJECT_TYPE_VALUE}>+ Добави</option>
                </select>
                {addingObjectType && (
                  <div className="mt-2 flex gap-2">
                    <Input value={newObjectType} onChange={(e) => setNewObjectType(e.target.value)} placeholder="Нов тип обект" />
                    <Button type="button" variant="outline" onClick={addObjectType} disabled={!newObjectType.trim() || savingObjectType}>
                      {savingObjectType ? <Loader2 size={16} className="animate-spin" /> : null}
                      {savingObjectType ? "Запис..." : "Добави"}
                    </Button>
                  </div>
                )}
              </FormField>
              <FormField label="Наименование на обекта">
                <Input value={form.object_name} onChange={(e) => updateForm("object_name", e.target.value)} placeholder="Kaufland север" />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Адрес">
                  <Input value={form.object_address} onChange={(e) => updateForm("object_address", e.target.value)} placeholder="град, улица, номер..." />
                </FormField>
              </div>
            </div>
          </section>
          <section>
            <SectionHeader icon={<Flame size={17} />} title="Интересува се от" subtitle="Услуги и системи" />
            <FormField label="Категории услуги">
              <div className="flex flex-wrap gap-2">
                {serviceCategories.map((category) => {
                  const selected = form.service_categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleServiceCategory(category)}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-black transition ${
                        selected
                          ? "border-orange-300 bg-orange-50 text-orange-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50"
                      }`}
                    >
                      {selected ? <CheckCircle2 size={13} /> : null}
                      {category}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.service_categories.map((category) => {
                const options = serviceCatalog[category] ?? [];
                if (!options.length) return null;

                return (
                  <FormField key={category} label={category}>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) toggleService(category, e.target.value);
                      }}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    >
                      <option value="">Изберете услуга</option>
                      {options.map((service) => <option key={service} value={service}>{service}</option>)}
                    </select>
                  </FormField>
                );
              })}
            </div>
          </section>
          <section>
            <SectionHeader icon={<CalendarClock size={17} />} title="Следващо действие" subtitle="Планиране" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Тип действие">
                <select value={form.next_action} onChange={(e) => updateForm("next_action", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100">
                  {NEXT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </FormField>
              <FormField label="Дата">
                <input type="date" value={form.next_action_date} onChange={(e) => updateForm("next_action_date", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100" />
              </FormField>
            </div>
          </section>
          <FormField label="Бележки">
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3}
              placeholder="Допълнителна информация за клиента, обекта или нуждите..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100" />
          </FormField>
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отказ</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? "Записване..." : "Създай лийд"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
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

// Main Page
export default function SalesPage() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [movingId, setMovingId] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [serviceTarget, setServiceTarget] = useState<Opportunity | null>(null);
  const [startingServiceId, setStartingServiceId] = useState("");

  function showToast(message: string, type: Toast["type"] = "success") {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3_500);
  }

  const loadOpportunities = useCallback(async () => {
    setLoadState("loading");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("sales_opportunities")
        .select("*, sales_opportunity_services(service_category, service_name)")
        .eq("archived", false)
        .order("last_activity_at", { ascending: false });
      if (error) { setLoadState("error"); return; }
      const offerDraftIds = (data ?? []).map((row) => `offer-${String(row.id)}`);
      const contractDraftIds = (data ?? []).map((row) => `contract-${String(row.id)}`);
      let draftIdSet = new Set<string>();
      let acceptedContractIdSet = new Set<string>();
      if (offerDraftIds.length > 0 || contractDraftIds.length > 0) {
        const { data: draftRows } = await supabase
          .from("saved_documents")
          .select("id, payload")
          .in("id", [...offerDraftIds, ...contractDraftIds]);

        const rows = (draftRows as { id: string; payload?: unknown }[] | null) ?? [];
        draftIdSet = new Set(rows.map((row) => row.id));
        acceptedContractIdSet = new Set(
          rows
            .filter((row) => row.id.startsWith("contract-") && savedContractIsAccepted(row.payload))
            .map((row) => row.id)
        );
      }
      const mapped: Opportunity[] = (data ?? []).map((row) => ({
        id: String(row.id),
        lead_client_type: opportunityClientType(row.lead_client_type),
        company_name: String(row.company_name ?? ""),
        company_eik: String(row.company_eik ?? ""),
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
        archived: Boolean(row.archived),
        hasOfferDraft: draftIdSet.has(`offer-${String(row.id)}`),
        hasContractDraft: draftIdSet.has(`contract-${String(row.id)}`),
        hasAcceptedContract: acceptedContractIdSet.has(`contract-${String(row.id)}`),
        services: Array.isArray(row.sales_opportunity_services)
          ? (row.sales_opportunity_services as { service_category?: string | null; service_name: string }[])
              .map(mapOpportunityService)
          : [],
      }));
      setOpportunities(mapped);
      setLoadState("ready");
    } catch { setLoadState("error"); }
  }, []);

  useEffect(() => { loadOpportunities(); }, [loadOpportunities]);

  async function handleMoveStage(id: string, nextStage: Stage) {
    setMovingId(id);
    try {
      const supabase = createSupabaseBrowserClient();
      const defaultStatus = NEXT_STAGE_STATUS[nextStage];
      const updates: Record<string, unknown> = { stage: nextStage, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (defaultStatus) updates.status = defaultStatus;
      const { error } = await supabase.from("sales_opportunities").update(updates).eq("id", id);
      if (error) { showToast("Грешка при преместване.", "error"); setMovingId(""); return; }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: id, type: "stage_change",
        title: `Преминаване към ${STAGE_LABELS[nextStage]}`,
        description: `Записът е преместен в ${STAGE_LABELS[nextStage]}.`,
      });
      showToast(`Записът е преместен в ${STAGE_LABELS[nextStage]}.`);
      await loadOpportunities();
    } catch { showToast("Грешка при преместване.", "error"); }
    finally { setMovingId(""); }
  }

  async function handleArchive(reason: string) {
    if (!archiveTargetId) return;
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
        .eq("id", archiveTargetId);
      if (error) { showToast("Грешка при архивиране.", "error"); setArchiving(false); return; }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: archiveTargetId,
        type: "archive",
        title: "Записът е архивиран",
        description: reason.trim() ? `Причина: ${reason.trim()}` : "Записът е преместен в архива.",
      });
      setArchiveTargetId(null);
      setArchiving(false);
      showToast("Записът е архивиран успешно.");
      await loadOpportunities();
    } catch {
      showToast("Грешка при архивиране.", "error");
      setArchiving(false);
    }
  }

  async function handleStartService() {
    if (!serviceTarget || startingServiceId) return;
    if (!serviceTarget.hasAcceptedContract) {
      showToast("Първо запазете и приемете договора.", "error");
      return;
    }
    setStartingServiceId(serviceTarget.id);
    try {
      const supabase = createSupabaseBrowserClient();
      let clientId: string | null = null;
      const clientName =
        serviceTarget.lead_client_type === "private"
          ? privateLeadName(serviceTarget.first_name, serviceTarget.last_name) ||
            serviceTarget.company_name.trim()
          : serviceTarget.company_name.trim();
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .ilike("name", clientName)
        .maybeSingle();

      if (existingClient) {
        clientId = String(existingClient.id);
        const { error: clientUpdateError } = await supabase
          .from("clients")
          .update(opportunityClientPayload(serviceTarget))
          .eq("id", clientId);
        if (clientUpdateError) {
          showToast("Грешка при обновяване на клиента.", "error");
          setStartingServiceId("");
          return;
        }
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert(opportunityClientPayload(serviceTarget))
          .select("id")
          .single();
        if (clientError || !newClient) {
          showToast("Грешка при създаване на клиент.", "error");
          setStartingServiceId("");
          return;
        }
        clientId = String(newClient.id);
      }

      const qrCode = createObjectQrCode();
      const address = serviceTarget.object_address.trim();
      const geocoded = address ? await geocodeAddress(address) : null;
      const { data: newLocation, error: locationError } = await supabase
        .from("locations")
        .insert({
          client_id: clientId,
          object_type: serviceTarget.object_type.trim(),
          qr_code: qrCode,
          name: serviceTarget.object_name.trim() || clientName,
          address,
          region: "",
          status: "изряден",
          service: serviceTarget.services.map(serviceDisplayName).join(", "),
          latitude: geocoded?.latitude ?? null,
          longitude: geocoded?.longitude ?? null,
          geocoded_address: geocoded?.displayName ?? null,
          geocoded_at: geocoded ? new Date().toISOString() : null,
        })
        .select("id, qr_code")
        .single();

      if (locationError || !newLocation) {
        showToast("Грешка при създаване на обект.", "error");
        setStartingServiceId("");
        return;
      }

      const now = new Date().toISOString();
      const contractDocumentId = `contract-${serviceTarget.id}`;
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
          object: serviceTarget.object_name || clientName,
          payload: {
            ...contractPayload,
            locationId: String(newLocation.id),
            locationQrCode: String(newLocation.qr_code),
            convertedObjectId: String(newLocation.id),
          },
          updated_at: now,
        })
        .eq("id", contractDocumentId)
        .eq("kind", "contract");
      await supabase.from("sales_opportunities").update({
        converted_to_service: true,
        converted_client_id: clientId,
        converted_object_id: String(newLocation.id),
        last_activity_at: now,
        updated_at: now,
      }).eq("id", serviceTarget.id);
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: serviceTarget.id,
        type: "converted",
        title: "Стартирано обслужване",
        description: `Създаден е клиент и обект: ${clientName} / ${serviceTarget.object_name || clientName}`,
      });

      showToast("Обслужването е стартирано.");
      setServiceTarget(null);
      setStartingServiceId("");
      router.push(`/locations/${encodeURIComponent(String(newLocation.qr_code))}`);
    } catch {
      showToast("Неочаквана грешка. Моля опитайте отново.", "error");
      setStartingServiceId("");
    }
  }

  const byStage = (stage: Stage) => opportunities.filter((o) => o.stage === stage && !o.converted_to_service);
  const archiveTarget = archiveTargetId ? opportunities.find((o) => o.id === archiveTargetId) : null;

  const newRecordButton = (
    <button type="button" onClick={() => setModalOpen(true)}
      className="flex h-9 items-center gap-2 rounded-xl border border-transparent bg-gradient-to-r from-red-600 via-red-500 to-orange-400 px-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(239,68,68,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(239,68,68,0.24)] active:translate-y-0">
      <Plus size={16} />
      Нов запис
    </button>
  );

  return (
    <AppShell title="Продажби" description="Търговски pipeline от първи контакт до активен договор" showSearch={false}>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Търговски поток</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Проследяване на всички възможности: лийд → оферта → поръчка → договор.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {loadState === "error" && <span className="text-sm font-bold text-red-600">Грешка при зареждане</span>}
              {newRecordButton}
              <button type="button" onClick={loadOpportunities} disabled={loadState === "loading"}
                className="flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50" title="Обнови">
                <RefreshCw size={16} className={loadState === "loading" ? "animate-spin" : ""} />
                Обнови
              </button>
              <Link
                href="/sales/archive"
                className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                <Archive size={15} />
                Архив
              </Link>
            </div>
          </div>
        </Card>
        {loadState === "loading" ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 size={28} className="animate-spin text-orange-500" />
          </div>
        ) : (
          <div className="overflow-x-auto pb-3">
            <div className="grid min-w-[1180px] grid-cols-4 gap-5">
              {STAGES.map((stage, index) => {
                const items = byStage(stage.key);
                return (
                  <section key={stage.key} className="relative rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    {index < STAGES.length - 1 && (
                      <div className="absolute -right-4 top-8 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-orange-100 bg-white text-orange-500 shadow-sm">
                        <MoveRight size={17} />
                      </div>
                    )}
                    <div className={`h-1.5 rounded-full bg-gradient-to-r ${stage.accent}`} />
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-black text-slate-950">{stage.label}</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{STAGE_DESCRIPTIONS[stage.key]}</p>
                      </div>
                      <Badge variant="neutral">{items.length}</Badge>
                    </div>
                    <div className="mt-4 space-y-4">
                      {items.length
                        ? items.map((item) => (
                            <PipelineCard
                              key={item.id}
                              item={item}
                              onMoveStage={handleMoveStage}
                              onStartService={setServiceTarget}
                              movingId={movingId}
                              startingServiceId={startingServiceId}
                              onArchive={(id) => setArchiveTargetId(id)}
                            />
                          ))
                        : <EmptyState stage={stage.key} />}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <NewLeadModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => { loadOpportunities(); showToast("Лийдът е създаден успешно."); }} />
      {archiveTargetId && archiveTarget && (
        <ArchiveConfirmModal
          companyName={archiveTarget.company_name}
          archiving={archiving}
          onConfirm={handleArchive}
          onCancel={() => { if (!archiving) setArchiveTargetId(null); }}
        />
      )}
      {serviceTarget && (
        <StartServiceConfirmModal
          companyName={serviceTarget.company_name}
          loading={startingServiceId === serviceTarget.id}
          onConfirm={handleStartService}
          onCancel={() => { if (!startingServiceId) setServiceTarget(null); }}
        />
      )}
      <ToastContainer toasts={toasts} />
    </AppShell>
  );
}
