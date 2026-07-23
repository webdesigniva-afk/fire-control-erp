"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  PackageOpen,
  QrCode,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { DashboardMap } from "../../components/dashboard-map";
import type { DashboardMapObject } from "../../components/dashboard-map-leaflet";
import { QrScannerButton } from "../../components/qr-scanner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  buildMapObjectsData,
  collapseReplacedEquipmentTasks,
  geocodeMissingLocationCoordinates,
} from "../../lib/map-objects";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { getTeamMemberInitials } from "../../lib/team-members";
import {
  readWarehouseItems,
  readWarehouseStock,
  totalStock,
  type WarehouseItem,
  type WarehouseStock,
} from "../../lib/warehouse";

type DataRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "error";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type LocationStatus = "изряден" | "предстои" | "просрочен";
type TaskStatus = "planned" | "done" | "open" | "resolved" | "completed";
type ProtocolStatus = "draft" | "completed" | string;

type LocationItem = {
  id: string;
  qrCode: string;
  name: string;
  address?: string;
  geocodedAddress?: string;
  status: LocationStatus;
  latitude?: number;
  longitude?: number;
};

type EquipmentItem = {
  id: string;
  locationId: string;
  name: string;
  type: string;
  nextCheckDate: string;
  updatedAt: string;
};

type ServiceTaskItem = {
  id: string;
  title: string;
  taskType: string;
  objectId?: string;
  objectCode: string;
  objectName: string;
  client: string;
  technician: string;
  dueDate: string;
  status: TaskStatus;
  sourceProtocolId?: string;
  sourceProtocolNumber?: string;
  sourceProtocolRow?: string;
  sourceProtocolType?: string;
  sourceLabel?: string;
  updatedAt: string;
  createdAt: number;
};

type ProblemItem = {
  id: string;
  objectId: string;
  protocolId?: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "PLANNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  assignedTo: string;
  createdAt: string;
};

type ProtocolItem = {
  id: string;
  number: string;
  type: string;
  objectName: string;
  technician: string;
  status: ProtocolStatus;
  date: string;
  updatedAt: string;
  signed: boolean;
};

type ContractItem = {
  id: string;
  number: string;
  client: string;
  objectName: string;
  createdAt: string;
  expiresAt: string;
  status: string;
};

type TechnicianItem = {
  id: string;
  name: string;
  photoUrl: string;
  active: boolean;
  archivedAt?: string;
};

type DashboardData = {
  locations: LocationItem[];
  equipment: EquipmentItem[];
  tasks: ServiceTaskItem[];
  problems: ProblemItem[];
  protocols: ProtocolItem[];
  contracts: ContractItem[];
  technicians: TechnicianItem[];
  warehouseItems: WarehouseItem[];
  warehouseStock: WarehouseStock[];
};

type Kpi = {
  label: string;
  value: string;
  note: string;
  tone: Tone;
  icon: LucideIcon;
};

type AttentionItem = {
  id: string;
  object: string;
  category: string;
  description: string;
  date: string;
  severity: "critical" | "warning" | "attention";
  href: string;
  protocolHref?: string;
  objectHref?: string;
};

type DayTask = {
  id: string;
  due: string;
  object: string;
  type: string;
  technician: string;
  sourceLabel: string;
  href: string;
};

type Activity = {
  action: string;
  details: string;
  time: string;
  occurredAt: string;
  icon: LucideIcon;
};

type UpcomingInspection = {
  date: string;
  object: string;
  type: string;
  technician: string;
  status: string;
};

type TechnicianStatus = "свободен" | "на обект" | "натоварен";
type TechnicianSummary = {
  name: string;
  photoUrl: string;
  todayTasks: number;
  lastActivity: string;
  status: TechnicianStatus;
};

type StockRiskItem = {
  id: string;
  name: string;
  category: string;
  currentQuantity: number;
  minimumQuantity: number;
  unit: string;
};

const emptyDashboardData: DashboardData = {
  locations: [],
  equipment: [],
  tasks: [],
  problems: [],
  protocols: [],
  contracts: [],
  technicians: [],
  warehouseItems: [],
  warehouseStock: [],
};

const quickActions = [
  { label: "Нов протокол", href: "/protocols/new", icon: FileText, primary: true },
  { label: "Нов обект", href: "/locations/new", icon: Building2 },
  { label: "Нов клиент", href: "/clients?new=1", icon: UserPlus },
  { label: "Сканирай QR", scanner: true, icon: QrCode },
];

const toneStyles: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

const badgeVariantByTone = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  neutral: "neutral",
} as const;

