"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileImage,
  FileText,
  FireExtinguisher,
  ImageIcon,
  LampWallUp,
  MapPin,
  Phone,
  ShieldCheck,
  Siren,
  SprayCan,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import {
  companySettingsStorageKey,
  defaultCompanySettings,
  type CompanySettings,
} from "../../../lib/settings";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

type PassportLocation = {
  id: string;
  databaseId: string;
  name: string;
  address: string;
  region: string;
  status: string;
  client: string;
  contact: string;
  phone: string;
  email: string;
  lastCheck: string;
  nextCheck: string;
};

type PassportEquipment = {
  id: string;
  name: string;
  type: string;
  subtype: string;
  location: string;
  status: string;
  nextCheckDate: string;
  notes: string;
  capacity: string;
  description: string;
  totalDevices: string;
  serialNumber: string;
  stickerNumber: string;
  brand: string;
  model: string;
};

type PassportProtocol = {
  id: string;
  number: string;
  type: string;
  date: string;
  status: string;
  technician: string;
  createdAt: string;
};

type PassportTask = {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  dueDate: string;
  assignedTo: string;
};

type PassportMedia = {
  id: string;
  fileUrl: string;
  description: string;
  createdAt: string;
};

type PublicCompany = Pick<CompanySettings, "companyName" | "phone" | "email" | "address">;

type PassportData = {
  location: PassportLocation;
  maintenanceCompany: PublicCompany;
  equipment: PassportEquipment[];
  protocols: PassportProtocol[];
  tasks: PassportTask[];
  media: PassportMedia[];
  documentCount: number;
};

type EquipmentOverviewItem = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
};

type AttentionItem = {
  id: string;
  title: string;
  description: string;
  meta: string;
  status: string;
  tone: "warning" | "danger";
};

const PROTOCOL_TYPE_LABEL: Record<string, string> = {
  subscription: "Абонаментно обслужване",
  extinguisher: "Пожарогасители",
  service: "Протокол за поддръжка на ПИС",
};

const CLOSED_TASK_STATUSES = new Set(["done", "completed", "resolved", "closed"]);

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function isUuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function mapMaintenanceCompany(value: unknown): PublicCompany {
  const settings =
    value && typeof value === "object"
      ? ({ ...defaultCompanySettings, ...(value as Partial<CompanySettings>) } as CompanySettings)
      : defaultCompanySettings;

  return {
    companyName: settings.companyName || defaultCompanySettings.companyName,
    phone: settings.phone || defaultCompanySettings.phone,
    email: settings.email || defaultCompanySettings.email,
    address: settings.address || defaultCompanySettings.address,
  };
}

function formatDateValue(value: string) {
  if (!value) return "";
  if (!value.includes("-")) return value;

  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function displayDate(value: string) {
  return formatDateValue(value) || "Не е зададена";
}

function isBeforeToday(value: string) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function daysUntil(value: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return `просрочено с ${Math.abs(diff)} дни`;
  if (diff === 0) return "днес";
  if (diff === 1) return "утре";
  return `след ${diff} дни`;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase();
}

function isOpenTaskStatus(value: string) {
  const status = normalizeStatus(value);
  return Boolean(status) && !CLOSED_TASK_STATUSES.has(status);
}

function hasProblemStatus(value: string) {
  const status = normalizeStatus(value);
  return [
    "дефект",
    "повред",
    "неизправ",
    "просроч",
    "липсва",
    "бракуван",
    "за обслужване",
    "problem",
    "defect",
    "broken",
    "fault",
    "overdue",
  ].some((term) => status.includes(term));
}

function protocolStatusLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "Завършен";
  if (normalized === "draft") return "Чернова";
  if (normalized === "in_progress" || normalized === "in-progress") return "В процес";
  return status || "Без статус";
}

function protocolTypeLabel(type: string) {
  return PROTOCOL_TYPE_LABEL[type] ?? (type || "Тип не е зададен");
}

function taskStatusLabel(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "open" || normalized === "new") return "Отворена";
  if (normalized === "planned") return "Планирана";
  if (normalized === "pending" || normalized === "active") return "В процес";
  return status || "Отворена";
}

function equipmentTypeText(item: PassportEquipment) {
  return [item.type, item.name].join(" ").toLowerCase();
}

function matchesEquipment(item: PassportEquipment, ...terms: string[]) {
  const text = equipmentTypeText(item);
  return terms.some((term) => text.includes(term));
}

function numericValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function mapLocation(
  location: DataRecord,
  client: DataRecord | null,
  qrCode: string
): PassportLocation {
  return {
    id: qrCode,
    databaseId: textValue(location, ["id"]),
    name: textValue(location, ["name", "object_name", "title"]) || qrCode,
    address: textValue(location, ["address", "full_address"]),
    region: textValue(location, ["region", "area"]),
    status: textValue(location, ["status"]) || "Изряден",
    client: textValue(client, ["name", "organization", "company_name"]),
    contact:
      textValue(client, ["contact_person", "contact", "representative"]) ||
      textValue(location, ["contact", "contact_person", "representative"]),
    phone:
      textValue(client, ["phone", "telephone", "mobile"]) ||
      textValue(location, ["phone", "telephone", "mobile"]),
    email: textValue(client, ["email"]) || "support@firecontrol.bg",
    lastCheck: textValue(location, [
      "last_check",
      "last_check_at",
      "last_service_date",
    ]),
    nextCheck: textValue(location, [
      "next_check",
      "next_check_at",
      "next_service_date",
    ]),
  };
}

function mapEquipment(rows: DataRecord[]): PassportEquipment[] {
  return rows.map((row, index) => ({
    id: textValue(row, ["id"]) || `equipment-${index}`,
    name: textValue(row, ["name"]) || textValue(row, ["type", "equipment_type"]),
    type: textValue(row, ["type", "equipment_type", "category"]),
    subtype: textValue(row, ["subtype"]),
    location: textValue(row, ["location", "object_location", "place", "system_address"]),
    status: textValue(row, ["status"]) || "Изряден",
    nextCheckDate: textValue(row, [
      "next_check_date",
      "next_check",
      "next_check_at",
      "next_service_date",
    ]),
    notes: textValue(row, ["notes", "note"]),
    capacity: textValue(row, ["capacity", "mass", "charge_mass"]),
    description: textValue(row, ["description"]),
    totalDevices: textValue(row, ["total_devices"]),
    serialNumber: textValue(row, ["serial_number", "serial", "identifier", "code"]),
    stickerNumber: textValue(row, ["sticker_number"]),
    brand: textValue(row, ["brand"]),
    model: textValue(row, ["model"]),
  }));
}

function mapProtocols(rows: DataRecord[]): PassportProtocol[] {
  return rows.map((row) => ({
    id: textValue(row, ["id"]),
    number: textValue(row, ["protocol_number", "number"]),
    type: textValue(row, ["protocol_type", "type"]),
    date: textValue(row, ["protocol_date", "date"]),
    status: textValue(row, ["status"]),
    technician: textValue(row, ["technician"]),
    createdAt: textValue(row, ["created_at"]),
  }));
}

function mapTasks(rows: DataRecord[]): PassportTask[] {
  return rows.map((row, index) => ({
    id: textValue(row, ["id"]) || `task-${index}`,
    title: textValue(row, ["title"]) || textValue(row, ["task_type"]) || "Задача",
    description: textValue(row, ["description"]),
    taskType: textValue(row, ["task_type"]),
    status: textValue(row, ["status"]),
    dueDate: textValue(row, ["due_date"]),
    assignedTo: textValue(row, ["assigned_to"]),
  }));
}

function mapMedia(rows: DataRecord[]): PassportMedia[] {
  const supabase = createSupabaseBrowserClient();

  return rows.map((row) => {
    const storagePath = textValue(row, ["storage_path"]);
    const explicitUrl = textValue(row, ["file_url"]);
    const publicUrl = storagePath
      ? supabase.storage.from("protocol-photos").getPublicUrl(storagePath).data.publicUrl
      : "";

    return {
      id: textValue(row, ["id"]),
      fileUrl: explicitUrl || publicUrl,
      description: textValue(row, ["description"]),
      createdAt: textValue(row, ["created_at"]),
    };
  });
}

function getEquipmentOverview(equipment: PassportEquipment[]): EquipmentOverviewItem[] {
  const count = (...terms: string[]) =>
    equipment.filter((item) => matchesEquipment(item, ...terms)).length;
  const sum = (field: keyof PassportEquipment, ...terms: string[]) =>
    equipment
      .filter((item) => matchesEquipment(item, ...terms))
      .reduce((total, item) => total + numericValue(String(item[field] ?? "")), 0);
  const activeExtinguisherCount = equipment.filter(
    (item) =>
      matchesEquipment(item, "пожарогасител", "extinguisher") &&
      !["бракуван", "липсващ", "неактив"].some((status) =>
        item.status.toLowerCase().includes(status)
      )
  ).length;
  const smokeControlCount = equipment
    .filter((item) => matchesEquipment(item, "димоотвеждане", "smoke-control"))
    .reduce(
      (total, item) =>
        total +
        numericValue(item.subtype) +
        numericValue(item.description) +
        numericValue(item.capacity),
      0
    );

  return [
    {
      label: "Пожарогасители",
      value: String(activeExtinguisherCount),
      icon: FireExtinguisher,
      iconClassName: "text-orange-600",
    },
    {
      label: "ПИС точки",
      value: String(
        sum(
          "totalDevices",
          "пожароизвестителна централа",
          "пожароизвестител",
          "fire-alarm-panel",
          "detector"
        )
      ),
      icon: Siren,
      iconClassName: "text-red-600",
    },
    {
      label: "Пожарни кранове",
      value: String(count("пожарен кран", "fire-hydrant")),
      icon: Waves,
      iconClassName: "text-cyan-600",
    },
    {
      label: "Аварийно осветление",
      value: String(count("аварийно осветление", "emergency-lighting")),
      icon: LampWallUp,
      iconClassName: "text-amber-600",
    },
    {
      label: "Спринклери",
      value: String(sum("totalDevices", "спринклерна система", "sprinkler")),
      icon: SprayCan,
      iconClassName: "text-blue-600",
    },
    {
      label: "Димоотвеждане",
      value: String(smokeControlCount),
      icon: Wrench,
      iconClassName: "text-slate-600",
    },
    {
      label: "Евак. планове",
      value: String(count("евакуационен план", "evacuation-plan")),
      icon: ClipboardList,
      iconClassName: "text-emerald-600",
    },
  ];
}

function getAttentionItems(
  location: PassportLocation,
  equipment: PassportEquipment[],
  tasks: PassportTask[]
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const overdueEquipment = equipment.filter((item) => isBeforeToday(item.nextCheckDate));
  const defectiveEquipment = equipment.filter((item) => hasProblemStatus(item.status));
  const openTasks = tasks.filter((task) => isOpenTaskStatus(task.status));

  if (isBeforeToday(location.nextCheck)) {
    items.push({
      id: "location-overdue",
      title: "Просрочена проверка",
      description: "Обектът е след планираната дата за проверка.",
      meta: displayDate(location.nextCheck),
      status: "Просрочено",
      tone: "danger",
    });
  }

  for (const item of overdueEquipment.slice(0, 3)) {
    items.push({
      id: `overdue-${item.id}`,
      title: "Просрочено оборудване",
      description: item.name || item.type,
      meta: [item.location || "Без посочена локация", displayDate(item.nextCheckDate)]
        .filter(Boolean)
        .join(" · "),
      status: "Просрочено",
      tone: "warning",
    });
  }

  for (const item of defectiveEquipment.slice(0, 3)) {
    items.push({
      id: `defective-${item.id}`,
      title: "Дефектирало оборудване",
      description: item.name || item.type,
      meta: [item.location || "Без посочена локация", item.notes].filter(Boolean).join(" · "),
      status: item.status,
      tone: "danger",
    });
  }

  for (const task of openTasks.slice(0, 3)) {
    items.push({
      id: `task-${task.id}`,
      title: task.taskType || "Отворена задача",
      description: task.title,
      meta: [task.dueDate ? displayDate(task.dueDate) : "", task.assignedTo]
        .filter(Boolean)
        .join(" · "),
      status: taskStatusLabel(task.status),
      tone: "warning",
    });
  }

  return items.slice(0, 3);
}

function equipmentIcon(item: PassportEquipment) {
  if (matchesEquipment(item, "пожарогасител", "extinguisher")) return FireExtinguisher;
  if (matchesEquipment(item, "пожароизвестител", "fire-alarm", "detector")) return Siren;
  if (matchesEquipment(item, "пожарен кран", "hydrant")) return Waves;
  if (matchesEquipment(item, "аварийно осветление", "emergency-lighting")) return LampWallUp;
  if (matchesEquipment(item, "спринклер", "sprinkler")) return SprayCan;
  return Wrench;
}