const ACTIVITY_LOOKBACK_DAYS = 30;
const ACTIVITY_LIMIT = 8;

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberValue(record: DataRecord | null | undefined, keys: string[]) {
  const raw = textValue(record, keys).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function payloadValue(record: DataRecord, keys: string[]) {
  const payload = record["protocol_payload"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }
  return textValue(payload as DataRecord, keys);
}

function dateFromIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYearsToDateKey(value: string, years: number) {
  const date = dateFromIso(value.slice(0, 10));
  if (!date) return "";

  date.setFullYear(date.getFullYear() + years);
  return toLocalDateKey(date);
}

function daysBetween(fromKey: string, toKey: string) {
  const from = dateFromIso(fromKey);
  const to = dateFromIso(toKey);
  if (!from || !to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function formatDate(value: string) {
  const date = dateFromIso(value);
  if (!date) return value || "няма дата";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function relativeTime(value: string) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "без дата";

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 60_000)
  );

  if (diffMinutes < 60) return `преди ${diffMinutes || 1} мин`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `преди ${hours} ч`;
  return formatDate(toLocalDateKey(date));
}

function isRecentActivityDate(value: string, todayKey: string) {
  const key = value ? value.slice(0, 10) : "";
  if (!key) return false;

  const ageDays = daysBetween(key, todayKey);
  return ageDays >= 0 && ageDays <= ACTIVITY_LOOKBACK_DAYS;
}

function normalizeLocationStatus(value: string): LocationStatus {
  const normalized = value.toLowerCase();
  if (normalized.includes("просроч") || normalized.includes("overdue")) {
    return "просрочен";
  }
  if (normalized.includes("предст") || normalized.includes("pending")) {
    return "предстои";
  }
  return "изряден";
}

function isEquipmentProblem(item: EquipmentItem, todayKey: string) {
  return Boolean(item.nextCheckDate && item.nextCheckDate < todayKey);
}

function mapLocation(row: DataRecord, index: number): LocationItem {
  const id = textValue(row, ["id"]);
  const qrCode = textValue(row, ["qr_code", "code"]) || id;

  return {
    id: id || String(index + 1),
    qrCode,
    name: textValue(row, ["name", "object_name", "title"]) || "Без име",
    address: textValue(row, ["address", "full_address"]),
    geocodedAddress: textValue(row, ["geocoded_address"]),
    status: normalizeLocationStatus(textValue(row, ["status"])),
    latitude: numberValue(row, ["latitude", "lat"]),
    longitude: numberValue(row, ["longitude", "lng", "lon"]),
  };
}

function mapEquipment(row: DataRecord): EquipmentItem {
  return {
    id: textValue(row, ["id"]),
    locationId: textValue(row, ["location_id", "object_id", "site_id"]),
    name: textValue(row, ["name"]) || textValue(row, ["type", "category"]),
    type: textValue(row, ["type", "category"]) || "Оборудване",
    nextCheckDate: textValue(row, ["next_check_date", "next_check"]),
    updatedAt: textValue(row, ["updated_at", "created_at"]),
  };
}

function mapTask(row: DataRecord): ServiceTaskItem {
  return {
    id: textValue(row, ["id"]),
    title: textValue(row, ["title"]) || "Сервизна задача",
    objectId: textValue(row, ["object_id"]) || undefined,
    objectCode: textValue(row, ["object_code"]),
    objectName: textValue(row, ["object_name"]) || "Обект",
    client: textValue(row, ["client"]),
    technician: textValue(row, ["technician", "assigned_to", "assignee"]),
    dueDate: textValue(row, ["due_date"]),
    taskType: textValue(row, ["task_type"]),
    status: (textValue(row, ["status"]) || "planned") as TaskStatus,
    sourceProtocolId: textValue(row, ["source_protocol_id"]) || undefined,
    sourceProtocolNumber: textValue(row, ["source_protocol_number"]) || undefined,
    sourceProtocolRow: textValue(row, ["source_protocol_row"]) || undefined,
    sourceProtocolType: textValue(row, ["source_protocol_type"]) || undefined,
    sourceLabel: textValue(row, ["source_label"]) || undefined,
    updatedAt: textValue(row, ["updated_at"]),
    createdAt: Number(textValue(row, ["created_at_ms"])) || 0,
  };
}

function mapSalesFollowUpTask(row: DataRecord): ServiceTaskItem | null {
  const id = textValue(row, ["id"]);
  const dueDate = textValue(row, ["next_action_date"]);
  if (!id || !dueDate) return null;

  const company = textValue(row, ["company_name"]) || "Лийд";
  const action = textValue(row, ["next_action"]) || "Следващо действие";

  return {
    id: `sales-${id}`,
    title: action,
    objectId: id,
    objectCode: "",
    objectName: textValue(row, ["object_name"]) || company,
    client: company,
    technician: "",
    dueDate,
    taskType: "Търговско проследяване",
    status: "planned",
    sourceProtocolId: id,
    sourceProtocolType: "sales_lead",
    sourceLabel: "Лийд",
    updatedAt: textValue(row, ["updated_at", "created_at"]),
    createdAt: Number(textValue(row, ["created_at_ms"])) || Date.parse(textValue(row, ["created_at"])) || 0,
  };
}

function isSalesFlowTask(task: ServiceTaskItem) {
  const taskType = task.taskType.trim().toLowerCase();
  const sourceProtocolType = (task.sourceProtocolType || "").trim().toLowerCase();
  const sourceLabel = (task.sourceLabel || "").trim().toLowerCase();

  return (
    taskType === "търговско проследяване" ||
    sourceProtocolType === "sales_lead" ||
    sourceLabel === "лийд"
  );
}

async function selectSalesFollowUpRows() {
  const supabase = createSupabaseBrowserClient();
  const primaryResult = await supabase
    .from("sales_opportunities")
    .select("id,company_name,object_name,next_action,next_action_date,created_at,updated_at,archived")
    .not("next_action_date", "is", null)
    .or("archived.is.false,archived.is.null");
  let data = primaryResult.data as DataRecord[] | null;
  let error = primaryResult.error;

  if (error) {
    const fallbackResult = await supabase
      .from("sales_opportunities")
      .select("id,company_name,object_name,next_action,next_action_date,created_at,updated_at")
      .not("next_action_date", "is", null);

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    console.warn("[dashboard] sales follow-up load failed", error.message);
    return [];
  }

  return ((data as DataRecord[]) ?? []);
}

function mapProblem(row: DataRecord): ProblemItem {
  const severity = textValue(row, ["severity"]).toUpperCase();
  const status = textValue(row, ["status"]).toUpperCase();

  return {
    id: textValue(row, ["id"]),
    objectId: textValue(row, ["object_id"]),
    protocolId: textValue(row, ["protocol_id"]) || undefined,
    title: textValue(row, ["title"]) || "Проблем",
    description: textValue(row, ["description"]),
    severity: (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)
      ? severity
      : "MEDIUM") as ProblemItem["severity"],
    status: (["OPEN", "PLANNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
      ? status
      : "OPEN") as ProblemItem["status"],
    assignedTo: textValue(row, ["assigned_to"]),
    createdAt: textValue(row, ["created_at"]),
  };
}

function mapProtocol(row: DataRecord): ProtocolItem {
  const number =
    payloadValue(row, ["number"]) ||
    textValue(row, ["protocol_number", "number", "id"]);
  const status =
    payloadValue(row, ["status"]) || textValue(row, ["status"]) || "draft";
  const technician =
    payloadValue(row, ["technician"]) || textValue(row, ["technician"]);
  const signed = Boolean(
    payloadValue(row, ["technicianSignatureDataUrl"]) &&
      payloadValue(row, ["clientSignatureDataUrl"])
  );

  return {
    id: textValue(row, ["id"]),
    number,
    type:
      payloadValue(row, ["protocolType"]) ||
      textValue(row, ["protocol_type", "type"]) ||
      "Протокол",
    objectName:
      payloadValue(row, ["objectName"]) || textValue(row, ["object_name"]),
    technician,
    status,
    date: payloadValue(row, ["date"]) || textValue(row, ["protocol_date", "date"]),
    updatedAt: textValue(row, ["updated_at", "created_at"]),
    signed,
  };
}

function mapContract(row: DataRecord): ContractItem {
  const payload = isRecord(row.payload) ? row.payload : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const createdAt =
    textValue(contract, ["date", "createdAt", "created_at"]) ||
    textValue(row, ["updated_at", "created_at"]).slice(0, 10);

  return {
    id: textValue(row, ["id"]),
    number: textValue(row, ["number"]) || textValue(contract, ["number"]) || "Без номер",
    client: textValue(row, ["client"]) || textValue(contract, ["client"]),
    objectName: textValue(row, ["object"]) || textValue(contract, ["object"]),
    createdAt,
    expiresAt: addYearsToDateKey(createdAt, 1),
    status: textValue(payload, ["status"]),
  };
}

function mapTechnicianMember(row: DataRecord, index: number): TechnicianItem {
  return {
    id: textValue(row, ["id"]) || `technician-${index + 1}`,
    name: textValue(row, ["name"]),
    photoUrl: textValue(row, ["photo_url", "photoUrl"]),
    active: row["is_active"] !== false,
    archivedAt: "",
  };
}

function taskSourceIsActive(task: ServiceTaskItem, protocolRefs: Set<string>) {
  const directRefs = [
    task.sourceProtocolId,
    task.sourceProtocolNumber,
  ].filter(Boolean) as string[];

  if (directRefs.length === 0 && !task.sourceLabel) return true;
  if (directRefs.some((ref) => protocolRefs.has(ref))) return true;

  const label = task.sourceLabel || "";
  return Array.from(protocolRefs).some((ref) => label.includes(ref));
}

function protocolHrefFromTask(task: ServiceTaskItem) {
  const protocolRef = task.sourceProtocolNumber || task.sourceProtocolId;
  return protocolRef
    ? `/protocols/view/${encodeURIComponent(protocolRef)}`
    : null;
}

async function selectRows(table: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from(table).select("*");
  if (error) {
    console.warn(`[dashboard] ${table} load failed`, error.message);
    return [];
  }
  return ((data as DataRecord[]) ?? []);
}

function resolveDashboardRequest<T>(
  request: PromiseLike<T>,
  fallback: T,
  label: string,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      console.warn(`[dashboard] ${label} load timed out`);
      resolve(fallback);
    }, timeoutMs);

    Promise.resolve(request)
      .then((result) => {
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

async function loadDashboardData(): Promise<DashboardData> {
  const supabase = createSupabaseBrowserClient();
  const [
    locationRows,
    equipmentRows,
    taskRows,
    salesFollowUpRows,
    problemRows,
    protocolRows,
    contractRows,
    technicianRows,
    warehouseItems,
    warehouseStock,
  ] = await Promise.all([
    resolveDashboardRequest(selectRows("locations"), [], "locations"),
    resolveDashboardRequest(selectRows("equipment"), [], "equipment"),
    resolveDashboardRequest(selectRows("service_tasks"), [], "service tasks"),
    resolveDashboardRequest(selectSalesFollowUpRows(), [], "sales follow-ups"),
    resolveDashboardRequest(selectRows("problems"), [], "problems"),
    resolveDashboardRequest(selectRows("protocols"), [], "protocols"),
    resolveDashboardRequest(
      supabase
        .from("saved_documents")
        .select("id,number,client,object,payload,updated_at")
        .eq("kind", "contract")
        .then(({ data, error }) => {
          if (error) {
            console.warn("[dashboard] contracts load failed", error.message);
            return [];
          }
          return ((data as DataRecord[]) ?? []);
        }),
      [],
      "contracts"
    ),
    resolveDashboardRequest(
      supabase
        .from("team_members")
        .select("id,name,photo_url,is_active,role")
        .eq("role", "Техник")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.warn("[dashboard] team members load failed", error.message);
            return [];
          }
          return ((data as DataRecord[]) ?? []);
        }),
      [],
      "team members"
    ),
    resolveDashboardRequest(readWarehouseItems(), [], "warehouse items"),
    resolveDashboardRequest(readWarehouseStock(), [], "warehouse stock"),
  ]);

  const locations = locationRows.map(mapLocation);

  return {
    locations,
    equipment: equipmentRows
      .filter((row) => row["archived"] !== true)
      .map(mapEquipment),
    tasks: [
      ...taskRows.map(mapTask).filter((task) => task.sourceProtocolType !== "sales_lead"),
      ...salesFollowUpRows.map(mapSalesFollowUpTask).filter((task): task is ServiceTaskItem => Boolean(task)),
    ],
    problems: problemRows.map(mapProblem),
    protocols: protocolRows.map(mapProtocol),
    contracts: contractRows.map(mapContract),
    technicians: technicianRows.map(mapTechnicianMember).filter((item) => item.name && item.active),
    warehouseItems,
    warehouseStock,
  };
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
      {label}
    </div>
  );
}

function SectionHeader({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <div>
      {eyebrow ? (
        <div className="text-xs font-bold uppercase text-slate-400">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "изряден" || status === "свободен" || status === "completed"
      ? "success"
      : status === "рисков" || status === "натоварен" || status === "просрочен"
        ? "danger"
        : status === "предстои" || status === "planned"
          ? "warning"
          : status === "на обект"
            ? "info"
            : "neutral";

  return <Badge variant={variant}>{status}</Badge>;
}

function QuickActionsCard() {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeader title="Бързи действия" eyebrow="оперативен старт" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const className = action.scanner
              ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md"
              : action.primary
                ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-orange-400 px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(239,68,68,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(239,68,68,0.24)]"
                : "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md";

            if (action.scanner) {
              return (
                <QrScannerButton key={action.label} buttonClassName={className}>
                  <Icon className="h-4 w-4" />
                  {action.label}
                </QrScannerButton>
              );
            }

            return (
              <Link key={action.label} href={action.href ?? "#"} className={className}>
                <Icon className="h-4 w-4" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;

  return (
    <Card hover className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-xl border p-2.5 ${toneStyles[kpi.tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <Badge variant={badgeVariantByTone[kpi.tone]}>
          {kpi.tone === "danger" ? "действие" : kpi.tone === "warning" ? "следи" : "OK"}
        </Badge>
      </div>
      <div className="mt-4 text-2xl font-black text-slate-950">{kpi.value}</div>
      <div className="mt-1 text-sm font-black text-slate-800">{kpi.label}</div>
      <p className="mt-1.5 text-sm font-medium leading-5 text-slate-500">{kpi.note}</p>
    </Card>
  );
}

function AttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="Нуждаят се от внимание" eyebrow="Важно" />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              className="group rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-white hover:shadow-md"
            >
              <div className="flex gap-3">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-red-500 ring-4 ring-red-100" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-black text-slate-950">{item.object}</div>
                  </div>
                  <div className="mt-2 text-xs font-black uppercase text-slate-400">
                    {item.category}
                  </div>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-500">
                    {item.description}
                  </p>
                  <div className="mt-2 text-xs font-bold text-slate-400">
                    {item.date}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href={item.protocolHref || item.href}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-sm transition group-hover:border-orange-200 group-hover:bg-orange-50 group-hover:text-orange-700"
                >
                  Протокол
                </Link>
                {item.objectHref ? (
                  <Link
                    href={item.objectHref}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                  >
                    Обект
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <EmptyState label="Няма проблеми за внимание." />
        )}
      </div>
    </Card>
  );
}

function TodayTasksCard({ tasks }: { tasks: DayTask[] }) {
  const todayLabel = formatDate(toLocalDateKey(new Date()));

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="Задачи за деня" eyebrow={`днес · ${todayLabel}`} />
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-700">
          <Clock3 className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {tasks.length ? (
          tasks.map((task) => (
            <Link
              key={task.id}
              href={task.href}
              className="block rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 transition hover:border-orange-200 hover:bg-white hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-950">
                  {task.type}
                </div>
                <div className="mt-1 truncate text-xs font-bold text-slate-500">
                  {task.object}
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] font-black uppercase text-slate-400">
                  {task.sourceLabel && task.sourceLabel !== "—" ? (
                    <span className="shrink-0">{task.sourceLabel}</span>
                  ) : null}
                  {task.technician ? <span className="truncate">{task.technician}</span> : null}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState label="Няма задачи за днес." />
        )}
      </div>
    </Card>
  );
}

function ActivityCard({ activities }: { activities: Activity[] }) {
  return (
    <Card className="p-5">
      <SectionHeader title="Последна активност" eyebrow="30 дни" />
      <div className="mt-5 max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {activities.length ? (
          activities.map((activity, index) => {
            const Icon = activity.icon;

            return (
              <div
                key={`${activity.occurredAt}-${activity.action}-${activity.details}-${index}`}
                className="flex gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <div className="font-black text-slate-950">{activity.action}</div>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-500">
                    {activity.details}
                  </p>
                  <div className="mt-2 text-xs font-bold text-slate-400">
                    {activity.time}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState label="Все още няма реална активност за показване." />
        )}
      </div>
    </Card>
  );
}

function UpcomingCard({ inspections }: { inspections: UpcomingInspection[] }) {
  return (
    <Card className="p-5">
      <SectionHeader title="Следващи проверки" eyebrow="7 дни" />
      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {inspections.length ? (
          inspections.map((inspection) => (
            <div
              key={`${inspection.date}-${inspection.object}-${inspection.type}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3"
            >
              <div className="w-16 shrink-0 text-sm font-black text-slate-950">
                {inspection.date}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-black text-slate-950">
                  {inspection.object}
                </div>
                <div className="text-sm font-medium text-slate-500">
                  {inspection.type}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-400">
                  {inspection.technician}
                </div>
              </div>
              <StatusBadge status={inspection.status} />
            </div>
          ))
        ) : (
          <EmptyState label="Няма проверки в следващите 7 дни." />
        )}
      </div>
    </Card>
  );
}

function TechniciansCard({ technicians }: { technicians: TechnicianSummary[] }) {
  return (
    <Card className="p-5">
      <SectionHeader title="Техници" eyebrow="екип" />
      <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
        {technicians.length ? (
          technicians.map((technician) => (
            <div
              key={technician.name}
              className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-orange-50 text-sm font-black text-orange-700">
                {technician.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={technician.photoUrl} alt={technician.name} className="h-full w-full object-cover" />
                ) : (
                  getTeamMemberInitials(technician.name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-black text-slate-950">
                  {technician.name}
                </div>
                <div className="text-sm font-medium text-slate-500">
                  {technician.todayTasks} задачи днес
                </div>
                <div className="mt-1 text-xs font-bold text-slate-400">
                  {technician.lastActivity}
                </div>
              </div>
              <StatusBadge status={technician.status} />
            </div>
          ))
        ) : (
          <EmptyState label="Няма активни техници в Екип." />
        )}
      </div>
    </Card>
  );
}

function MapOperationsCard({
  objects,
  totalObjects,
}: {
  objects: DashboardMapObject[];
  totalObjects: number;
}) {
  return (
    <DashboardMap objects={objects} totalObjects={totalObjects} />
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyDashboardData);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  async function refreshDashboard() {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const nextData = await loadDashboardData();
      setData(nextData);
      setLoadState("ready");

      void geocodeMissingLocationCoordinates(nextData.locations, {
        limit: 2,
        refreshExisting: false,
      })
        .then((locationsWithCoordinates) => {
          setData((current) => ({
            ...current,
            locations: locationsWithCoordinates,
          }));
        })
        .catch(() => undefined);
    } catch (error) {
      setLoadState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Dashboard данните не можаха да се заредят от Supabase."
      );
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const derived = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const locationsByLookup = new Map<string, LocationItem>();
    for (const location of data.locations) {
      for (const key of [location.id, location.qrCode, location.name]) {
        if (key) locationsByLookup.set(key, location);
      }
    }

    const protocolRefs = new Set(
      data.protocols.flatMap((protocol) =>
        [protocol.id, protocol.number].filter(Boolean)
      )
    );
    const techniciansByProtocolRef = new Map<string, string>();
    for (const protocol of data.protocols) {
      if (!protocol.technician) continue;
      for (const ref of [protocol.id, protocol.number].filter(Boolean)) {
        techniciansByProtocolRef.set(ref, protocol.technician);
      }
    }

    function locationFromTask(task: ServiceTaskItem) {
      return (
        (task.objectId ? locationsByLookup.get(task.objectId) : undefined) ||
        (task.objectCode ? locationsByLookup.get(task.objectCode) : undefined) ||
        (task.objectName ? locationsByLookup.get(task.objectName) : undefined)
      );
    }

    function taskHasActiveDashboardContext(task: ServiceTaskItem) {
      if (task.sourceProtocolType === "sales_lead") return true;

      const hasProtocolSource = Boolean(
        task.sourceProtocolId || task.sourceProtocolNumber || task.sourceLabel
      );

      return Boolean(locationFromTask(task)) ||
        (hasProtocolSource && taskSourceIsActive(task, protocolRefs));
    }

    function technicianForTask(task: ServiceTaskItem) {
      return (
        task.technician ||
        (task.sourceProtocolId
          ? techniciansByProtocolRef.get(task.sourceProtocolId)
          : "") ||
        (task.sourceProtocolNumber
          ? techniciansByProtocolRef.get(task.sourceProtocolNumber)
          : "") ||
        ""
      );
    }

    const plannedTasks = collapseReplacedEquipmentTasks(
      data.tasks.filter(
        (task) =>
          task.status === "planned" &&
          taskHasActiveDashboardContext(task) &&
          !isSalesFlowTask(task)
      )
    );
    const plannedSalesTasks = data.tasks.filter(
      (task) =>
        task.status === "planned" &&
        task.dueDate &&
        isSalesFlowTask(task) &&
        taskHasActiveDashboardContext(task)
    );
    const openDefectTasks = data.tasks.filter(
      (task) =>
        task.taskType === "defect" &&
        task.status === "open" &&
        taskHasActiveDashboardContext(task)
    );
    const todayTasks = [...plannedTasks, ...plannedSalesTasks]
      .filter((task) => task.dueDate === todayKey)
      .sort((first, second) => first.dueDate.localeCompare(second.dueDate));

    const overdueEquipment = data.equipment.filter((item) =>
      isEquipmentProblem(item, todayKey)
    );
    const overdueTasks = plannedTasks.filter(
      (task) => task.dueDate && task.dueDate < todayKey
    );
    const upcomingTasks = plannedTasks.filter((task) => {
      if (!task.dueDate) return false;
      const days = daysBetween(todayKey, task.dueDate);
      return days >= 0 && days <= 7;
    });

    const expiringContracts = data.contracts.filter((contract) =>
      contract.expiresAt &&
      daysBetween(todayKey, contract.expiresAt) >= 0 &&
      daysBetween(todayKey, contract.expiresAt) <= 30
    );

    function objectHrefFromTask(task: ServiceTaskItem) {
      if (task.sourceProtocolType === "sales_lead" && task.objectId) {
        return `/sales/${encodeURIComponent(task.objectId)}`;
      }

      const location = locationFromTask(task);
      const objectRef = location?.qrCode || task.objectCode || task.objectId;

      return objectRef
        ? `/locations/${encodeURIComponent(objectRef)}`
        : undefined;
    }

    const severityOrder: Record<ProblemItem["severity"], number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    const problemAttentionItems: AttentionItem[] = data.problems
      .filter((problem) => ["OPEN", "PLANNED", "IN_PROGRESS"].includes(problem.status))
      .sort((first, second) => severityOrder[first.severity] - severityOrder[second.severity])
      .map((problem) => {
        const location = locationsByLookup.get(problem.objectId);
        const objectHref = location?.qrCode
          ? `/locations/${encodeURIComponent(location.qrCode)}`
          : problem.objectId
            ? `/locations/${encodeURIComponent(problem.objectId)}`
            : undefined;
        const protocolHref = problem.protocolId
          ? `/protocols/view/${encodeURIComponent(problem.protocolId)}`
          : undefined;

        return {
          id: `problem-${problem.id}`,
          object: location?.name || problem.objectId || "Обект",
          category: `Проблем · ${problem.status}`,
          description: problem.title,
          date: problem.createdAt ? formatDate(problem.createdAt.slice(0, 10)) : "Без дата",
          severity:
            problem.severity === "CRITICAL"
              ? "critical"
              : problem.severity === "HIGH"
                ? "warning"
                : "attention",
          href: protocolHref || objectHref || "/tasks",
          protocolHref,
          objectHref,
        };
      });

    const legacyDefectAttentionItems: AttentionItem[] = openDefectTasks.map((task) => {
      const protocolHref = protocolHrefFromTask(task);
      const objectHref = objectHrefFromTask(task);

      return {
        id: `legacy-defect-${task.id}`,
        object: task.objectName || task.objectCode || "Обект",
        category: task.sourceProtocolType || "Проблем",
        description: task.title,
        date: task.dueDate
          ? `Срок: ${formatDate(task.dueDate)}`
          : task.sourceProtocolNumber
            ? `Протокол ${task.sourceProtocolNumber}`
            : "Без дата",
        severity: "attention" as const,
        href: protocolHref || objectHref || "/tasks",
        protocolHref: protocolHref || undefined,
        objectHref,
      };
    });

    const attentionItemsByIdentity = new Map<string, AttentionItem>();
    for (const item of legacyDefectAttentionItems) {
      const identity = `${item.object}-${item.category}-${item.description}`;
      attentionItemsByIdentity.set(identity, item);
    }
    for (const item of problemAttentionItems) {
      const identity = `${item.object}-${item.category}-${item.description}`;
      attentionItemsByIdentity.set(identity, item);
    }
    const attentionItems = Array.from(attentionItemsByIdentity.values());
    const dayTasks: DayTask[] = todayTasks.map((task) => ({
      id: task.id,
      due: formatDate(task.dueDate),
      object: task.client && task.client !== task.objectName
        ? `${task.client} - ${task.objectName}`
        : task.objectName,
      type: task.title,
      technician: technicianForTask(task),
      sourceLabel: task.sourceLabel || task.sourceProtocolType || "—",
      href: objectHrefFromTask(task) || "/tasks",
    }));

    const upcomingInspections: UpcomingInspection[] = upcomingTasks
      .map((task) => ({
        date: formatDate(task.dueDate),
        object: task.objectName,
        type: task.title,
        technician: technicianForTask(task) || "не е зададен техник",
        status: "\u043f\u0440\u0435\u0434\u0441\u0442\u043e\u0438" as const,
      }))

    const recentProtocolActivities: Activity[] = data.protocols
      .filter((protocol) => protocol.updatedAt || protocol.date)
      .sort((first, second) =>
        (second.updatedAt || second.date).localeCompare(first.updatedAt || first.date)
      )
      .slice(0, 3)
      .map((protocol) => ({
        action:
          protocol.status === "completed" ? "Завършен протокол" : "Обновен протокол",
        details: `${protocol.objectName || "Обект"} - ${protocol.number}`,
        time: relativeTime(protocol.updatedAt || protocol.date),
        occurredAt: protocol.updatedAt || protocol.date,
        icon: protocol.status === "completed" ? CheckCircle2 : FileText,
      }));
    const recentEquipmentActivities: Activity[] = data.equipment
      .filter((item) => item.updatedAt)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
      .slice(0, 2)
      .map((item) => ({
        action: "Обновено оборудване",
        details: `${item.type} - ${item.name}`,
        time: relativeTime(item.updatedAt),
        occurredAt: item.updatedAt,
        icon: Wrench,
      }));
    const recentProblemActivities: Activity[] = openDefectTasks
      .filter((task) => task.updatedAt || task.dueDate)
      .sort((first, second) =>
        (second.updatedAt || second.dueDate).localeCompare(first.updatedAt || first.dueDate)
      )
      .slice(0, 2)
      .map((task) => ({
        action: "Създаден проблем",
        details: `${task.objectName} - ${task.title}`,
        time: relativeTime(task.updatedAt || task.dueDate),
        occurredAt: task.updatedAt || task.dueDate,
        icon: AlertTriangle,
      }));
    const completedTaskActivities: Activity[] = data.tasks
      .filter(
        (task) =>
          (task.status === "done" ||
            task.status === "resolved" ||
            task.status === "completed") &&
          taskHasActiveDashboardContext(task) &&
          (task.updatedAt || task.dueDate)
      )
      .sort((first, second) =>
        (second.updatedAt || second.dueDate).localeCompare(first.updatedAt || first.dueDate)
      )
      .slice(0, 2)
      .map((task) => ({
        action: "Приключена задача",
        details: `${task.objectName} - ${task.title}`,
        time: relativeTime(task.updatedAt || task.dueDate),
        occurredAt: task.updatedAt || task.dueDate,
        icon: CheckCircle2,
      }));
    const activities = [
      ...recentProtocolActivities,
      ...recentEquipmentActivities,
      ...recentProblemActivities,
      ...completedTaskActivities,
    ]
      .filter((activity) => isRecentActivityDate(activity.occurredAt, todayKey))
      .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt))
      .slice(0, ACTIVITY_LIMIT);

    const technicianSummaries: TechnicianSummary[] = data.technicians.map((technician) => {
      const assignedTodayTasks = todayTasks.filter(
        (task) => technicianForTask(task) === technician.name
      );
      const recentProtocol = data.protocols
        .filter((protocol) => protocol.technician === technician.name)
        .sort((first, second) =>
          (second.updatedAt || second.date).localeCompare(first.updatedAt || first.date)
        )[0];
      const status: TechnicianStatus =
        assignedTodayTasks.length >= 3
          ? "натоварен"
          : assignedTodayTasks.length > 0
            ? "на обект"
            : "свободен";

      return {
        name: technician.name,
        photoUrl: technician.photoUrl,
        todayTasks: assignedTodayTasks.length,
        lastActivity: recentProtocol
          ? `Последно: ${relativeTime(recentProtocol.updatedAt || recentProtocol.date)}`
          : "Няма скорошна активност",
        status,
      };
    });

    const mapObjects = buildMapObjectsData(
      data.locations,
      data.equipment,
      plannedTasks,
      todayKey
    ).mapObjects;
    const stockRiskItems: StockRiskItem[] = data.warehouseItems
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        currentQuantity: totalStock(data.warehouseStock, item.id),
        minimumQuantity: item.minimumQuantity,
        unit: item.unit,
      }))
      .filter(
        (item) =>
          item.minimumQuantity > 0 &&
          item.currentQuantity <= item.minimumQuantity
      )
      .sort(
        (first, second) =>
          first.currentQuantity / first.minimumQuantity -
          second.currentQuantity / second.minimumQuantity
      );
    const attentionCount = attentionItems.length;
    const overdueCount = overdueEquipment.length + overdueTasks.length;
    const kpis: Kpi[] = [
      {
        label: "Проблеми за внимание",
        value: attentionCount ? String(attentionCount) : "0",
        note: attentionCount ? "изискват преглед" : "Няма проблеми",
        tone: attentionCount ? "danger" : "neutral",
        icon: ShieldAlert,
      },
      {
        label: "Проверки тази седмица",
        value: String(upcomingTasks.length),
        note: "следващи 7 дни",
        tone: upcomingTasks.length ? "warning" : "neutral",
        icon: CalendarCheck,
      },
      {
        label: "Просрочени проверки",
        value: String(overdueCount),
        note: overdueCount ? "изисква действие" : "Няма просрочени",
        tone: overdueCount ? "danger" : "neutral",
        icon: ShieldAlert,
      },
      {
        label: "Договори изтичат до 30 дни",
        value: String(expiringContracts.length),
        note: expiringContracts.length ? "следващи 30 дни" : "Няма изтичащи",
        tone: expiringContracts.length ? "warning" : "neutral",
        icon: FileText,
      },
      {
        label: "Складов риск",
        value: String(stockRiskItems.length),
        note: stockRiskItems.length ? "артикули под минимум" : "Наличностите са OK",
        tone: stockRiskItems.length ? "warning" : "neutral",
        icon: PackageOpen,
      },
    ];

    return {
      activities,
      attentionItems,
      dayTasks,
      kpis,
      mapObjects,
      technicianSummaries,
      upcomingInspections,
    };
  }, [data]);

  return (
    <AppShell
      title="Оперативен център"
      description="Оперативен преглед на проверки, проблеми, задачи и екипи"
      showSearch={false}
      headerAction={
        <Button type="button" variant="outline" onClick={refreshDashboard}>
          <RefreshCw className="h-4 w-4" />
          Обнови
        </Button>
      }
    >
      <div className="space-y-6">
        {loadState === "loading" ? (
          <Card className="flex items-center gap-3 p-5 text-sm font-bold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            Зареждане на реалните данни от Supabase...
          </Card>
        ) : null}

        {loadState === "error" ? (
          <Card className="border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
            {errorMessage}
          </Card>
        ) : null}

        <QuickActionsCard />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {derived.kpis.map((kpi) => (
            <KpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,1.05fr)_minmax(420px,1.25fr)_minmax(300px,0.9fr)]">
          <AttentionCard items={derived.attentionItems} />
          <MapOperationsCard
            objects={derived.mapObjects}
            totalObjects={data.locations.length}
          />
          <TodayTasksCard tasks={derived.dayTasks} />
        </section>

        {derived.activities.length ||
        derived.upcomingInspections.length ||
        derived.technicianSummaries.length ? (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {derived.activities.length ? (
              <ActivityCard activities={derived.activities} />
            ) : null}
            {derived.upcomingInspections.length ? (
              <UpcomingCard inspections={derived.upcomingInspections} />
            ) : null}
            {derived.technicianSummaries.length ? (
              <TechniciansCard technicians={derived.technicianSummaries} />
            ) : null}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