function equipmentDetail(item: PassportEquipment) {
  const parts: string[] = [];

  if (matchesEquipment(item, "пожарогасител", "extinguisher")) {
    if (item.capacity) parts.push(`${item.capacity} kg`);
    if (item.serialNumber) parts.push(`SN ${item.serialNumber}`);
    if (item.stickerNumber) parts.push(`Стикер ${item.stickerNumber}`);
  } else if (matchesEquipment(item, "пожароизвестителна централа", "fire-alarm-panel")) {
    if (item.capacity) parts.push(`${item.capacity} линии`);
    if (item.totalDevices) parts.push(`${item.totalDevices} точки`);
  } else if (matchesEquipment(item, "пожарен кран", "hydrant")) {
    if (item.subtype) parts.push(item.subtype);
    if (item.capacity) parts.push(`Шланг ${item.capacity}`);
  } else if (matchesEquipment(item, "аварийно осветление", "emergency-lighting")) {
    if (item.subtype) parts.push(item.subtype);
  } else if (matchesEquipment(item, "спринклер", "sprinkler")) {
    if (item.totalDevices) parts.push(`${item.totalDevices} спринклера`);
  } else if (matchesEquipment(item, "димоотвеждане", "smoke-control")) {
    if (item.subtype) parts.push(`${item.subtype} люка`);
    if (item.description) parts.push(`${item.description} клапи`);
    if (item.capacity) parts.push(`${item.capacity} вентилатора`);
  } else if (matchesEquipment(item, "евакуационен план", "evacuation-plan")) {
    if (item.subtype) parts.push(item.subtype);
  }

  if (!parts.length) {
    parts.push(...[item.brand, item.model, item.serialNumber].filter(Boolean));
  }

  return parts.join(" · ");
}

function groupEquipmentByLocation(equipment: PassportEquipment[]) {
  const groups = new Map<string, PassportEquipment[]>();

  for (const item of equipment) {
    const key = item.location || "Без посочена локация";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "bg"));
}

function objectStatusLabel(attentionCount: number, nextCheck: string, fallback: string) {
  if (isBeforeToday(nextCheck)) return "Просрочен";
  if (attentionCount > 0) return "Има проблеми";
  return fallback || "Изряден";
}

function statusBadgeVariant(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized.includes("просроч") || normalized.includes("проблем")) return "warning";
  return "success";
}

function AccessHeader() {
  const accessTime = new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return (
    <header className="bg-slate-950 px-4 py-4 text-white sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div>
          <div className="text-xl font-black tracking-tight">
            FireControl <span className="text-orange-400">Pass</span>
          </div>
          <div className="mt-1 text-xs font-black uppercase text-slate-400">
            Вътрешен паспорт на обект
          </div>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-200">
            <CheckCircle2 size={14} />
            Достъп разрешен
          </div>
          <div className="mt-1 text-xs font-bold text-slate-400" suppressHydrationWarning>
            {accessTime}
          </div>
        </div>
      </div>
    </header>
  );
}

function DesktopRail({
  location,
  attentionCount,
}: {
  location: PassportLocation;
  attentionCount: number;
}) {
  return (
    <aside className="hidden bg-slate-950 text-white lg:flex lg:min-h-screen lg:flex-col">
      <div className="px-6 py-7">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/20 bg-white/5">
          <ShieldCheck size={34} className="text-white" />
        </div>
        <div className="mt-5 text-xl font-black tracking-tight">
          FIRECONTROL PASS
        </div>
        <div className="mt-1 text-xs font-black uppercase text-slate-400">
          Инструмент на техника
        </div>
      </div>

      <nav className="space-y-1 px-3">
        {[
          ["Обект", MapPin],
          ["Действия", AlertTriangle],
          ["Системи", Wrench],
          ["Документи", FileText],
        ].map(([label, Icon], index) => {
          const NavIcon = Icon as LucideIcon;
          return (
            <div
              key={label as string}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-black ${
                index === 0
                  ? "bg-white/12 text-white"
                  : "text-slate-300"
              }`}
            >
              <NavIcon size={18} />
              {label as string}
              {label === "Действия" && attentionCount > 0 ? (
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                  {attentionCount}
                </span>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 p-4">
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-xs font-black uppercase text-slate-400">
            Обект
          </div>
          <div className="mt-2 line-clamp-2 text-sm font-black">
            {location.name}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300">
            <CheckCircle2 size={14} />
            Синхронизирано
          </div>
        </div>
      </div>
    </aside>
  );
}

function ServiceMetricCard({ item }: { item: EquipmentOverviewItem }) {
  const Icon = item.icon;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
        <Icon size={16} className={item.iconClassName} />
      </div>
      <div className="min-w-0">
        <div className="text-base font-black leading-none text-slate-950">{item.value}</div>
        <div className="mt-1 truncate text-[11px] font-black uppercase text-slate-400">
          {item.label}
        </div>
      </div>
    </div>
  );
}

function PublicPassport({ data }: { data: PassportData }) {
  const { location, maintenanceCompany } = data;
  const publicPhone = maintenanceCompany.phone || location.phone;

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <Card className="p-6">
          <div className="text-2xl font-black tracking-tight text-slate-900">
            FIRE<span className="text-orange-500">Control</span>
          </div>
          <div className="mt-8">
            <Badge variant="success">
              <ShieldCheck size={14} />
              Активна поддръжка
            </Badge>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
              {location.name}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Този QR код потвърждава, че обектът има дигитален паспорт.
              Вътрешната сервизна информация се вижда само при сканиране през ERP системата.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-black">Базови данни</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">Обект</div>
              <div className="mt-1 text-base font-black text-slate-900">
                {location.name}
              </div>
              {location.address ? (
                <div className="mt-1 text-sm font-bold text-slate-500">
                  {location.address}
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">
                Поддържаща фирма
              </div>
              <div className="mt-1 text-base font-black text-slate-900">
                {maintenanceCompany.companyName}
              </div>
              {maintenanceCompany.address ? (
                <div className="mt-1 text-sm font-bold text-slate-500">
                  {maintenanceCompany.address}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-black">Контакт при нужда</h2>
          <a
            href={publicPhone ? `tel:${publicPhone}` : undefined}
            className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-4 transition hover:bg-orange-50"
          >
            <Phone className="text-orange-500" size={18} />
            <span className="font-bold text-slate-800">
              {publicPhone || "Не е зададен телефон"}
            </span>
          </a>
          {maintenanceCompany.email ? (
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
              {maintenanceCompany.email}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}

function InternalPassport({ data }: { data: PassportData }) {
  const { location, equipment, protocols, tasks, media, documentCount } = data;
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [showAllProtocols, setShowAllProtocols] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const equipmentOverview = useMemo(() => getEquipmentOverview(equipment), [equipment]);
  const attentionItems = useMemo(
    () => getAttentionItems(location, equipment, tasks),
    [equipment, location, tasks]
  );
  const openTasks = useMemo(
    () => tasks.filter((task) => isOpenTaskStatus(task.status)),
    [tasks]
  );
  const groupedEquipment = useMemo(() => groupEquipmentByLocation(equipment), [equipment]);
  const visibleEquipmentGroups = showAllLocations
    ? groupedEquipment
    : groupedEquipment.slice(0, 5);
  const visibleProtocols = showAllProtocols ? protocols : protocols.slice(0, 3);
  const visibleActions = showAllActions ? openTasks : openTasks.slice(0, 3);
  const newProtocolHref = `/protocols/new?object=${encodeURIComponent(location.id)}`;
  const profileHref = `/locations/${encodeURIComponent(location.id)}`;
  const objectStatus = objectStatusLabel(
    attentionItems.length,
    location.nextCheck,
    location.status
  );
  const heroImage = media.find((item) => item.fileUrl)?.fileUrl;
  const nextAction = openTasks[0];
  const problemEquipment = equipment.filter(
    (item) => hasProblemStatus(item.status) || isBeforeToday(item.nextCheckDate)
  );
  const focusLocations = Array.from(
    new Set(
      [
        ...problemEquipment.map((item) => item.location || "Без посочена локация"),
        ...(nextAction ? [nextAction.description] : []),
      ].filter(Boolean)
    )
  ).slice(0, 3);
  const todayTitle = attentionItems.length
    ? "Провери проблемите първо"
    : nextAction
      ? nextAction.title
      : "Започни нов протокол";
  const todayDetail = attentionItems.length
    ? `${attentionItems.length} активни сигнала изискват проверка на място.`
    : nextAction
      ? [
          nextAction.taskType || taskStatusLabel(nextAction.status),
          nextAction.dueDate ? daysUntil(nextAction.dueDate) : "",
          nextAction.assignedTo,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Няма активни проблеми или задачи. Отвори нов протокол за текущата проверка.";

  return (
    <main className="min-h-screen bg-[#eef2f6] text-slate-900">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[230px_1fr]">
        <DesktopRail location={location} attentionCount={attentionItems.length} />
        <div className="min-w-0 pb-28 md:pb-10">
          <div className="lg:hidden">
            <AccessHeader />
          </div>

          <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-3 sm:px-6">
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <Card className="border-l-4 border-l-orange-500 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase text-orange-600">
                  Какво трябва да направя тук днес?
                </div>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  {todayTitle}
                </h1>
                <p className="mt-2 text-sm font-bold leading-5 text-slate-600">
                  {todayDetail}
                </p>
              </div>
              <Badge variant={statusBadgeVariant(objectStatus)}>
                {attentionItems.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                {objectStatus}
              </Badge>
            </div>
            {focusLocations.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {focusLocations.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-800"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Link
                href={newProtocolHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-4 text-sm font-black text-white shadow-sm transition hover:shadow-md"
              >
                <FileText size={17} />
                Нов протокол
              </Link>
              <a
                href={location.phone ? `tel:${location.phone}` : undefined}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-orange-50 hover:text-orange-700"
              >
                <Phone size={17} />
                Обади се
              </a>
              <Link
                href={profileHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-orange-50 hover:text-orange-700"
              >
                <ExternalLink size={17} />
                Пълен профил
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden p-0 shadow-sm">
            <div className="flex gap-3 p-4">
              {heroImage ? (
                <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-200 sm:block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroImage}
                    alt={location.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-black text-slate-950">{location.name}</div>
                <div className="mt-2 flex items-start gap-2 text-sm font-bold text-slate-500">
                  <MapPin size={16} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{location.address || "Адресът не е зададен"}</span>
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="text-xs font-black uppercase text-slate-400">Контакт</div>
                  <div className="mt-1 font-black text-slate-900">
                    {location.contact || "Контакт не е зададен"}
                  </div>
                  <a
                    href={location.phone ? `tel:${location.phone}` : undefined}
                    className="mt-1 inline-flex items-center gap-2 text-sm font-black text-orange-700"
                  >
                    <Phone size={15} />
                    {location.phone || "Телефон не е зададен"}
                  </a>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <AlertTriangle className="text-orange-500" size={20} />
              Изисква внимание
            </h2>
            <div className="mt-4 space-y-3">
              {attentionItems.length === 0 ? (
                <div className="inline-flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
                  <CheckCircle2 size={20} />
                  Няма активни проблеми
                </div>
              ) : (
                attentionItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 ${
                      item.tone === "danger"
                        ? "border-red-100 bg-red-50 text-red-900"
                        : "border-orange-100 bg-orange-50 text-orange-900"
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-black">{item.title}</div>
                        <div className="mt-1 font-black">{item.description}</div>
                        {item.meta ? (
                          <div className="mt-1 text-sm font-bold opacity-75">{item.meta}</div>
                        ) : null}
                      </div>
                      <Badge variant={item.tone === "danger" ? "warning" : "neutral"}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-black">Проверки</h2>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-black uppercase text-slate-400">
                  Последна проверка
                </div>
                <div className="mt-2 text-lg font-black text-slate-900">
                  {displayDate(location.lastCheck)}
                </div>
              </div>
              <div
                className={`rounded-2xl p-4 ${
                  isBeforeToday(location.nextCheck)
                    ? "bg-orange-50 text-orange-900"
                    : "bg-slate-50 text-slate-900"
                }`}
              >
                <div className="text-xs font-black uppercase opacity-70">
                  Следваща проверка
                </div>
                <div className="mt-2 text-lg font-black">
                  {displayDate(location.nextCheck)}
                </div>
              </div>
            </div>
          </Card>
        </section>

        {openTasks.length > 0 ? (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Предстоящи действия</h2>
              {openTasks.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAllActions((current) => !current)}
                  className="text-sm font-black text-orange-600 transition hover:text-orange-700"
                >
                  {showAllActions ? "Покажи по-малко" : "Виж всички"}
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {visibleActions.map((task) => (
                <div key={task.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    {task.dueDate ? displayDate(task.dueDate) : "Без дата"}
                  </div>
                  <div className="mt-2 font-black text-slate-900">{task.title}</div>
                  <div className="mt-1 text-sm font-bold text-slate-500">
                    {task.taskType || taskStatusLabel(task.status)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                    {task.dueDate ? (
                      <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                        {daysUntil(task.dueDate)}
                      </span>
                    ) : null}
                    {task.assignedTo ? (
                      <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                        {task.assignedTo}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">Системи на обекта</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Бърз обхват преди обхода по локации.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {equipmentOverview.map((item) => (
                <ServiceMetricCard key={item.label} item={item} />
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <Wrench className="text-orange-500" size={20} />
              Оборудване по локации
            </h2>
            <Badge variant="neutral">{equipment.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {visibleEquipmentGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Няма въведено оборудване за този обект.
              </div>
            ) : (
              visibleEquipmentGroups.map(([groupName, items]) => (
                <div key={groupName} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-slate-950">{groupName}</div>
                    <Badge variant="neutral">{items.length}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {items.map((item) => {
                      const Icon = equipmentIcon(item);
                      const detail = equipmentDetail(item);

                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-orange-600">
                            <Icon size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-slate-900">
                              {item.name || item.type}
                            </div>
                            {detail ? (
                              <div className="mt-1 text-sm font-bold text-slate-500">
                                {detail}
                              </div>
                            ) : null}
                          </div>
                          <Badge
                            variant={
                              hasProblemStatus(item.status) || isBeforeToday(item.nextCheckDate)
                                ? "warning"
                                : "success"
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          {groupedEquipment.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllLocations((current) => !current)}
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              {showAllLocations ? "Покажи по-малко" : "Виж всички локации"}
              <ArrowRight size={15} />
            </button>
          ) : null}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <ClipboardList className="text-orange-500" size={20} />
              Последни протоколи
            </h2>
            {protocols.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllProtocols((current) => !current)}
                className="text-sm font-black text-orange-600 transition hover:text-orange-700"
              >
                {showAllProtocols ? "Покажи по-малко" : "Виж всички протоколи"}
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {visibleProtocols.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Няма записани протоколи за този обект.
              </div>
            ) : (
              visibleProtocols.map((protocol) => (
                <ProtocolRow key={protocol.id || protocol.number} protocol={protocol} />
              ))
            )}
          </div>
        </Card>

        {media.length > 0 || documentCount > 0 ? (
          <Card className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black">
                  <ImageIcon className="text-orange-500" size={20} />
                  Документи и медия
                </h2>
                <div className="mt-2 flex flex-wrap gap-2 text-sm font-black text-slate-500">
                  <span>{media.length} снимки</span>
                  <span>{documentCount} документи</span>
                </div>
              </div>
              <Link
                href={profileHref}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                <FileImage size={17} />
                Отвори
              </Link>
            </div>
          </Card>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
        <div className="grid grid-cols-2 gap-2">
          <a
            href={location.phone ? `tel:${location.phone}` : undefined}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
          >
            <Phone size={17} />
            Обади се
          </a>
          <Link
            href={profileHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
          >
            <ExternalLink size={17} />
            Профил
          </Link>
          <Link
            href={newProtocolHref}
            className="col-span-2 inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-500 to-orange-400 px-5 py-3 text-base font-black text-white shadow-lg shadow-orange-500/25"
          >
            <FileText size={20} />
            Нов протокол
          </Link>
        </div>
      </div>
        </div>
      </div>
    </main>
  );
}

function ProtocolRow({ protocol }: { protocol: PassportProtocol }) {
  return (
    <Link
      href={`/protocols/view/${encodeURIComponent(protocol.number)}`}
      className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-orange-50"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-black text-slate-900">
            <FileText size={17} />
            {protocol.number || "Протокол"}
          </div>
          <div className="mt-1 text-sm font-bold text-slate-500">
            {protocolTypeLabel(protocol.type)} ·{" "}
            {formatDateValue(protocol.createdAt || protocol.date)}
            {protocol.technician ? ` · ${protocol.technician}` : ""}
          </div>
        </div>
        <Badge variant={protocol.status === "completed" ? "success" : "neutral"}>
          {protocolStatusLabel(protocol.status)}
        </Badge>
      </div>
    </Link>
  );
}

export default function QrPassportPage() {
  const params = useParams<{ code?: string | string[] }>();
  const searchParams = useSearchParams();
  const routeCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const internalMode = searchParams.get("mode") === "erp";
  const [data, setData] = useState<PassportData | null>(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "not-found" | "error"
  >("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadPassport() {
      if (!routeCode) {
        setLoadState("not-found");
        return;
      }

      setLoadState("loading");

      try {
        const supabase = createSupabaseBrowserClient();
        let { data: locationRow, error: locationError } = await supabase
          .from("locations")
          .select("*")
          .eq("qr_code", routeCode)
          .maybeSingle();

        if (!locationRow && !locationError && isUuidValue(routeCode)) {
          const fallbackResult = await supabase
            .from("locations")
            .select("*")
            .eq("id", routeCode)
            .maybeSingle();

          locationRow = fallbackResult.data;
          locationError = fallbackResult.error;
        }

        if (!isMounted) return;

        if (locationError) {
          setLoadState("error");
          return;
        }

        if (!locationRow) {
          setLoadState("not-found");
          return;
        }

        const locationRecord = locationRow as DataRecord;
        const clientId = textValue(locationRecord, ["client_id"]);
        const locationId = textValue(locationRecord, ["id"]);
        const resolvedQrCode = textValue(locationRecord, ["qr_code", "code"]) || routeCode;
        const locationName = textValue(locationRecord, ["name", "object_name", "title"]);
        let clientRecord: DataRecord | null = null;
        let maintenanceCompany = mapMaintenanceCompany(null);

        if (clientId) {
          const { data: clientRow, error: clientError } = await supabase
            .from("clients")
            .select("*")
            .eq("id", clientId)
            .maybeSingle();

          if (!isMounted) return;

          if (clientError) {
            setLoadState("error");
            return;
          }

          clientRecord = (clientRow as DataRecord | null) ?? null;
        }

        const { data: companySettingsRow } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", companySettingsStorageKey)
          .maybeSingle();

        if (!isMounted) return;

        maintenanceCompany = mapMaintenanceCompany(
          (companySettingsRow as { value?: unknown } | null)?.value
        );

        const objectIds = [locationId, resolvedQrCode, routeCode].filter(Boolean);
        const [
          equipmentResult,
          protocolsByLocation,
          protocolsByQr,
          tasksByLocation,
          tasksByQr,
          mediaResult,
          documentsResult,
        ] = await Promise.all([
          supabase
            .from("equipment")
            .select("*")
            .eq("location_id", locationId)
            .limit(200),
          supabase
            .from("protocols")
            .select(
              "id, protocol_number, number, protocol_type, type, protocol_date, date, status, technician, created_at"
            )
            .eq("location_id", locationId)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("protocols")
            .select(
              "id, protocol_number, number, protocol_type, type, protocol_date, date, status, technician, created_at"
            )
            .eq("object_code", resolvedQrCode)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("service_tasks")
            .select("id,title,description,task_type,status,due_date,assigned_to,object_id")
            .eq("object_id", locationId)
            .order("due_date", { ascending: true })
            .limit(50),
          supabase
            .from("service_tasks")
            .select("id,title,description,task_type,status,due_date,assigned_to,object_id")
            .eq("object_id", resolvedQrCode)
            .order("due_date", { ascending: true })
            .limit(50),
          objectIds.length
            ? supabase
                .from("protocol_photos")
                .select("id,file_url,storage_path,description,created_at,object_id")
                .in("object_id", objectIds)
                .order("created_at", { ascending: false })
                .limit(20)
            : Promise.resolve({ data: [], error: null }),
          locationName
            ? supabase
                .from("saved_documents")
                .select("id,object")
                .eq("object", locationName)
                .limit(50)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!isMounted) return;

        if (equipmentResult.error) {
          setLoadState("error");
          return;
        }

        const protocolRows = new Map<string, DataRecord>();
        const taskRows = new Map<string, DataRecord>();

        for (const row of [
          ...((protocolsByLocation.data as DataRecord[]) ?? []),
          ...((protocolsByQr.data as DataRecord[]) ?? []),
        ]) {
          const id = textValue(row, ["id"]) || textValue(row, ["protocol_number", "number"]);
          if (id) protocolRows.set(id, row);
        }

        for (const row of [
          ...((tasksByLocation.data as DataRecord[]) ?? []),
          ...((tasksByQr.data as DataRecord[]) ?? []),
        ]) {
          const id = textValue(row, ["id"]);
          if (id) taskRows.set(id, row);
        }

        const sortedProtocolRows = Array.from(protocolRows.values()).sort((a, b) =>
          String(b["created_at"] ?? b["protocol_date"] ?? b["date"] ?? "").localeCompare(
            String(a["created_at"] ?? a["protocol_date"] ?? a["date"] ?? "")
          )
        );
        const sortedTaskRows = Array.from(taskRows.values()).sort((a, b) =>
          String(a["due_date"] ?? "").localeCompare(String(b["due_date"] ?? ""))
        );

        setData({
          location: mapLocation(locationRecord, clientRecord, resolvedQrCode),
          maintenanceCompany,
          equipment: mapEquipment((equipmentResult.data as DataRecord[]) ?? []),
          protocols: mapProtocols(sortedProtocolRows),
          tasks: mapTasks(sortedTaskRows),
          media: mapMedia((mediaResult.data as DataRecord[]) ?? []),
          documentCount: ((documentsResult.data as DataRecord[]) ?? []).length,
        });
        setLoadState("ready");
      } catch {
        if (isMounted) {
          setLoadState("error");
        }
      }
    }

    loadPassport();

    return () => {
      isMounted = false;
    };
  }, [routeCode]);

  if (loadState === "loading") {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-8 text-center text-sm font-bold text-slate-500">
            Зареждане...
          </Card>
        </div>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-8 text-center text-sm font-bold text-red-600">
            Грешка при зареждане на паспорта.
          </Card>
        </div>
      </main>
    );
  }

  if (loadState === "not-found" || !data) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-4 py-5 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-xl">
          <Card className="p-8 text-center text-sm font-bold text-slate-500">
            Обектът не е намерен.
          </Card>
        </div>
      </main>
    );
  }

  return internalMode ? <InternalPassport data={data} /> : <PublicPassport data={data} />;
}
