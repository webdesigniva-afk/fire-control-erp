"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardPlus,
  Edit3,
  Eye,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Printer,
  QrCode,
  Save,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { PageHeader } from "../../../components/ui/page-header";
import { QrScannerButton } from "../../../components/qr-scanner";
import { TabButton, Tabs } from "../../../components/ui/tabs";
import { generateQRCode } from "../../../lib/qr";
import { geocodeAddress } from "../../../lib/geocoding";
import {
  deleteProtocolPhoto,
  protocolPhotosBucket,
  readProtocolPhotosForObject,
  type ProtocolPhotoRecord,
} from "../../../lib/protocol-photos";
import { readDeletedProtocolNumbers } from "../../../lib/protocols-delete";
import {
  defaultProtocolSettings,
  readProtocolSettings,
  readProtocolSettingsFromSupabase,
  settingsUpdatedEvent,
  type ProtocolSettings,
  writeProtocolSettingsToSupabase,
} from "../../../lib/settings";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { resolveDefectTask } from "../../../lib/tasks";

type LocationProfile = {
  id: string;
  databaseId: string;
  clientId: string;
  qrCode: string;
  objectType: string;
  name: string;
  address: string;
  region: string;
  client: string;
  contact: string;
  phone: string;
  qrUrl: string;
};

type EquipmentItem = {
  id: string;
  name: string;
  type: string;
  subtype: string;
  category: string;
  extinguisherCategory: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  brand: string;
  model: string;
  serialNumber: string;
  installationDate: string;
  systemAddress: string;
  systemType: string;
  totalDevices: string;
  pumpGroup: string;
  pumpStationLocation: string;
  capacity: string;
  description: string;
  location: string;
  lastCheckDate: string;
  nextCheckDate: string;
  stickerNumber: string;
  stickerGeneratedAt: string;
  stickerPrintedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type FireExtinguisherServiceHistoryItem = {
  id: string;
  equipmentId: string;
  objectId: string;
  protocolId: string;
  protocolNumber: string;
  stickerNumber: string;
  serviceType: string;
  serviceDate: string;
  nextServiceDate: string;
  technician: string;
  createdAt: string;
};

type LocationEditFormState = {
  clientId: string;
  objectType: string;
  name: string;
  address: string;
  region: string;
  qrCode: string;
};

type ClientOption = {
  id: string;
  name: string;
};

type ConfirmationDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  content?: ReactNode;
  onConfirm: () => Promise<void> | void;
} | null;

type DbProtocol = {
  id: string;
  protocolNumber: string;
  protocolType: string;
  protocolDate: string;
  status: string;
  objectCode: string;
  clientName: string;
  objectName: string;
  technician: string;
  createdAt: string;
};

type LocationContractDocument = {
  id: string;
  number: string;
  title: string;
  client: string;
  object: string;
  href: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type UpcomingObjectActionSource =
  | "subscription_protocol"
  | "service_protocol"
  | "extinguisher_service"
  | "contract_expiration"
  | "equipment_inspection"
  | "defect";

type UpcomingObjectAction = {
  id: string;
  title: string;
  description: string;
  taskType: string;
  activities: { title: string; description: string; recurrenceMonths: number }[];
  objectId: string;
  dueDate: string;
  status: string;
  sourceProtocolId: string;
  sourceLabel: string;
  sourceProtocolNumber: string;
  sourceProtocolRow: string;
  sourceProtocolType: string;
  recurrenceMonths?: number;
  relatedProblemId?: string;
  resolutionType?: string;
  resolutionNote?: string;
  resolutionDate?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  source: UpcomingObjectActionSource;
  createdAt: string;
  assignee: string;
};

const PROTOCOL_TYPE_LABEL: Record<string, string> = {
  subscription: "Абонаментно обслужване",
  extinguisher: "Пожарогасители",
  service: "Протокол за поддръжка на ПИС",
};

// localStorage key shared with the protocol form
const PROTOCOLS_LS_KEY = "firecontrol:protocols";

// Maps full Bulgarian type labels (stored in localStorage) to DB short keys
const PROTOCOL_TYPE_FROM_LABEL: Record<string, string> = {
  "Абонаментно обслужване / профилактичен преглед": "subscription",
  "Пожарогасители": "extinguisher",
  "Протокол за поддръжка на ПИС": "service",
  "Сервизен протокол": "service",
};

function isUuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

type LocationProfileContextValue = {
  location: LocationProfile;
  equipment: EquipmentItem[];
  setEquipment: Dispatch<SetStateAction<EquipmentItem[]>>;
  protocols: DbProtocol[];
  protocolsLoadState: "loading" | "ready" | "error";
  refreshProtocols: () => void;
  upcomingActions: UpcomingObjectAction[];
  upcomingActionsLoadState: "loading" | "ready" | "error";
  completeUpcomingAction: (action: UpcomingObjectAction) => Promise<void>;
};

const emptyLocation: LocationProfile = {
  id: "",
  databaseId: "",
  clientId: "",
  qrCode: "",
  objectType: "",
  name: "",
  address: "",
  region: "",
  client: "",
  contact: "",
  phone: "",
  qrUrl: "/qr/",
};

const LocationProfileContext = createContext<LocationProfileContextValue>({
  location: emptyLocation,
  equipment: [],
  setEquipment: () => undefined,
  protocols: [],
  protocolsLoadState: "loading",
  refreshProtocols: () => undefined,
  upcomingActions: [],
  upcomingActionsLoadState: "loading",
  completeUpcomingAction: async () => undefined,
});

function useLocationProfile() {
  return useContext(LocationProfileContext).location;
}

function useLocationEquipment() {
  return useContext(LocationProfileContext).equipment;
}

function useLocationEquipmentSetter() {
  return useContext(LocationProfileContext).setEquipment;
}

function useLocationProtocols() {
  const ctx = useContext(LocationProfileContext);
  return { protocols: ctx.protocols, protocolsLoadState: ctx.protocolsLoadState, refreshProtocols: ctx.refreshProtocols };
}

function useLocationUpcomingActions() {
  const ctx = useContext(LocationProfileContext);
  return {
    upcomingActions: ctx.upcomingActions,
    upcomingActionsLoadState: ctx.upcomingActionsLoadState,
    completeUpcomingAction: ctx.completeUpcomingAction,
  };
}

const tabs = ["Общо", "Оборудване", "Протоколи", "Задачи", "Договори", "Медия"];

const equipmentTypeOptions = [
  "Пожарогасител",
  "Пожароизвестител",
  "Пожароизвестителна централа",
  "Пожарен кран",
  "Спринклерна система",
  "Аварийно осветление",
  "Димоотвеждане",
  "Евакуационен план",
  "Друго",
];

const equipmentSubtypeOptions: Record<string, string[]> = {
  Пожарогасител: ["ABC", "CO₂", "Воден", "Пяна"],
  Пожароизвестител: ["Димен", "Топлинен", "Комбиниран"],
};

const equipmentCategoryByType: Record<string, string> = {
  Пожарогасител: "extinguisher",
  Пожароизвестител: "detector",
  "Пожароизвестителна централа": "fire-alarm-panel",
  "Пожарен кран": "fire-hydrant",
  "Спринклерна система": "sprinkler",
  "Аварийно осветление": "emergency-lighting",
  Димоотвеждане: "smoke-control",
  "Евакуационен план": "evacuation-plan",
  Друго: "other",
};

type DataRecord = Record<string, unknown>;

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

function formatDateValue(value: string) {
  if (!value) return "";

  if (!value.includes("-")) return value;

  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function addYearsToDateValue(value: string, years: number) {
  if (!value || !value.includes("-")) return "";

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";

  date.setFullYear(date.getFullYear() + years);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function inputDateValue(value: string) {
  if (!value) return "";
  if (value.includes("-")) return value.slice(0, 10);

  const [day, month, year] = value.split(".");
  return day && month && year ? `${year}-${month}-${day}` : "";
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
    ...(settings.objectTypes?.length
      ? settings.objectTypes
      : defaultProtocolSettings.objectTypes),
    selectedValue,
  ]).filter((value) => value !== "Друг" || selectedValue === "Друг");
}

const ADD_OBJECT_TYPE_VALUE = "__add_object_type__";

function formatStoredProtocolDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function formatDateTimeValue(value: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatDateValue(value) || value;
  }

  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTaskCreatedDate(value: string) {
  if (!value) return "—";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return formatDateTimeValue(new Date(numeric).toISOString());
  }

  return formatDateTimeValue(value);
}

function taskStatusLabel(status: string) {
  if (status === "open") return "Изисква действие";
  if (status === "completed") return "Готово";
  return status === "done" ? "Завършена" : "Предстои";
}

function taskActivities(value: unknown, fallbackTitle: string) {
  if (!Array.isArray(value)) {
    return fallbackTitle
      ? [{ title: fallbackTitle, description: fallbackTitle, recurrenceMonths: 0 }]
      : [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as DataRecord;
      const title = textValue(record, ["title"]);
      const description = textValue(record, ["description"]) || title;
      const recurrenceMonths = Number(record["recurrenceMonths"] ?? 0) || 0;

      return title ? { title, description, recurrenceMonths } : null;
    })
    .filter(
      (item): item is {
        title: string;
        description: string;
        recurrenceMonths: number;
      } => item !== null
    );
}

function plannedVisitTypeLabel(action: UpcomingObjectAction) {
  const activityTitles = Array.from(
    new Set(
      action.activities
        .map((activity) => activity.title.trim())
        .filter(Boolean)
    )
  );

  if (activityTitles.length > 1) {
    return activityTitles.join("; ");
  }

  const recurrenceMonths =
    action.activities.find((activity) => activity.recurrenceMonths > 0)
      ?.recurrenceMonths || 0;

  if (recurrenceMonths === 1) return "ежемесечно планирано посещение";
  if (recurrenceMonths === 3) return "планирано посещение на три месеца";
  if (recurrenceMonths === 12) return "годишно планирано посещение";

  const activityTitle = action.activities[0]?.title?.trim();
  if (activityTitle && action.taskType === "Планирано посещение") {
    return activityTitle;
  }

  return action.taskType || action.title;
}

function isFireExtinguisherAction(action: UpcomingObjectAction) {
  const haystack = [
    action.source,
    action.sourceProtocolType,
    action.sourceLabel,
    action.title,
    action.taskType,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes("extinguisher") || haystack.includes("пожарогас");
}

function fireExtinguisherActionName(action: UpcomingObjectAction) {
  return (
    action.title
      .replace(/^пожарогасител\s*[:\-–]?\s*/i, "")
      .replace(/^техническо обслужване\s*[:\-–]?\s*/i, "")
      .replace(/^на\s+пожарогасител\s*/i, "")
      .trim() || action.title
  );
}

function cleanFireExtinguisherName(value: string) {
  const cleaned = value
    .replace(/^техническо обслужване\s*[:\-–]?\s*/i, "")
    .replace(/^на\s+пожарогасител\s*/i, "")
    .replace(/^пожарогасител\s*[:\-–]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || value.trim();
}

function fireExtinguisherEquipmentLabel(
  action: UpcomingObjectAction,
  equipmentItem?: EquipmentItem
) {
  if (equipmentItem) {
    const parts = [
      equipmentItem.extinguisherCategory || equipmentItem.subtype || equipmentItem.category,
      equipmentItem.capacity,
      equipmentItem.brand,
      equipmentItem.model,
      equipmentItem.serialNumber ? `SN ${equipmentItem.serialNumber}` : "",
    ].filter(Boolean);

    return cleanFireExtinguisherName(
      parts.join(" ") || equipmentItem.name || fireExtinguisherActionName(action)
    );
  }

  return cleanFireExtinguisherName(fireExtinguisherActionName(action));
}

function visitDisplayTitle(action: UpcomingObjectAction) {
  if (isFireExtinguisherAction(action)) {
    return `Пожарогасител: ${fireExtinguisherActionName(action)}`;
  }

  const recurrenceMonths = actionRecurrenceMonths(action);
  if (recurrenceMonths === 1) return "Месечна проверка ПГИ";
  if (recurrenceMonths === 3) return "Проверка на 3 месеца ПГИ";
  if (recurrenceMonths === 12) return "Годишна проверка ПГИ";

  return actionDisplayTitle(action);
}

function daysUntilDate(value: string) {
  if (!value) return null;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;

  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function dateProximityLabel(value: string) {
  const days = daysUntilDate(value);
  if (days === null) return { label: "Без дата", variant: "neutral" as const };
  if (days < 0) return { label: "Просрочено", variant: "danger" as const };
  if (days === 0) return { label: "Днес", variant: "warning" as const };
  if (days > 30) return { label: `след ${days} дни`, variant: "success" as const };
  if (days > 7) return { label: `след ${days} дни`, variant: "warning" as const };
  return { label: `след ${days} дни`, variant: "danger" as const };
}

function findFireExtinguisherEquipment(
  action: UpcomingObjectAction,
  equipment: EquipmentItem[]
) {
  const sourceRow = action.sourceProtocolRow.trim();
  if (sourceRow) {
    const byId = equipment.find((item) => item.id === sourceRow);
    if (byId) return byId;
  }

  const actionName = cleanFireExtinguisherName(fireExtinguisherActionName(action))
    .toLowerCase();

  return equipment.find((item) => {
    const itemName = cleanFireExtinguisherName(item.name).toLowerCase();
    return itemName && (actionName.includes(itemName) || itemName.includes(actionName));
  });
}

type UpcomingVisitRenderItem =
  | {
      kind: "action";
      id: string;
      action: UpcomingObjectAction;
    }
  | {
      kind: "fireExtinguisherGroup";
      id: string;
      actions: UpcomingObjectAction[];
      dueDate: string;
      sourceLabel: string;
      sourceProtocolNumber: string;
      items: {
        action: UpcomingObjectAction;
        equipmentItem?: EquipmentItem;
        label: string;
        stickerNumber: string;
        location: string;
      }[];
    };

function buildUpcomingVisitRenderItems(
  actions: UpcomingObjectAction[],
  equipment: EquipmentItem[]
): UpcomingVisitRenderItem[] {
  const items: UpcomingVisitRenderItem[] = [];
  const fireGroups = new Map<string, Extract<UpcomingVisitRenderItem, { kind: "fireExtinguisherGroup" }>>();

  actions.forEach((action) => {
    if (!isFireExtinguisherAction(action)) {
      items.push({ kind: "action", id: action.id, action });
      return;
    }

    const groupKey = [
      action.dueDate || "no-date",
      action.sourceProtocolNumber || action.sourceProtocolId || action.sourceLabel || "no-protocol",
    ].join("|");
    let group = fireGroups.get(groupKey);

    if (!group) {
      group = {
        kind: "fireExtinguisherGroup",
        id: `fire-extinguishers-${groupKey}`,
        actions: [],
        dueDate: action.dueDate,
        sourceLabel: actionSourceLabel(action),
        sourceProtocolNumber: action.sourceProtocolNumber,
        items: [],
      };
      fireGroups.set(groupKey, group);
      items.push(group);
    }

    const equipmentItem = findFireExtinguisherEquipment(action, equipment);
    group.actions.push(action);
    group.items.push({
      action,
      equipmentItem,
      label: fireExtinguisherEquipmentLabel(action, equipmentItem),
      stickerNumber: equipmentItem?.stickerNumber || "",
      location: equipmentItem?.location || "",
    });
  });

  return items;
}

function uniqueActionActivityTitles(action: UpcomingObjectAction) {
  return Array.from(
    new Set(
      action.activities
        .map((activity) => activity.title.trim())
        .filter(Boolean)
    )
  );
}

function actionRecurrenceMonths(action: UpcomingObjectAction) {
  return (
    action.activities.find((activity) => activity.recurrenceMonths > 0)
      ?.recurrenceMonths ||
    action.recurrenceMonths ||
    0
  );
}

function actionRecurrenceLabel(action: UpcomingObjectAction) {
  const recurrenceMonths = actionRecurrenceMonths(action);

  if (recurrenceMonths === 1) return "ежемесечно";
  if (recurrenceMonths === 3) return "на 3 месеца";
  if (recurrenceMonths === 6) return "на 6 месеца";
  if (recurrenceMonths === 12) return "годишно";

  return "";
}

function actionDisplayTitle(action: UpcomingObjectAction) {
  if (action.source === "defect") return action.title;
  if (actionRecurrenceLabel(action)) return "Планирано посещение";

  const activityTitles = uniqueActionActivityTitles(action);
  if (activityTitles.length === 1) return activityTitles[0];

  return action.taskType || action.title || "Планирано посещение";
}

function taskTableTitle(action: UpcomingObjectAction) {
  if (action.source === "defect") return actionDisplayTitle(action);
  return visitDisplayTitle(action);
}

function normalizedTaskText(value: string) {
  return value
    .replace(/^•\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function shouldShowActionDescription(action: UpcomingObjectAction) {
  if (!action.description.trim()) return false;

  const activitiesText = uniqueActionActivityTitles(action).join(" ");
  return normalizedTaskText(action.description) !== normalizedTaskText(activitiesText);
}

function actionSourceLabel(action: UpcomingObjectAction) {
  const isSubscriptionAction =
    action.sourceProtocolType === "Абонаментно обслужване / профилактичен преглед" ||
    action.sourceProtocolType === "subscription" ||
    action.title.includes("Абонаментно обслужване") ||
    action.activities.some((activity) =>
      [1, 3, 12].includes(activity.recurrenceMonths)
    );

  if (isSubscriptionAction) {
    return action.sourceProtocolNumber
      ? `Абонаментен протокол №${action.sourceProtocolNumber}`
      : action.sourceLabel;
  }

  return (
    action.sourceLabel ||
    (action.sourceProtocolNumber ? `Протокол №${action.sourceProtocolNumber}` : "")
  );
}

function ProtocolSourceLink({ action }: { action: UpcomingObjectAction }) {
  if (!action.sourceProtocolNumber) return null;

  return (
    <Link
      href={`/protocols/view/${encodeURIComponent(action.sourceProtocolNumber)}`}
      className="inline-flex h-6 items-center rounded-lg border border-slate-200 bg-white/70 px-2 text-[11px] font-black text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
    >
      Отвори протокол
    </Link>
  );
}

function ConfirmationDialog({
  dialog,
  busy = false,
  onClose,
}: {
  dialog: ConfirmationDialogState;
  busy?: boolean;
  onClose: () => void;
}) {
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">{dialog.title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              {dialog.message}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Затвори"
          >
            <X size={18} />
          </button>
        </div>

        {dialog.content ? <div className="mt-5">{dialog.content}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Отказ
          </Button>
          <Button
            type="button"
            variant={dialog.variant === "danger" ? "danger" : "primary"}
            onClick={dialog.onConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {dialog.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

type TaskDateFilter = "all" | "week" | "month" | "year";

const taskDateFilters: Array<{ label: string; value: TaskDateFilter }> = [
  { label: "Всички", value: "all" },
  { label: "Тази седмица", value: "week" },
  { label: "Този месец", value: "month" },
  { label: "Тази година", value: "year" },
];

function inputDateToLocalDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const start = startOfLocalDay(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function isActionInDateFilter(action: UpcomingObjectAction, filter: TaskDateFilter) {
  if (filter === "all") return true;

  const actionDate = inputDateToLocalDate(action.dueDate);
  if (!actionDate) return false;

  const today = new Date();
  const actionDay = startOfLocalDay(actionDate);

  if (filter === "week") {
    const start = startOfWeek(today);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return actionDay >= start && actionDay < end;
  }

  if (filter === "month") {
    return (
      actionDay.getFullYear() === today.getFullYear() &&
      actionDay.getMonth() === today.getMonth()
    );
  }

  return actionDay.getFullYear() === today.getFullYear();
}

type TaskQuickFilter = "all" | "problems" | "planned" | "overdue" | "done";

const taskQuickFilterLabels: Record<TaskQuickFilter, string> = {
  all: "Всички",
  problems: "Проблеми",
  planned: "Планирани",
  overdue: "Просрочени",
  done: "Изпълнени",
};

function isCompletedAction(action: UpcomingObjectAction) {
  const status = action.status.trim().toLowerCase();
  return status === "done" || status === "completed" || status === "resolved";
}

function isOverdueAction(action: UpcomingObjectAction) {
  if (isCompletedAction(action)) return false;

  const days = daysUntilDate(action.dueDate);
  if (days !== null) return days < 0;

  return action.source === "defect";
}

function actionMatchesQuickFilter(
  action: UpcomingObjectAction,
  filter: TaskQuickFilter
) {
  if (filter === "all") return true;
  if (filter === "problems") {
    return action.source === "defect" && !isCompletedAction(action);
  }
  if (filter === "planned") {
    return action.source !== "defect" && !isCompletedAction(action) && !isOverdueAction(action);
  }
  if (filter === "overdue") return isOverdueAction(action);
  return isCompletedAction(action);
}

function actionTypeLabel(action: UpcomingObjectAction) {
  if (action.source === "defect") return "Проблем";
  if (action.source === "service_protocol" || isFireExtinguisherAction(action)) {
    return "Обслужване";
  }
  return "Планирано посещение";
}

function actionTypeVariant(action: UpcomingObjectAction) {
  if (action.source === "defect") return "danger" as const;
  if (action.source === "service_protocol" || isFireExtinguisherAction(action)) {
    return "info" as const;
  }
  return "orange" as const;
}

function ResolvedProblemBadge() {
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex min-h-6 items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold leading-none text-red-700 ring-1 ring-red-200/80">
        <span className="relative inline-block">
          Проблем
          <span className="absolute left-[-2px] top-1/2 h-0.5 w-[calc(100%+4px)] -rotate-12 rounded-full bg-red-500/80" />
        </span>
      </span>
      <span className="inline-flex min-h-6 items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold leading-none text-emerald-700 ring-1 ring-emerald-200/80">
        Разрешен
      </span>
    </div>
  );
}

function actionStatusLabel(action: UpcomingObjectAction) {
  if (isOverdueAction(action)) return "Просрочена";

  const status = action.status.trim().toLowerCase();
  if (status === "open") return "Нова";
  if (status === "done" || status === "completed") return "Изпълнена";
  if (status === "resolved") return "Решена";
  return "Планирана";
}

function actionStatusVariant(action: UpcomingObjectAction) {
  const status = action.status.trim().toLowerCase();
  if (isOverdueAction(action) || status === "open") return "danger" as const;
  if (status === "done" || status === "completed" || status === "resolved") {
    return "success" as const;
  }
  return "info" as const;
}

function actionTypeIcon(action: UpcomingObjectAction) {
  if (action.source === "defect") return CircleAlert;
  if (isCompletedAction(action)) return CheckCircle2;
  if (action.source === "service_protocol" || isFireExtinguisherAction(action)) return Wrench;
  return CalendarDays;
}

function actionIconClasses(action: UpcomingObjectAction) {
  if (action.source === "defect") {
    return "border-red-100 bg-red-50 text-red-600 shadow-[0_8px_18px_rgba(220,38,38,0.08)]";
  }
  if (isCompletedAction(action)) {
    return "border-emerald-100 bg-emerald-50 text-emerald-600 shadow-[0_8px_18px_rgba(5,150,105,0.08)]";
  }
  if (action.source === "service_protocol" || isFireExtinguisherAction(action)) {
    return "border-blue-100 bg-blue-50 text-blue-600 shadow-[0_8px_18px_rgba(37,99,235,0.08)]";
  }
  return "border-orange-100 bg-orange-50 text-orange-600 shadow-[0_8px_18px_rgba(249,115,22,0.08)]";
}

function weekdayShort(value: string) {
  const date = inputDateToLocalDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("bg-BG", { weekday: "short" }).format(date);
}

function protocolNumberFromSourceLabel(value: string) {
  const match = value.match(/(?:№|No|N)\s*([A-Za-zА-Яа-я0-9-]+)/i);
  return match?.[1] ?? "";
}

function taskProtocolRefs(row: DataRecord) {
  return uniqueValues([
    textValue(row, ["source_protocol_number"]),
    textValue(row, ["source_protocol_id", "protocol_id"]),
    protocolNumberFromSourceLabel(textValue(row, ["source_label"])),
  ]);
}

function protocolTechnicianForTask(
  row: DataRecord,
  techniciansByProtocolRef: Map<string, string>
) {
  for (const ref of taskProtocolRefs(row)) {
    const technician = techniciansByProtocolRef.get(ref);
    if (technician) return technician;
  }

  return textValue(row, [
    "technician",
    "assignee",
    "assigned_to",
    "responsible",
  ]);
}

function normalizeGroupPart(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || fallback;
}

function taskGroupKey(
  row: DataRecord,
  locationProfile: LocationProfile,
  isDefect = false
) {
  const objectId =
    textValue(row, ["object_id", "object_code"]) ||
    locationProfile.databaseId ||
    locationProfile.qrCode ||
    locationProfile.name;
  const dueDate = textValue(row, ["due_date"]);
  const sourceProtocolId =
    textValue(row, ["source_protocol_id", "protocol_id"]) ||
    textValue(row, ["source_protocol_number"]) ||
    textValue(row, ["source_label"]);
  const taskType = textValue(row, ["task_type"]) || "Планирано посещение";
  const title = textValue(row, ["title"]);
  const sourceProtocolType = textValue(row, ["source_protocol_type"]);
  const sourceProtocolRow = textValue(row, ["source_protocol_row"]);
  const sourceLabel = textValue(row, ["source_label"]);

  const isExtinguisherServiceTask =
    !isDefect &&
    (sourceProtocolType.toLowerCase().includes("extinguisher") ||
      sourceProtocolType.toLowerCase().includes("пожарогас") ||
      sourceLabel.toLowerCase().includes("пожарогас") ||
      title.toLowerCase().includes("пожарогас"));

  if (isExtinguisherServiceTask) {
    return [
      normalizeGroupPart(objectId, "object"),
      "extinguisher-service",
      normalizeGroupPart(dueDate, "date"),
      normalizeGroupPart(sourceProtocolId, "protocol"),
    ].join("|");
  }

  const parts = [
    normalizeGroupPart(objectId, "object"),
    normalizeGroupPart(dueDate, "date"),
    normalizeGroupPart(taskType, "type"),
  ];

  if (isDefect) {
    parts.push(normalizeGroupPart(sourceProtocolId, "protocol"));
    parts.push(normalizeGroupPart(textValue(row, ["source_protocol_row"]), "row"));
  }

  return parts.join("|");
}

function isExtinguisherServiceTaskRow(row: DataRecord) {
  const taskType = textValue(row, ["task_type"]);
  if (taskType === "defect") return false;

  const haystack = [
    textValue(row, ["source_protocol_type"]),
    textValue(row, ["source_label"]),
    textValue(row, ["title"]),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes("extinguisher") || haystack.includes("пожарогас");
}

function isSalesFlowTaskRow(row: DataRecord) {
  const taskType = textValue(row, ["task_type"]).trim().toLowerCase();
  const sourceProtocolType = textValue(row, ["source_protocol_type"]).trim().toLowerCase();
  const sourceLabel = textValue(row, ["source_label"]).trim().toLowerCase();

  return (
    taskType === "търговско проследяване" ||
    sourceProtocolType === "sales_lead" ||
    sourceLabel === "лийд"
  );
}

function isSalesFlowAction(action: UpcomingObjectAction) {
  const taskType = action.taskType.trim().toLowerCase();
  const sourceProtocolType = action.sourceProtocolType.trim().toLowerCase();
  const sourceLabel = action.sourceLabel.trim().toLowerCase();

  return (
    taskType === "търговско проследяване" ||
    sourceProtocolType === "sales_lead" ||
    sourceLabel === "лийд"
  );
}

function equipmentReplacementKey(row: DataRecord, locationProfile: LocationProfile) {
  const objectId =
    textValue(row, ["object_id", "object_code"]) ||
    locationProfile.databaseId ||
    locationProfile.qrCode ||
    locationProfile.name;

  return [
    normalizeGroupPart(objectId, "object"),
    "extinguisher-equipment",
    normalizeGroupPart(
      textValue(row, ["source_protocol_row"]) || textValue(row, ["title"]),
      "equipment"
    ),
  ].join("|");
}

function collapseReplacedEquipmentRows(
  rows: DataRecord[],
  locationProfile: LocationProfile
) {
  const collapsed = new Map<string, DataRecord>();
  const passthrough: DataRecord[] = [];

  for (const row of rows) {
    if (!isExtinguisherServiceTaskRow(row)) {
      passthrough.push(row);
      continue;
    }

    const key = equipmentReplacementKey(row, locationProfile);
    const existing = collapsed.get(key);
    const dueDate = textValue(row, ["due_date"]);
    const existingDueDate = existing ? textValue(existing, ["due_date"]) : "";

    if (!existing || dueDate > existingDueDate) {
      collapsed.set(key, row);
    }
  }

  return [...passthrough, ...Array.from(collapsed.values())];
}

function mergeDescriptions(current: string, next: string) {
  const parts = [current, next]
    .flatMap((value) => value.split("\n"))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join("\n");
}

function mergeActivityList(
  current: { title: string; description: string }[],
  next: { title: string; description: string }[]
) {
  const seen = new Set(current.map((activity) => activity.title.trim()));

  for (const activity of next) {
    const key = activity.title.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    current.push(activity);
  }
}


function mapLocation(
  locationRow: DataRecord,
  clientRow: DataRecord | null,
  qrCode: string
): LocationProfile {
  const id = textValue(locationRow, ["id"]);

  return {
    id: qrCode,
    databaseId: id,
    clientId: textValue(locationRow, ["client_id"]),
    qrCode,
    objectType: textValue(locationRow, ["object_type", "objectType", "type"]),
    name: textValue(locationRow, ["name", "object_name", "title"]) || qrCode,
    address: textValue(locationRow, ["address", "full_address"]),
    region: textValue(locationRow, ["region", "area"]),
    client: textValue(clientRow, ["name", "organization", "company_name"]),
    contact: textValue(clientRow, [
      "contact_person",
      "contact",
      "representative",
      "person",
    ]),
    phone: textValue(clientRow, ["phone", "telephone", "mobile"]),
    qrUrl: `/qr/${qrCode || id}`,
  };
}

function mapEquipment(rows: DataRecord[]): EquipmentItem[] {
  return rows.map((row, index) => ({
    id: textValue(row, ["id"]) || `equipment-${index}`,
    name: textValue(row, ["display_name", "name"]) || textValue(row, ["equipment_type", "type", "category"]),
    type: textValue(row, ["equipment_type", "type", "category"]),
    subtype: textValue(row, ["subtype"]),
  category: textValue(row, ["category"]),
  extinguisherCategory: textValue(row, ["extinguisher_category", "subtype"]),
  extinguishingAgentType: textValue(row, ["extinguishing_agent_type"]),
  extinguishingAgentTradeName: textValue(row, ["extinguishing_agent_trade_name"]),
  brand: textValue(row, ["brand"]),
    model: textValue(row, ["model"]),
    serialNumber: textValue(row, ["serial_number", "serial", "identifier", "code"]),
    installationDate: inputDateValue(textValue(row, ["installation_date", "installed_at", "mount_date"])),
    systemAddress: textValue(row, ["system_address", "address_in_system"]),
    systemType: textValue(row, ["system_type"]),
    totalDevices: textValue(row, ["total_devices"]),
    pumpGroup: textValue(row, ["pump_group"]),
    pumpStationLocation: textValue(row, ["pump_station_location"]),
    capacity: textValue(row, ["capacity", "mass", "charge_mass"]),
    description: textValue(row, ["description"]),
    location: textValue(row, ["location", "object_location", "place"]),
    lastCheckDate: inputDateValue(
      textValue(row, ["last_check_date", "last_check", "last_check_at", "last_service_date"])
    ),
    nextCheckDate: inputDateValue(
      textValue(row, ["next_check_date", "next_check", "next_check_at", "next_service_date"])
    ),
    stickerNumber: textValue(row, ["sticker_number"]),
    stickerGeneratedAt: textValue(row, ["sticker_generated_at"]),
    stickerPrintedAt: textValue(row, ["sticker_printed_at"]),
    notes: textValue(row, ["notes", "note"]),
    createdAt: textValue(row, ["created_at"]),
    updatedAt: textValue(row, ["updated_at"]),
  }));
}

type EquipmentFormState = {
  type: string;
  subtype: string;
  category: string;
  extinguisherCategory: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  brand: string;
  model: string;
  serialNumber: string;
  installationDate: string;
  systemAddress: string;
  systemType: string;
  totalDevices: string;
  pumpGroup: string;
  pumpStationLocation: string;
  capacity: string;
  description: string;
  location: string;
  notes: string;
};

type BulkExtinguisherRow = {
  id: string;
  serialNumber: string;
  location: string;
};

type EquipmentCatalogKey =
  | "extinguisherBrands"
  | "extinguisherModels"
  | "extinguisherCategories"
  | "extinguisherChargeMasses"
  | "extinguishingAgentTypes"
  | "extinguishingAgentTradeNames";

const emptyEquipmentForm: EquipmentFormState = {
  type: "",
  subtype: "",
  category: "",
  extinguisherCategory: "",
  extinguishingAgentType: "",
  extinguishingAgentTradeName: "",
  brand: "",
  model: "",
  serialNumber: "",
  installationDate: "",
  systemAddress: "",
  systemType: "",
  totalDevices: "",
  pumpGroup: "",
  pumpStationLocation: "",
  capacity: "",
  description: "",
  location: "",
  notes: "",
};

function emptyBulkExtinguisherTemplate(): EquipmentFormState {
  return {
    ...emptyEquipmentForm,
    type: "Пожарогасител",
    category: equipmentCategoryByType["Пожарогасител"],
  };
}

function createBulkExtinguisherRow(
  values: Partial<Omit<BulkExtinguisherRow, "id">> = {}
): BulkExtinguisherRow {
  return {
    id: `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    serialNumber: values.serialNumber ?? "",
    location: values.location ?? "",
  };
}

function createBulkExtinguisherRows(count: number) {
  return Array.from({ length: count }, () => createBulkExtinguisherRow());
}

function normalizeDisplayPart(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function generatedEquipmentName(form: EquipmentFormState) {
  const type = normalizeDisplayPart(form.type);
  if (!type) return "";

  if (type === "Пожарогасител") {
    return [type, normalizeDisplayPart(form.extinguisherCategory), normalizeDisplayPart(form.capacity)]
      .filter(Boolean)
      .join(" ");
  }

  if (type === "Пожароизвестител") {
    return [type, normalizeDisplayPart(form.subtype).toLowerCase()]
      .filter(Boolean)
      .join(" ");
  }

  if (type === "Пожарен кран") {
    return [type, normalizeDisplayPart(form.subtype)].filter(Boolean).join(" ");
  }

  if (type === "Димоотвеждане") {
    return [type, normalizeDisplayPart(form.systemType)].filter(Boolean).join(" ");
  }

  if (type === "Аварийно осветление") {
    return [type, normalizeDisplayPart(form.subtype)].filter(Boolean).join(" ");
  }

  return type;
}

function buildEquipmentPayload(
  form: EquipmentFormState,
  locationId: string,
  displayName: string
) {
  return {
    location_id: locationId,
    object_id: locationId,
    site_id: locationId,
    name: displayName,
    display_name: displayName,
    type: form.type.trim(),
    equipment_type: form.type.trim(),
    subtype:
      form.type === "Пожарогасител"
        ? form.extinguisherCategory.trim() || null
        : form.subtype.trim() || null,
    category: form.category.trim() || equipmentCategoryByType[form.type] || null,
    extinguisher_category:
      form.type === "Пожарогасител"
        ? form.extinguisherCategory.trim() || null
        : null,
    extinguishing_agent_type:
      form.type === "Пожарогасител"
        ? form.extinguishingAgentType.trim() || null
        : null,
    extinguishing_agent_trade_name:
      form.type === "Пожарогасител"
        ? form.extinguishingAgentTradeName.trim() || null
        : null,
    brand: form.brand.trim() || null,
    model: form.model.trim() || null,
    serial_number: form.serialNumber.trim() || null,
    installation_date:
      form.type === "Пожароизвестител" && form.installationDate
        ? form.installationDate
        : null,
    system_address:
      form.type === "Пожароизвестител"
        ? form.systemAddress.trim() || null
        : null,
    system_type:
      (form.type === "Пожароизвестителна централа" ||
        form.type === "Спринклерна система" ||
        form.type === "Димоотвеждане")
        ? form.systemType.trim() || null
        : null,
    total_devices:
      (form.type === "Пожароизвестителна централа" ||
        form.type === "Спринклерна система" ||
        form.type === "Димоотвеждане") && form.totalDevices
        ? Number(form.totalDevices)
        : null,
    pump_group:
      form.type === "Спринклерна система"
        ? form.pumpGroup.trim() || null
        : null,
    pump_station_location:
      form.type === "Спринклерна система"
        ? form.pumpStationLocation.trim() || null
        : null,
    capacity: form.capacity.trim() || null,
    description: form.description.trim() || null,
    location: form.location.trim(),
    notes: form.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

function isFireExtinguisherEquipment(item: EquipmentItem) {
  const haystack = [item.type, item.category, item.name]
    .join(" ")
    .toLowerCase();

  return haystack.includes("пожарогас") || haystack.includes("extinguisher");
}

function isFireHydrantEquipment(item: EquipmentItem) {
  const haystack = [item.type, item.category, item.name]
    .join(" ")
    .toLowerCase();

  return haystack.includes("пожарен кран") || haystack.includes("fire-hydrant");
}

function isSmokeControlEquipment(item: EquipmentItem) {
  const haystack = [item.type, item.category, item.name]
    .join(" ")
    .toLowerCase();

  return haystack.includes("димоотвеждане") || haystack.includes("smoke-control");
}

function extinguisherDisplayType(item: EquipmentItem) {
  return [
    item.extinguisherCategory || item.subtype,
    item.extinguishingAgentType,
    item.capacity ? `${item.capacity} kg` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/прахов\s+прах/gi, "Прахов")
    .replace(/въглероден\s+диоксид\s+(co2|со2|co₂)/gi, "CO2")
    .replace(/\s+/g, " ")
    .trim();
}

function equipmentDetailRows(item: EquipmentItem) {
  const isExtinguisher = isFireExtinguisherEquipment(item);
  const isHydrant = isFireHydrantEquipment(item);
  const isSmokeControl = isSmokeControlEquipment(item);
  const rows: { label: string; value: string }[] = [
    { label: "Име", value: item.name },
    { label: "Тип оборудване", value: item.type },
  ];

  if (isHydrant) {
    if (item.subtype) rows.push({ label: "Тип кран", value: item.subtype });
    if (item.capacity) {
      rows.push({ label: "Дължина на шланга", value: item.capacity });
    }
    if (item.description) rows.push({ label: "Диаметър", value: item.description });
  } else if (item.subtype && !isSmokeControl) {
    rows.push({
      label: item.type === "Аварийно осветление" ? "Тип" : "Вид / подтип",
      value: item.subtype,
    });
  }

  rows.push({ label: "Локация", value: item.location });

  if (item.serialNumber) rows.push({ label: "Сериен номер", value: item.serialNumber });

  if (item.type === "Пожароизвестител") {
    if (item.systemAddress) rows.push({ label: "Адрес в системата", value: item.systemAddress });
    if (item.installationDate) rows.push({ label: "Дата на монтаж", value: formatDateValue(item.installationDate) });
  }

  if (isExtinguisher) {
    if (item.extinguisherCategory || item.category) {
      rows.push({ label: "Категория", value: item.extinguisherCategory || item.category });
    }
    if (item.capacity) rows.push({ label: "Маса / вместимост", value: item.capacity });
    if (item.extinguishingAgentType) rows.push({ label: "Вид пожарогасително вещество", value: item.extinguishingAgentType });
    if (item.extinguishingAgentTradeName) rows.push({ label: "Търговско наименование", value: item.extinguishingAgentTradeName });
  } else if (item.type === "Пожароизвестителна централа" && item.capacity) {
    rows.push({ label: "Брой линии", value: item.capacity });
  }

  if (item.type === "Пожароизвестителна централа") {
    if (item.systemType) rows.push({ label: "Тип система", value: item.systemType });
    if (item.totalDevices) rows.push({ label: "Общо устройства", value: item.totalDevices });
  }

  if (item.type === "Спринклерна система") {
    if (item.systemType) rows.push({ label: "Тип система", value: item.systemType });
    if (item.totalDevices) rows.push({ label: "Брой спринклери", value: item.totalDevices });
    if (item.pumpGroup) rows.push({ label: "Помпена група", value: item.pumpGroup });
    if (item.pumpStationLocation) rows.push({ label: "Локация на помпената станция", value: item.pumpStationLocation });
  }

  if (item.type === "Димоотвеждане") {
    if (item.systemType) rows.push({ label: "Тип", value: item.systemType });
    if (item.subtype) rows.push({ label: "Люк", value: item.subtype });
    if (item.capacity) rows.push({ label: "Вентилатор", value: item.capacity });
    if (item.description) rows.push({ label: "Клапа", value: item.description });
    if (item.totalDevices) rows.push({ label: "Брой", value: item.totalDevices });
  }

  if (item.brand) rows.push({ label: "Марка", value: item.brand });
  if (item.model) rows.push({ label: "Модел", value: item.model });
  if (item.lastCheckDate) rows.push({ label: "Последна проверка", value: formatDateValue(item.lastCheckDate) });
  if (item.nextCheckDate) rows.push({ label: "Следваща проверка", value: formatDateValue(item.nextCheckDate) });
  if (item.createdAt) rows.push({ label: "Създадено", value: formatDateTimeValue(item.createdAt) });
  if (item.updatedAt) rows.push({ label: "Обновено", value: formatDateTimeValue(item.updatedAt) });

  return rows.filter((row) => row.value && row.value !== "—");
}

function mapFireExtinguisherServiceHistory(
  rows: DataRecord[]
): FireExtinguisherServiceHistoryItem[] {
  return rows.map((row, index) => ({
    id: textValue(row, ["id"]) || `history-${index}`,
    equipmentId: textValue(row, ["equipment_id"]),
    objectId: textValue(row, ["object_id"]),
    protocolId: textValue(row, ["protocol_id"]),
    protocolNumber: textValue(row, ["protocol_number"]),
    stickerNumber: textValue(row, ["sticker_number"]),
    serviceType: textValue(row, ["service_type"]),
    serviceDate: inputDateValue(textValue(row, ["service_date"])),
    nextServiceDate: inputDateValue(textValue(row, ["next_service_date"])),
    technician: textValue(row, ["technician", "technician_id"]),
    createdAt: textValue(row, ["created_at"]),
  }));
}

function equipmentTypeFromItem(item: EquipmentItem) {
  if (equipmentTypeOptions.includes(item.type)) return item.type;
  if (equipmentTypeOptions.includes(item.name)) return item.name;
  return item.type || item.name;
}

function equipmentFormWithType(current: EquipmentFormState, type: string): EquipmentFormState {
  return {
    ...current,
    type,
    subtype: "",
    category: equipmentCategoryByType[type] ?? current.category,
    extinguisherCategory: "",
    extinguishingAgentType: "",
    extinguishingAgentTradeName: "",
    brand: "",
    model: "",
    serialNumber: "",
    installationDate: "",
    systemAddress: "",
    systemType: "",
    totalDevices: "",
    pumpGroup: "",
    pumpStationLocation: "",
    capacity: "",
    description: "",
    location: current.location,
    notes: current.notes,
  };
}

function EquipmentField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black uppercase text-slate-400">
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
      />
    </div>
  );
}

function uniqueOptions(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function addUniqueCatalogValue(values: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return values;
  const exists = values.some(
    (item) => item.trim().toLowerCase() === normalized.toLowerCase()
  );
  return exists ? values : [...values, normalized];
}

function EquipmentSelectField({
  label,
  value,
  onChange,
  options,
  onAddNew,
  required = false,
  placeholder = "Избери",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onAddNew?: () => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black uppercase text-slate-400">
        {label}
      </label>
      <select
        value={value}
        required={required}
        onChange={(event) => {
          if (event.target.value === "__add_new__") {
            onAddNew?.();
            return;
          }
          onChange(event.target.value);
        }}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
      >
        <option value="">{placeholder}</option>
        {uniqueOptions(value ? [...options, value] : options).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {onAddNew ? <option value="__add_new__">+ Добави ново</option> : null}
      </select>
    </div>
  );
}

function EquipmentDetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-black uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-800">
        {value || "—"}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-500 shadow-sm">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
        <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}

function GeneratedQrCode({ compact = false }: { compact?: boolean }) {
  const [qrImage, setQrImage] = useState<string | null>(null);
  const location = useLocationProfile();

  useEffect(() => {
    let isMounted = true;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const qrTarget = `${origin}${location.qrUrl}`;

    generateQRCode(qrTarget).then((dataUrl) => {
      if (isMounted) {
        setQrImage(dataUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [location.qrUrl]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 ${
        compact ? "h-28 w-28" : "h-36 w-36"
      }`}
    >
      {qrImage ? (
        <img
          src={qrImage}
          alt="QR код на обекта"
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="text-center text-xs font-bold text-slate-400">
          Генериране...
        </div>
      )}
    </div>
  );
}

function ObjectQrCard() {
  const location = useLocationProfile();

  function handlePrintPassport() {
    document.body.classList.add("print-object-passport");

    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.body.classList.remove("print-object-passport");
      }, 300);
    }, 50);
  }

  return (
    <section className="object-qr-card min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="object-qr-card__header flex min-w-0 flex-col gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <QrCode size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-black leading-tight break-words">
                QR код на обекта
              </h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                Поставя се на входа и отваря дигиталния паспорт.
              </p>
            </div>
          </div>
        </div>

        <div className="object-qr-card__actions flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href={`${location.qrUrl}?mode=erp`}
            className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4.5 text-sm font-bold leading-none text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md sm:w-auto"
          >
            <ExternalLink size={17} className="shrink-0" />
            <span className="truncate">Отвори дигитален паспорт</span>
          </Link>
          <Button
            type="button"
            variant="secondary"
            className="w-full min-w-0 sm:w-auto"
            onClick={handlePrintPassport}
          >
            <Printer size={17} className="shrink-0" />
            <span className="truncate">Принтирай етикет</span>
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-xs font-bold uppercase text-slate-400">
          Object QR URL
        </div>
        <div className="mt-1 max-w-md overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-bold text-slate-800 break-all">
          {location.qrUrl}
        </div>
      </div>

      <div className="mt-5 max-w-[560px] min-w-0 border border-dashed border-slate-300 bg-slate-50 p-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="text-lg font-black tracking-tight">
            FIRE<span className="text-orange-500">Control</span>
          </div>
          <Badge variant="orange">Паспорт</Badge>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <GeneratedQrCode compact />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase text-slate-400">
              Обект
            </div>
            <div className="mt-1 text-xl font-black leading-tight text-slate-900">
              {location.name}
            </div>
            <div className="mt-3 text-xs font-bold uppercase text-slate-400">
              ID
            </div>
            <div className="mt-1 font-mono text-base font-black text-slate-800">
              {location.id}
            </div>
            <div className="mt-4 text-xs font-bold uppercase text-slate-400">
              Контакт
            </div>
            <div className="mt-1 text-lg font-black text-slate-900">
              {location.phone || "Не е зададен"}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3 text-xs font-bold leading-5 text-slate-500">
          Камера: публичен контакт. ERP: вътрешен паспорт.
        </div>
      </div>

      <div className="object-passport-print mt-6 hidden">
        <div className="w-[90mm] border border-slate-950 bg-white p-[5mm] text-slate-950">
          <div className="flex items-center justify-between border-b-2 border-slate-950 pb-2">
            <div className="text-[18px] font-black tracking-tight">
              FIRE<span className="text-orange-500">Control</span>
            </div>
            <div className="border border-slate-950 px-2 py-1 text-[10px] font-black uppercase">
              Паспорт
            </div>
          </div>
          <div className="mt-4 flex gap-4">
            <GeneratedQrCode compact />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase text-slate-500">
                Обект
              </div>
              <div className="mt-1 text-lg font-black leading-tight">
                {location.name}
              </div>
              <div className="mt-3 text-[10px] font-black uppercase text-slate-500">
                ID
              </div>
              <div className="mt-1 font-mono text-sm font-black">
                {location.id}
              </div>
            </div>
          </div>
          <div className="mt-4 border border-slate-300 p-2 text-xs">
            <div className="font-black uppercase text-slate-500">Адрес</div>
            <div className="mt-1 font-bold leading-4">{location.address || "—"}</div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 border border-slate-300 p-2 text-xs">
            <div>
              <div className="font-black uppercase text-slate-500">Контакт</div>
              <div className="mt-1 text-base font-black">
                {location.phone || "089466346"}
              </div>
            </div>
            <div className="text-right text-[10px] font-black uppercase leading-4 text-slate-500">
              Digital
              <br />
              Passport
            </div>
          </div>
          <div className="mt-3 border-t border-slate-300 pt-2 text-[9px] font-bold leading-4 text-slate-500">
            Публично сканиране показва контакт. ERP сканиране отваря вътрешна
            сервизна информация за техника.
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewTab() {
  const location = useLocationProfile();
  const equipment = useLocationEquipment();
  const { protocols, protocolsLoadState } = useLocationProtocols();
  const {
    upcomingActions,
    upcomingActionsLoadState,
    completeUpcomingAction,
  } = useLocationUpcomingActions();
  const [expandedUpcomingActionIds, setExpandedUpcomingActionIds] = useState<
    Set<string>
  >(new Set());
  const recentProtocols = protocols.slice(0, 3);
  const activeProblems = upcomingActions.filter(
    (action) => action.source === "defect" && !isCompletedAction(action)
  );
  const upcomingVisitActions = upcomingActions.filter(
    (action) =>
      action.source !== "defect" &&
      !isCompletedAction(action) &&
      !isSalesFlowAction(action)
  );
  const upcomingVisitRenderItems = useMemo(
    () => buildUpcomingVisitRenderItems(upcomingVisitActions, equipment),
    [upcomingVisitActions, equipment]
  );

  function toggleUpcomingActionActivities(actionId: string) {
    setExpandedUpcomingActionIds((current) => {
      const next = new Set(current);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  }

  return (
    <section className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <h3 className="text-lg font-black">Информация</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoRow icon={UserRound} label="Клиент" value={location.client} />
            <InfoRow
              icon={Building2}
              label="Тип обект"
              value={location.objectType || "—"}
            />
            <InfoRow
              icon={UserRound}
              label="Лице за контакт"
              value={location.contact}
            />
            <InfoRow icon={Phone} label="Телефон" value={location.phone} />
          </div>
        </Card>

        <ObjectQrCard />
      </div>

      <div className="min-w-0 space-y-6">
        {activeProblems.length > 0 ? (
          <Card className="border-red-100 bg-red-50/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm ring-1 ring-red-100">
                  <AlertTriangle size={17} />
                </span>
                <div>
                  <h3 className="text-base font-black">Активни проблеми</h3>
                  <p className="text-xs font-bold text-red-700">
                    Изискват отстраняване
                  </p>
                </div>
              </div>
              <Badge variant="danger">{activeProblems.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {activeProblems.map((problem) => {
                const sourceLabel = actionSourceLabel(problem);
                const hasComment =
                  problem.description.trim() &&
                  normalizedTaskText(problem.description) !==
                    normalizedTaskText(problem.title);

                return (
                  <div
                    key={problem.id}
                    className="rounded-xl border border-red-100 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="danger">Проблем</Badge>
                        <span className="text-xs font-black text-slate-500">
                          {formatTaskCreatedDate(problem.createdAt)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => completeUpcomingAction(problem)}
                      >
                        <CheckCircle2 size={15} />
                        Маркирай като решен
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
                      <div className="min-w-0">
                        <div className="whitespace-pre-line text-base font-black leading-6 text-slate-950">
                          {problem.title}
                        </div>
                        {hasComment ? (
                          <div className="mt-2 rounded-xl bg-red-50/70 px-3 py-2 text-sm font-bold leading-5 text-red-900">
                            <span className="text-red-600">Коментар:</span>{" "}
                            <span>{problem.description}</span>
                          </div>
                        ) : null}
                        {sourceLabel ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold leading-5 text-slate-600">
                            <span className="text-slate-400">Източник:</span>
                            <span>{sourceLabel}</span>
                            <ProtocolSourceLink action={problem} />
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-2 border-t border-slate-100 pt-3 text-xs font-bold leading-5 text-slate-600 sm:grid-cols-3 lg:block lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                        <div>
                          <div className="text-slate-400">Статус</div>
                          <div className="text-slate-800">
                            {taskStatusLabel(problem.status)}
                          </div>
                        </div>
                        <div className="lg:mt-3">
                          <div className="text-slate-400">Отговорник</div>
                          <div className="text-slate-800">
                            {problem.assignee || "Не е зададен"}
                          </div>
                        </div>
                        <div className="lg:mt-3">
                          <div className="text-slate-400">Свързана задача</div>
                          <div className="text-slate-800">
                            {problem.id ? "Да" : "Не"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black">Предстоящи посещения и действия</h3>
            <Badge variant="orange">{upcomingVisitActions.length}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {upcomingActionsLoadState === "loading" ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">
                Зареждане...
              </div>
            ) : null}

            {upcomingActionsLoadState === "error" ? (
              <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600">
                Грешка при зареждане на предстоящите действия.
              </div>
            ) : null}

            {upcomingActionsLoadState === "ready" && upcomingVisitRenderItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
                Няма предстоящи посещения или действия за този обект.
              </div>
            ) : null}

            {upcomingActionsLoadState === "ready"
              ? upcomingVisitRenderItems.map((renderItem) => {
                  if (renderItem.kind === "fireExtinguisherGroup") {
                    const proximity = dateProximityLabel(renderItem.dueDate);
                    const isExpanded = expandedUpcomingActionIds.has(renderItem.id);
                    const visibleItems = isExpanded
                      ? renderItem.items
                      : renderItem.items.slice(0, 6);
                    const hiddenItemCount =
                      renderItem.items.length - visibleItems.length;
                    const protocolText =
                      renderItem.sourceProtocolNumber
                        ? `Протокол №${renderItem.sourceProtocolNumber}`
                        : renderItem.sourceLabel;

                    return (
                      <div
                        key={renderItem.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-slate-400">
                            <CalendarDays size={14} />
                            {formatDateValue(renderItem.dueDate) || "Без дата"}
                          </div>
                          <Badge variant={proximity.variant}>{proximity.label}</Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-start gap-2 font-black leading-tight text-slate-950">
                              <Wrench size={17} className="mt-0.5 shrink-0 text-blue-600" />
                              <span>Пожарогасители за обслужване</span>
                            </div>
                            <div className="mt-1 text-sm font-bold text-slate-500">
                              {renderItem.items.length} бр.
                              {protocolText ? ` · ${protocolText}` : ""}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {visibleItems.map((item) => (
                            <div
                              key={item.action.id}
                              className="grid gap-1 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_minmax(120px,0.55fr)] md:items-center"
                            >
                              <div className="min-w-0 font-black leading-5 text-slate-900">
                                {item.label}
                              </div>
                              <div className="font-bold text-slate-500">
                                {item.stickerNumber ? `Стикер №${item.stickerNumber}` : "Без стикер"}
                              </div>
                              <div className="min-w-0 font-bold text-slate-500">
                                {item.location || "Без локация"}
                              </div>
                            </div>
                          ))}
                        </div>

                        {hiddenItemCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleUpcomingActionActivities(renderItem.id)}
                            className="mt-3 text-sm font-black text-orange-600 transition hover:text-orange-700"
                          >
                            +{hiddenItemCount} още
                          </button>
                        ) : isExpanded && renderItem.items.length > 6 ? (
                          <button
                            type="button"
                            onClick={() => toggleUpcomingActionActivities(renderItem.id)}
                            className="mt-3 text-sm font-black text-orange-600 transition hover:text-orange-700"
                          >
                            Покажи по-малко
                          </button>
                        ) : null}
                      </div>
                    );
                  }

                  const action = renderItem.action;
                  const activityTitles = uniqueActionActivityTitles(action);
                  const sourceLabel = actionSourceLabel(action);
                  const proximity = dateProximityLabel(action.dueDate);
                  const isExpanded = expandedUpcomingActionIds.has(action.id);
                  const visibleActivities = isExpanded
                    ? activityTitles
                    : activityTitles.slice(0, 3);
                  const hiddenActivityCount =
                    activityTitles.length - visibleActivities.length;

                  return (
                    <div
                      key={action.id}
                      className={
                        action.source === "defect"
                          ? "rounded-2xl border border-red-100 bg-red-50 p-4"
                          : "rounded-2xl border border-slate-100 bg-slate-50 p-4"
                      }
                    >
                      {action.source === "defect" ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="danger">Проблем</Badge>
                            <Badge variant="warning">
                              {taskStatusLabel(action.status)}
                            </Badge>
                          </div>
                          <div className="mt-2 whitespace-pre-line font-black text-red-950">
                            {action.title}
                          </div>
                          {sourceLabel ? (
                            <div className="mt-3 text-sm font-medium leading-6 text-red-900">
                              <div className="font-black">Източник:</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{sourceLabel}</span>
                                <ProtocolSourceLink action={action} />
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => completeUpcomingAction(action)}
                            >
                              <CheckCircle2 size={17} />
                              Маркирай като решен
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-slate-400">
                              <CalendarDays size={14} />
                              {formatDateValue(action.dueDate) || "Без дата"}
                            </div>
                            <Badge variant={proximity.variant}>
                              {proximity.label}
                            </Badge>
                          </div>
                          <div className="mt-3">
                            <div className="font-black leading-tight text-slate-950">
                              {visitDisplayTitle(action)}
                            </div>
                          </div>
                          <div className="mt-3 text-sm font-black text-slate-700">
                            {activityTitles.length} дейности
                          </div>
                          {visibleActivities.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-sm font-medium leading-6 text-slate-600">
                              {visibleActivities.map((title) => (
                                <li key={`${action.id}-${title}`} className="flex gap-2">
                                  <span className="text-orange-500">•</span>
                                  <span>{title}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {hiddenActivityCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleUpcomingActionActivities(action.id)}
                              className="mt-2 text-sm font-black text-orange-600 transition hover:text-orange-700"
                            >
                              +{hiddenActivityCount} още
                            </button>
                          ) : isExpanded && activityTitles.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => toggleUpcomingActionActivities(action.id)}
                              className="mt-2 text-sm font-black text-orange-600 transition hover:text-orange-700"
                            >
                              Покажи по-малко
                            </button>
                          ) : null}
                          {sourceLabel ? (
                            <div className="mt-3 text-sm font-bold text-slate-500">
                              {sourceLabel}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })
              : null}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-lg font-black">Последни протоколи</h3>
          <div className="mt-4 space-y-3">
            {protocolsLoadState === "loading" && (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">
                Зареждане...
              </div>
            )}
            {protocolsLoadState === "error" && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600">
                Грешка при зареждане на протоколите.
              </div>
            )}
            {protocolsLoadState === "ready" && recentProtocols.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <div className="text-sm font-bold text-slate-500">
                  Все още няма създадени протоколи за този обект.
                </div>
                <Link
                  href={`/protocols/new?object=${encodeURIComponent(location.qrCode)}`}
                  className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-4 text-xs font-black text-white shadow-sm transition hover:shadow-md"
                >
                  <Plus size={14} />
                  Създай протокол
                </Link>
              </div>
            )}
            {protocolsLoadState === "ready" && recentProtocols.map((protocol) => (
              <Link
                key={protocol.id}
                href={`/protocols/view/${encodeURIComponent(protocol.protocolNumber)}`}
                className="group flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-orange-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-slate-800">
                    {PROTOCOL_TYPE_LABEL[protocol.protocolType] ?? protocol.protocolType}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {protocol.protocolNumber} · {formatDateValue(protocol.protocolDate)}
                  </div>
                  <div className="mt-2">
                    <Badge variant={protocol.status === "completed" ? "success" : "neutral"}>
                      {protocol.status === "completed" ? "Приключен" : "Чернова"}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function AddCatalogValueDialog({
  label,
  value,
  saving,
  onChange,
  onCancel,
  onConfirm,
}: {
  label: string;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Добави нова стойност</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{label}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <Input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Въведете стойност..."
          />
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Отказ
            </Button>
            <Button type="button" onClick={onConfirm} disabled={saving || !value.trim()}>
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
              Добави
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EquipmentTab() {
  const location = useLocationProfile();
  const equipment = useLocationEquipment();
  const setEquipment = useLocationEquipmentSetter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [viewingEquipment, setViewingEquipment] = useState<EquipmentItem | null>(null);
  const [serviceHistory, setServiceHistory] = useState<
    FireExtinguisherServiceHistoryItem[]
  >([]);
  const [historyLoadState, setHistoryLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [stickerActionState, setStickerActionState] = useState<
    "idle" | "generating" | "printing"
  >("idle");
  const [deleteTarget, setDeleteTarget] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState<EquipmentFormState>(emptyEquipmentForm);
  const [bulkFormOpen, setBulkFormOpen] = useState(false);
  const [bulkTemplate, setBulkTemplate] = useState<EquipmentFormState>(
    emptyBulkExtinguisherTemplate
  );
  const [bulkRows, setBulkRows] = useState<BulkExtinguisherRow[]>(() =>
    createBulkExtinguisherRows(5)
  );
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkSaveState, setBulkSaveState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [protocolCatalogs, setProtocolCatalogs] = useState<ProtocolSettings>(
    () => readProtocolSettings()
  );
  const [pendingCatalogAdd, setPendingCatalogAdd] = useState<{
    key: EquipmentCatalogKey;
    formKey: keyof EquipmentFormState;
    label: string;
  } | null>(null);
  const [pendingCatalogValue, setPendingCatalogValue] = useState("");
  const [catalogAddState, setCatalogAddState] = useState<"idle" | "saving">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [deletingEquipmentId, setDeletingEquipmentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadCatalogs() {
      try {
        const databaseSettings = await readProtocolSettingsFromSupabase();
        if (isMounted) {
          setProtocolCatalogs(databaseSettings);
        }
      } catch {
        if (isMounted) {
          setProtocolCatalogs(readProtocolSettings());
        }
      }
    }

    function handleSettingsUpdated() {
      setProtocolCatalogs(readProtocolSettings());
    }

    loadCatalogs();
    window.addEventListener(settingsUpdatedEvent, handleSettingsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(settingsUpdatedEvent, handleSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;

    const timer = window.setTimeout(() => setToastMessage(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!viewingEquipment || !isFireExtinguisherEquipment(viewingEquipment)) {
      setServiceHistory([]);
      setHistoryLoadState("idle");
      return;
    }

    let isMounted = true;
    const currentEquipment = viewingEquipment;

    async function loadServiceHistory() {
      setHistoryLoadState("loading");

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("fire_extinguisher_service_history")
          .select("*")
          .eq("equipment_id", currentEquipment.id)
          .order("service_date", { ascending: false })
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error) {
          setServiceHistory([]);
          setHistoryLoadState("error");
          return;
        }

        setServiceHistory(mapFireExtinguisherServiceHistory((data as DataRecord[]) ?? []));
        setHistoryLoadState("ready");
      } catch {
        if (isMounted) {
          setServiceHistory([]);
          setHistoryLoadState("error");
        }
      }
    }

    loadServiceHistory();

    return () => {
      isMounted = false;
    };
  }, [viewingEquipment]);

  function updateForm(key: keyof EquipmentFormState, value: string) {
    setForm((current) =>
      key === "type" ? equipmentFormWithType(current, value) : { ...current, [key]: value }
    );
  }

  function updateBulkTemplate(key: keyof EquipmentFormState, value: string) {
    setBulkTemplate((current) => ({ ...current, [key]: value }));
  }

  function updateBulkRow(
    rowId: string,
    key: keyof Omit<BulkExtinguisherRow, "id">,
    value: string
  ) {
    setBulkRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  }

  function addBulkRows(count: number) {
    setBulkRows((current) => [...current, ...createBulkExtinguisherRows(count)]);
  }

  function removeBulkRow(rowId: string) {
    setBulkRows((current) =>
      current.length > 1 ? current.filter((row) => row.id !== rowId) : current
    );
  }

  function duplicateLastBulkRow() {
    setBulkRows((current) => {
      const last = current[current.length - 1];
      return [
        ...current,
        createBulkExtinguisherRow({
          serialNumber: "",
          location: last?.location ?? "",
        }),
      ];
    });
  }

  function applyBulkPaste() {
    const pastedRows = bulkPasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [serialNumber = "", location = ""] = line.split(/\t|;|,/);
        return createBulkExtinguisherRow({
          serialNumber: serialNumber.trim(),
          location: location.trim(),
        });
      });

    if (!pastedRows.length) return;

    setBulkRows(pastedRows);
    setBulkPasteText("");
  }

  function openCatalogValueDialog(
    key: EquipmentCatalogKey,
    formKey: keyof EquipmentFormState,
    label: string
  ) {
    setPendingCatalogAdd({ key, formKey, label });
    setPendingCatalogValue("");
  }

  function closeCatalogValueDialog() {
    if (catalogAddState === "saving") return;
    setPendingCatalogAdd(null);
    setPendingCatalogValue("");
  }

  async function confirmCatalogValueAdd() {
    if (!pendingCatalogAdd) return;
    const normalized = pendingCatalogValue.trim();
    if (!normalized) return;

    const nextCatalogs = {
      ...protocolCatalogs,
      [pendingCatalogAdd.key]: addUniqueCatalogValue(
        protocolCatalogs[pendingCatalogAdd.key] ?? [],
        normalized
      ),
    };

    setCatalogAddState("saving");
    try {
      await writeProtocolSettingsToSupabase(nextCatalogs);
      setProtocolCatalogs(nextCatalogs);
      updateForm(pendingCatalogAdd.formKey, normalized);
      setPendingCatalogAdd(null);
      setPendingCatalogValue("");
      setToastMessage("Стойността е добавена");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Стойността не беше записана"
      );
      setSaveState("error");
    } finally {
      setCatalogAddState("idle");
    }
  }

  async function refreshEquipmentList() {
    const supabase = createSupabaseBrowserClient();
    let { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("location_id", location.databaseId)
      .order("created_at", { ascending: true });

    if (error) {
      const fallbackResult = await supabase
        .from("equipment")
        .select("*")
        .eq("location_id", location.databaseId);

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw new Error(error.message);
    }

    setEquipment(mapEquipment((data as DataRecord[]) ?? []));
  }

  function updateEquipmentStickerState(
    equipmentId: string,
    values: Partial<EquipmentItem>
  ) {
    setEquipment((current) =>
      current.map((item) => (item.id === equipmentId ? { ...item, ...values } : item))
    );
    setViewingEquipment((current) =>
      current && current.id === equipmentId ? { ...current, ...values } : current
    );
  }

  async function createStickerSnapshot(item: EquipmentItem, stickerNumber: string) {
    const supabase = createSupabaseBrowserClient();
    const numericSticker = Number(stickerNumber);
    const now = new Date().toISOString();

    const latestHistory = serviceHistory[0];
    const serviceDate = latestHistory?.serviceDate || item.lastCheckDate || null;
    const nextServiceDate =
      latestHistory?.nextServiceDate || item.nextCheckDate || null;

    const rowPayload = {
      sticker_number: numericSticker,
      protocol_number: latestHistory?.protocolNumber || "",
      protocol_id: latestHistory?.protocolId || null,
      protocol_row_id: item.id,
      row_number: "",
      equipment_id: item.id,
      object_id: location.databaseId || location.qrCode,
      object_name: location.name,
      object_location: item.location,
      technician: latestHistory?.technician || "",
      service_date: serviceDate,
      next_service_date: nextServiceDate,
      extinguisher_type: extinguisherDisplayType(item),
      category: item.extinguisherCategory || item.category,
      extinguishing_agent:
        item.extinguishingAgentTradeName || item.extinguishingAgentType,
      capacity_mass: item.capacity,
      brand: item.brand,
      model: item.model,
      serial_number: item.serialNumber,
      company_settings: {},
      updated_at: now,
    };

    const { error } = await supabase
      .from("protocol_fire_extinguisher_rows")
      .upsert(rowPayload, { onConflict: "sticker_number" });

    if (error) throw new Error(error.message);
  }

  async function generateEquipmentSticker(item: EquipmentItem) {
    if (item.stickerNumber) return;

    setStickerActionState("generating");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc(
        "claim_fire_extinguisher_sticker_number"
      );

      if (error || data === null) {
        throw new Error(error?.message || "Не беше върнат номер на стикер.");
      }

      const stickerNumber = String(data);
      const now = new Date().toISOString();
      const updateResult = await supabase
        .from("equipment")
        .update({
          sticker_number: Number(stickerNumber),
          sticker_generated_at: now,
          updated_at: now,
        })
        .eq("id", item.id);

      if (updateResult.error) throw new Error(updateResult.error.message);

      const historyResult = await supabase
        .from("fire_extinguisher_service_history")
        .insert({
          equipment_id: item.id,
          object_id: location.databaseId || location.qrCode,
          protocol_id: null,
          protocol_number: "",
          sticker_number: Number(stickerNumber),
          service_type: "Генериран стикер",
          service_date: item.lastCheckDate || null,
          next_service_date: item.nextCheckDate || null,
          technician_id: "",
          technician: "",
        });

      if (historyResult.error) throw new Error(historyResult.error.message);

      const nextValues = {
        stickerNumber,
        stickerGeneratedAt: now,
        updatedAt: now,
      };
      updateEquipmentStickerState(item.id, nextValues);
      await createStickerSnapshot({ ...item, ...nextValues }, stickerNumber);
      setServiceHistory((current) => [
        {
          id: `generated-${Date.now()}`,
          equipmentId: item.id,
          objectId: location.databaseId || location.qrCode,
          protocolId: "",
          protocolNumber: "",
          stickerNumber,
          serviceType: "Генериран стикер",
          serviceDate: item.lastCheckDate,
          nextServiceDate: item.nextCheckDate,
          technician: "",
          createdAt: now,
        },
        ...current,
      ]);
      setHistoryLoadState("ready");
      setToastMessage(`Генериран е стикер №${stickerNumber}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Стикерът не беше генериран. Проверете SQL миграциите."
      );
      setSaveState("error");
    } finally {
      setStickerActionState("idle");
    }
  }

  async function printEquipmentSticker(item: EquipmentItem, stickerNumber?: string) {
    const number = stickerNumber || item.stickerNumber;
    if (!number) return;

    setStickerActionState("printing");
    setErrorMessage("");

    try {
      await createStickerSnapshot(item, number);
      const now = new Date().toISOString();
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("equipment")
        .update({
          sticker_printed_at: now,
          updated_at: now,
        })
        .eq("id", item.id);

      if (error) throw new Error(error.message);

      updateEquipmentStickerState(item.id, {
        stickerPrintedAt: now,
        updatedAt: now,
      });
      window.open(
        `/stickers/fire-extinguishers/${encodeURIComponent(number)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Стикерът не беше подготвен за печат."
      );
      setSaveState("error");
    } finally {
      setStickerActionState("idle");
    }
  }

  function openAddForm() {
    setEditingEquipmentId(null);
    setForm(emptyEquipmentForm);
    setSaveState("idle");
    setErrorMessage("");
    setFormOpen(true);
  }

  function openBulkExtinguisherForm() {
    setBulkTemplate(emptyBulkExtinguisherTemplate());
    setBulkRows(createBulkExtinguisherRows(5));
    setBulkPasteText("");
    setBulkSaveState("idle");
    setErrorMessage("");
    setBulkFormOpen(true);
  }

  function openEditForm(item: EquipmentItem) {
    const type = equipmentTypeFromItem(item);
    setEditingEquipmentId(item.id);
    setForm({
      type,
      subtype: item.subtype,
      category: item.category || equipmentCategoryByType[type] || "",
      extinguisherCategory: item.extinguisherCategory,
      extinguishingAgentType: item.extinguishingAgentType,
      extinguishingAgentTradeName: item.extinguishingAgentTradeName,
      brand: item.brand,
      model: item.model,
      serialNumber: item.serialNumber,
      installationDate: item.installationDate,
      systemAddress: item.systemAddress,
      systemType: item.systemType,
      totalDevices: item.totalDevices,
      pumpGroup: item.pumpGroup,
      pumpStationLocation: item.pumpStationLocation,
      capacity: item.capacity,
      description: item.description,
      location: item.location,
      notes: item.notes,
    });
    setSaveState("idle");
    setErrorMessage("");
    setFormOpen(true);
  }

  function openCloneEquipmentForm(item: EquipmentItem) {
    const type = equipmentTypeFromItem(item);
    setEditingEquipmentId(null);
    setForm({
      type,
      subtype: item.subtype,
      category: item.category || equipmentCategoryByType[type] || "",
      extinguisherCategory: item.extinguisherCategory,
      extinguishingAgentType: item.extinguishingAgentType,
      extinguishingAgentTradeName: item.extinguishingAgentTradeName,
      brand: item.brand,
      model: item.model,
      serialNumber: "",
      installationDate: item.installationDate,
      systemAddress: item.systemAddress,
      systemType: item.systemType,
      totalDevices: item.totalDevices,
      pumpGroup: item.pumpGroup,
      pumpStationLocation: item.pumpStationLocation,
      capacity: item.capacity,
      description: item.description,
      location: "",
      notes: item.notes,
    });
    setSaveState("idle");
    setErrorMessage("");
    setFormOpen(true);
  }

  function closeEquipmentForm() {
    setForm(emptyEquipmentForm);
    setEditingEquipmentId(null);
    setFormOpen(false);
    setSaveState("idle");
    setErrorMessage("");
  }

  function closeBulkExtinguisherForm() {
    if (bulkSaveState === "saving") return;
    setBulkTemplate(emptyBulkExtinguisherTemplate());
    setBulkRows(createBulkExtinguisherRows(5));
    setBulkPasteText("");
    setBulkSaveState("idle");
    setErrorMessage("");
    setBulkFormOpen(false);
  }

  function protocolPayloadUsesEquipment(value: unknown, equipmentId: string): boolean {
    if (!value) return false;

    if (Array.isArray(value)) {
      return value.some((entry) => protocolPayloadUsesEquipment(entry, equipmentId));
    }

    if (typeof value === "object") {
      const record = value as DataRecord;
      const selectedIds = record["selectedEquipmentIds"];
      if (
        Array.isArray(selectedIds) &&
        selectedIds.some((id) => String(id) === equipmentId)
      ) {
        return true;
      }

      const id = record["equipment_id"] ?? record["equipmentId"];
      if (id && String(id) === equipmentId) {
        return true;
      }

      return Object.values(record).some((entry) =>
        protocolPayloadUsesEquipment(entry, equipmentId)
      );
    }

    return false;
  }

  function isCompletedExtinguisherProtocol(row: DataRecord) {
    const status = textValue(row, ["status"]).toLowerCase();
    const type = textValue(row, ["protocol_type", "type"]).toLowerCase();
    const payload = row["protocol_payload"];
    const payloadRecord =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as DataRecord)
        : null;
    const payloadType = textValue(payloadRecord, ["protocolType", "protocol_type", "type"]).toLowerCase();

    return (
      status === "completed" &&
      (type === "extinguisher" ||
        type.includes("пожарогас") ||
        payloadType === "extinguisher" ||
        payloadType.includes("пожарогас"))
    );
  }

  async function equipmentIsUsedInProtocol(equipmentId: string) {
    const supabase = createSupabaseBrowserClient();
    const protocolRows: DataRecord[] = [];
    const seen = new Set<string>();

    async function mergeProtocolRows(
      column: "location_id" | "object_code",
      value: string
    ) {
      if (!value) return;

      const { data, error } = await supabase
        .from("protocols")
        .select("id, protocol_type, type, status, protocol_payload")
        .eq(column, value)
        .limit(100);

      if (error) return;

      for (const row of (data as DataRecord[]) ?? []) {
        const id = textValue(row, ["id"]);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        protocolRows.push(row);
      }
    }

    await mergeProtocolRows("location_id", location.databaseId);
    await mergeProtocolRows("object_code", location.qrCode);
    await mergeProtocolRows("object_code", location.databaseId);

    return protocolRows.some(
      (protocol) =>
        isCompletedExtinguisherProtocol(protocol) &&
        protocolPayloadUsesEquipment(protocol["protocol_payload"], equipmentId)
    );
  }

  async function handleSaveEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = generatedEquipmentName(form);
    if (!form.type.trim() || !form.location.trim() || !displayName) {
      return;
    }

    setSaveState("saving");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const payload = buildEquipmentPayload(
        form,
        location.databaseId,
        displayName
      );
      const legacyPayload = {
        location_id: location.databaseId,
        name: displayName,
        type: form.type.trim(),
        category: form.category.trim() || equipmentCategoryByType[form.type] || null,
        serial: form.serialNumber.trim() || null,
      };

      let query = editingEquipmentId
        ? supabase
            .from("equipment")
            .update(payload)
            .eq("id", editingEquipmentId)
        : supabase
            .from("equipment")
            .insert(payload);

      let { data, error } = await query
        .select("*")
        .single();

      if (error) {
        query = editingEquipmentId
          ? supabase
              .from("equipment")
              .update(legacyPayload)
              .eq("id", editingEquipmentId)
          : supabase
              .from("equipment")
              .insert(legacyPayload);

        const legacyResult = await query.select("*").single();
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (error || !data) {
        setErrorMessage(error?.message || "Оборудването не беше записано");
        setSaveState("error");
        return;
      }

      await refreshEquipmentList();
      closeEquipmentForm();
      setSaveState("idle");
      setToastMessage(
        editingEquipmentId ? "Оборудването е обновено" : "Оборудването е добавено"
      );
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setSaveState("error");
    }
  }

  async function handleSaveBulkExtinguishers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = generatedEquipmentName(bulkTemplate);
    const rowsToSave = bulkRows.filter(
      (row) => row.serialNumber.trim() || row.location.trim()
    );
    const missingLocationRows = rowsToSave.filter((row) => !row.location.trim());

    if (!displayName || !rowsToSave.length || missingLocationRows.length) {
      setErrorMessage(
        missingLocationRows.length
          ? "Всеки попълнен ред трябва да има локация."
          : "Добавете поне един пожарогасител."
      );
      setBulkSaveState("error");
      return;
    }

    setBulkSaveState("saving");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const payloads = rowsToSave.map((row) =>
        buildEquipmentPayload(
          {
            ...bulkTemplate,
            serialNumber: row.serialNumber,
            location: row.location,
          },
          location.databaseId,
          displayName
        )
      );

      const { error } = await supabase.from("equipment").insert(payloads);

      if (error) {
        setErrorMessage(error.message || "Пожарогасителите не бяха записани");
        setBulkSaveState("error");
        return;
      }

      await refreshEquipmentList();
      closeBulkExtinguisherForm();
      setToastMessage(`Добавени са ${rowsToSave.length} пожарогасителя`);
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setBulkSaveState("error");
    }
  }

  async function handleDeleteEquipment() {
    if (!deleteTarget) return;

    setDeletingEquipmentId(deleteTarget.id);
    setErrorMessage("");

    try {
      const isUsed = await equipmentIsUsedInProtocol(deleteTarget.id);
      if (isUsed) {
        setErrorMessage(
          "Оборудването не може да бъде изтрито, защото вече се използва в протокол."
        );
        setSaveState("error");
        setDeletingEquipmentId(null);
        setDeleteTarget(null);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("equipment")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) {
        const message = error.message || "";
        const isReferenceError =
          message.toLowerCase().includes("foreign key") ||
          message.toLowerCase().includes("violates") ||
          "code" in error && error.code === "23503";

        setErrorMessage(
          isReferenceError
            ? "Оборудването не може да бъде изтрито, защото вече се използва в протокол."
            : message || "Оборудването не беше изтрито"
        );
        setSaveState("error");
        setDeletingEquipmentId(null);
        setDeleteTarget(null);
        return;
      }

      setEquipment((current) =>
        current.filter((entry) => entry.id !== deleteTarget.id)
      );
      setDeletingEquipmentId(null);
      setDeleteTarget(null);
      setToastMessage("Оборудването е изтрито");
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setSaveState("error");
      setDeletingEquipmentId(null);
      setDeleteTarget(null);
    }
  }

  const generatedName = generatedEquipmentName(form);
  const subtypeOptions = equipmentSubtypeOptions[form.type] ?? [];
  const showSubtypeSelect =
    form.type === "Пожароизвестител";
  const subtypeLabel =
    form.type === "Аварийно осветление" ? "Тип" : "Вид";
  const capacityLabel =
    form.type === "Пожароизвестителна централа"
      ? "Брой линии"
      : "Маса / вместимост";
  const showBrandModelSerial =
    form.type === "Пожарогасител" ||
    form.type === "Пожароизвестител" ||
    form.type === "Пожароизвестителна централа";
  const showDescription = form.type === "Спринклерна система";
  const showHydrantFields = form.type === "Пожарен кран";
  const showSmokeControlFields = form.type === "Димоотвеждане";
  const showCommonFields = Boolean(form.type);
  const bulkGeneratedName = generatedEquipmentName(bulkTemplate);
  const bulkFilledRows = bulkRows.filter(
    (row) => row.serialNumber.trim() || row.location.trim()
  ).length;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black">Оборудване</h3>
          <p className="mt-1 text-sm text-slate-500">
            Пожарогасители, системи и контролни точки за този обект
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={openBulkExtinguisherForm}>
            <ClipboardPlus size={18} />
            Много пожарогасители
          </Button>
          <Button type="button" onClick={openAddForm}>
            <Plus size={18} />
            Добави оборудване
          </Button>
        </div>
      </div>

      {bulkFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <form
            onSubmit={handleSaveBulkExtinguishers}
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black">
                  Масово добавяне на пожарогасители
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Попълнете общите данни веднъж, после въведете само сериен номер и локация за всеки пожарогасител.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeBulkExtinguisherForm}
                aria-label="Затвори"
              >
                <X size={18} />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <EquipmentSelectField
                label="Категория"
                value={bulkTemplate.extinguisherCategory}
                options={protocolCatalogs.extinguisherCategories}
                onChange={(value) => updateBulkTemplate("extinguisherCategory", value)}
              />
              <EquipmentSelectField
                label="Маса / вместимост"
                value={bulkTemplate.capacity}
                options={protocolCatalogs.extinguisherChargeMasses}
                onChange={(value) => updateBulkTemplate("capacity", value)}
              />
              <EquipmentSelectField
                label="Марка"
                value={bulkTemplate.brand}
                options={protocolCatalogs.extinguisherBrands}
                onChange={(value) => updateBulkTemplate("brand", value)}
              />
              <EquipmentSelectField
                label="Модел"
                value={bulkTemplate.model}
                options={protocolCatalogs.extinguisherModels}
                onChange={(value) => updateBulkTemplate("model", value)}
              />
              <EquipmentSelectField
                label="Вид пожарогасително вещество"
                value={bulkTemplate.extinguishingAgentType}
                options={protocolCatalogs.extinguishingAgentTypes}
                onChange={(value) =>
                  updateBulkTemplate("extinguishingAgentType", value)
                }
              />
              <EquipmentSelectField
                label="Търговско наименование"
                value={bulkTemplate.extinguishingAgentTradeName}
                options={protocolCatalogs.extinguishingAgentTradeNames}
                onChange={(value) =>
                  updateBulkTemplate("extinguishingAgentTradeName", value)
                }
              />
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <label className="text-xs font-black uppercase text-slate-400">
                  Общи бележки
                </label>
                <textarea
                  value={bulkTemplate.notes}
                  onChange={(event) =>
                    updateBulkTemplate("notes", event.target.value)
                  }
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase text-slate-500">
                    Редове за създаване
                  </h4>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    При paste от Excel първата колона е сериен номер, втората е локация.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => addBulkRows(1)}>
                    <Plus size={15} />
                    Ред
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => addBulkRows(10)}>
                    <Plus size={15} />
                    10 реда
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={duplicateLastBulkRow}>
                    <ClipboardPlus size={15} />
                    Дублирай
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                {bulkRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2 md:grid-cols-[48px_1fr_1.4fr_40px]"
                  >
                    <div className="flex h-10 items-center justify-center rounded-lg bg-slate-50 text-xs font-black text-slate-400">
                      {index + 1}
                    </div>
                    <input
                      value={row.serialNumber}
                      placeholder="Сериен номер"
                      onChange={(event) =>
                        updateBulkRow(row.id, "serialNumber", event.target.value)
                      }
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                    <input
                      value={row.location}
                      placeholder="Локация в обекта"
                      onChange={(event) =>
                        updateBulkRow(row.id, "location", event.target.value)
                      }
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeBulkRow(row.id)}
                      aria-label="Премахни ред"
                    >
                      <X size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <label className="text-xs font-black uppercase text-slate-400">
                Постави от Excel
              </label>
              <textarea
                value={bulkPasteText}
                onChange={(event) => setBulkPasteText(event.target.value)}
                placeholder={"SN001\tКоридор ет. 1\nSN002\tДо ел. табло"}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyBulkPaste}
                  disabled={!bulkPasteText.trim()}
                >
                  <ClipboardPlus size={15} />
                  Зареди редовете
                </Button>
              </div>
            </div>

            {bulkSaveState === "error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                {errorMessage || "Пожарогасителите не бяха записани"}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-bold text-slate-500">
                Ще се създадат {bulkFilledRows} записа като{" "}
                <span className="font-black text-slate-900">
                  {bulkGeneratedName || "Пожарогасител"}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeBulkExtinguisherForm}
                >
                  Отказ
                </Button>
                <Button
                  type="submit"
                  disabled={bulkSaveState === "saving" || !bulkFilledRows}
                >
                  <Save size={17} />
                  {bulkSaveState === "saving"
                    ? "Записване..."
                    : `Запиши ${bulkFilledRows || ""}`}
                </Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <form
            onSubmit={handleSaveEquipment}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black">
                  {editingEquipmentId ? "Редакция на оборудване" : "Добави оборудване"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Основни данни за проверки, протоколи и следващи посещения.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeEquipmentForm} aria-label="Затвори">
                <X size={18} />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <EquipmentSelectField
                label="Тип оборудване"
                value={form.type}
                required
                options={equipmentTypeOptions}
                onChange={(value) => updateForm("type", value)}
              />

              {showSubtypeSelect ? (
                <EquipmentSelectField
                  label={subtypeLabel}
                  value={form.subtype}
                  options={subtypeOptions}
                  onChange={(value) => updateForm("subtype", value)}
                />
              ) : null}

              {form.type === "Пожарогасител" ? (
                <EquipmentSelectField
                  label="Категория"
                  value={form.extinguisherCategory}
                  options={protocolCatalogs.extinguisherCategories}
                  onChange={(value) => updateForm("extinguisherCategory", value)}
                  onAddNew={() =>
                    openCatalogValueDialog(
                      "extinguisherCategories",
                      "extinguisherCategory",
                      "Категория"
                    )
                  }
                />
              ) : null}

              {form.type === "Аварийно осветление" ? (
                <EquipmentField
                  label={subtypeLabel}
                  value={form.subtype}
                  onChange={(value) => updateForm("subtype", value)}
                />
              ) : null}

              {showHydrantFields ? (
                <>
                  <EquipmentField
                    label="Тип кран"
                    value={form.subtype}
                    placeholder="Стенен, вътрешен..."
                    onChange={(value) => updateForm("subtype", value)}
                  />
                  <EquipmentField
                    label="Дължина на шланга"
                    value={form.capacity}
                    placeholder="20 м"
                    onChange={(value) => updateForm("capacity", value)}
                  />
                  <EquipmentField
                    label="Диаметър"
                    value={form.description}
                    placeholder="DN 50"
                    onChange={(value) => updateForm("description", value)}
                  />
                </>
              ) : null}

              {showSmokeControlFields ? (
                <>
                  <EquipmentField
                    label="Тип"
                    value={form.systemType}
                    onChange={(value) => updateForm("systemType", value)}
                  />
                  <EquipmentField
                    label="Люк"
                    value={form.subtype}
                    onChange={(value) => updateForm("subtype", value)}
                  />
                  <EquipmentField
                    label="Вентилатор"
                    value={form.capacity}
                    onChange={(value) => updateForm("capacity", value)}
                  />
                  <EquipmentField
                    label="Клапа"
                    value={form.description}
                    onChange={(value) => updateForm("description", value)}
                  />
                  <EquipmentField
                    label="Брой"
                    value={form.totalDevices}
                    type="number"
                    onChange={(value) => updateForm("totalDevices", value)}
                  />
                </>
              ) : null}

              {showDescription ? (
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <label className="text-xs font-black uppercase text-slate-400">
                    Описание
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(event) => updateForm("description", event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              ) : null}

              {form.type === "Пожарогасител" ? (
                <EquipmentSelectField
                  label={capacityLabel}
                  value={form.capacity}
                  options={protocolCatalogs.extinguisherChargeMasses}
                  onChange={(value) => updateForm("capacity", value)}
                  onAddNew={() =>
                    openCatalogValueDialog(
                      "extinguisherChargeMasses",
                      "capacity",
                      capacityLabel
                    )
                  }
                />
              ) : null}

              {form.type === "Пожароизвестителна централа" ? (
                <>
                  <EquipmentSelectField
                    label="Тип система"
                    value={form.systemType}
                    options={["Конвенционална", "Адресируема"]}
                    onChange={(value) => updateForm("systemType", value)}
                  />
                  <EquipmentField
                    label={capacityLabel}
                    value={form.capacity}
                    onChange={(value) => updateForm("capacity", value)}
                  />
                  <EquipmentField
                    label="Общо устройства"
                    value={form.totalDevices}
                    type="number"
                    onChange={(value) => updateForm("totalDevices", value)}
                  />
                </>
              ) : null}

              {form.type === "Спринклерна система" ? (
                <>
                  <EquipmentSelectField
                    label="Тип система"
                    value={form.systemType}
                    options={["Мокра", "Суха", "Предварително действие", "Делужна"]}
                    onChange={(value) => updateForm("systemType", value)}
                  />
                  <EquipmentField
                    label="Брой спринклери"
                    value={form.totalDevices}
                    type="number"
                    onChange={(value) => updateForm("totalDevices", value)}
                  />
                  <EquipmentSelectField
                    label="Помпена група"
                    value={form.pumpGroup}
                    options={["Да", "Не"]}
                    onChange={(value) => updateForm("pumpGroup", value)}
                  />
                  <EquipmentField
                    label="Локация на помпената станция"
                    value={form.pumpStationLocation}
                    placeholder="Техническо помещение"
                    onChange={(value) => updateForm("pumpStationLocation", value)}
                  />
                </>
              ) : null}

              {showBrandModelSerial ? (
                <>
                {form.type === "Пожарогасител" ? (
                  <>
                    <EquipmentSelectField
                      label="Марка"
                      value={form.brand}
                      options={protocolCatalogs.extinguisherBrands}
                      onChange={(value) => updateForm("brand", value)}
                      onAddNew={() =>
                        openCatalogValueDialog("extinguisherBrands", "brand", "Марка")
                      }
                    />
                    <EquipmentSelectField
                      label="Модел"
                      value={form.model}
                      options={protocolCatalogs.extinguisherModels}
                      onChange={(value) => updateForm("model", value)}
                      onAddNew={() =>
                        openCatalogValueDialog("extinguisherModels", "model", "Модел")
                      }
                    />
                  </>
                ) : (
                  <>
                    <EquipmentSelectField
                      label="Марка"
                      value={form.brand}
                      options={protocolCatalogs.extinguisherBrands}
                      onChange={(value) => updateForm("brand", value)}
                      onAddNew={() =>
                        openCatalogValueDialog("extinguisherBrands", "brand", "Марка")
                      }
                    />
                    <EquipmentSelectField
                      label="Модел"
                      value={form.model}
                      options={protocolCatalogs.extinguisherModels}
                      onChange={(value) => updateForm("model", value)}
                      onAddNew={() =>
                        openCatalogValueDialog("extinguisherModels", "model", "Модел")
                      }
                    />
                  </>
                )}
                <EquipmentField
                  label="Сериен номер"
                  value={form.serialNumber}
                  onChange={(value) => updateForm("serialNumber", value)}
                />
                </>
              ) : null}

              {form.type === "Пожароизвестител" ? (
                <>
                  <EquipmentField
                    label="Адрес в системата"
                    value={form.systemAddress}
                    onChange={(value) => updateForm("systemAddress", value)}
                  />
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-400">
                      Дата на монтаж
                    </label>
                    <input
                      type="date"
                      value={form.installationDate}
                      onChange={(event) => updateForm("installationDate", event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                  </div>
                </>
              ) : null}

              {form.type === "Пожарогасител" ? (
                <>
                  <EquipmentSelectField
                    label="Вид пожарогасително вещество"
                    value={form.extinguishingAgentType}
                    options={protocolCatalogs.extinguishingAgentTypes}
                    onChange={(value) => updateForm("extinguishingAgentType", value)}
                    onAddNew={() =>
                      openCatalogValueDialog(
                        "extinguishingAgentTypes",
                        "extinguishingAgentType",
                        "Вид пожарогасително вещество"
                      )
                    }
                  />
                  <EquipmentSelectField
                    label="Търговско наименование"
                    value={form.extinguishingAgentTradeName}
                    options={protocolCatalogs.extinguishingAgentTradeNames}
                    onChange={(value) =>
                      updateForm("extinguishingAgentTradeName", value)
                    }
                    onAddNew={() =>
                      openCatalogValueDialog(
                        "extinguishingAgentTradeNames",
                        "extinguishingAgentTradeName",
                        "Търговско наименование"
                      )
                    }
                  />
                </>
              ) : null}

              {showCommonFields ? (
                <>
                  <EquipmentField
                    label="Локация"
                    value={form.location}
                    required
                    onChange={(value) => updateForm("location", value)}
                  />
                  <div className="space-y-2 md:col-span-2 lg:col-span-3">
                    <label className="text-xs font-black uppercase text-slate-400">
                      Бележки
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(event) => updateForm("notes", event.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                  </div>
                </>
              ) : null}
            </div>

            {saveState === "error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                {errorMessage || "Грешка при зареждане"}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeEquipmentForm}>
                Отказ
              </Button>
              <Button
                type="submit"
                disabled={
                  saveState === "saving" ||
                  !form.type.trim() ||
                  !form.location.trim() ||
                  !generatedName
                }
              >
                <Save size={17} />
                {saveState === "saving" ? "Записване..." : "Запази оборудване"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingCatalogAdd ? (
        <AddCatalogValueDialog
          label={pendingCatalogAdd.label}
          value={pendingCatalogValue}
          saving={catalogAddState === "saving"}
          onChange={setPendingCatalogValue}
          onCancel={closeCatalogValueDialog}
          onConfirm={confirmCatalogValueAdd}
        />
      ) : null}

      {viewingEquipment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black">Преглед на оборудване</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Пълни данни за позицията в този обект.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setViewingEquipment(null)} aria-label="Затвори">
                <X size={18} />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {equipmentDetailRows(viewingEquipment).map((row) => (
                <EquipmentDetailRow key={row.label} label={row.label} value={row.value} />
              ))}
              {viewingEquipment.description &&
              !isFireHydrantEquipment(viewingEquipment) &&
              !isSmokeControlEquipment(viewingEquipment) ? (
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2 lg:col-span-3">
                <div className="text-xs font-black uppercase text-slate-400">
                  Описание
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-800">
                  {viewingEquipment.description}
                </div>
              </div>
              ) : null}
              {viewingEquipment.notes ? (
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2 lg:col-span-3">
                <div className="text-xs font-black uppercase text-slate-400">
                  Бележки
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-800">
                  {viewingEquipment.notes}
                </div>
              </div>
              ) : null}
            </div>

            {isFireExtinguisherEquipment(viewingEquipment) ? (
              <>
                <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/40 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="text-sm font-black uppercase text-slate-500">
                        Стикер
                      </h4>
                      {viewingEquipment.stickerNumber ? (
                        <div className="mt-2 space-y-1 text-sm font-bold text-slate-700">
                          <div className="text-lg font-black text-slate-950">
                            Стикер №{viewingEquipment.stickerNumber}
                          </div>
                          <div>Статус: Активен</div>
                          <div>
                            Генериран:{" "}
                            {formatDateTimeValue(viewingEquipment.stickerGeneratedAt)}
                          </div>
                          <div>
                            Последно принтиран:{" "}
                            {viewingEquipment.stickerPrintedAt
                              ? formatDateTimeValue(viewingEquipment.stickerPrintedAt)
                              : "—"}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-sm font-bold text-slate-600">
                          Няма генериран стикер
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {viewingEquipment.stickerNumber ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => printEquipmentSticker(viewingEquipment)}
                          disabled={stickerActionState !== "idle"}
                        >
                          {stickerActionState === "printing" ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Printer size={16} />
                          )}
                          Принтирай стикер
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => generateEquipmentSticker(viewingEquipment)}
                          disabled={stickerActionState !== "idle"}
                        >
                          {stickerActionState === "generating" ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Printer size={16} />
                          )}
                          Генерирай стикер
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black uppercase text-slate-500">
                      История на обслужванията
                    </h4>
                    <Badge variant="neutral">{serviceHistory.length}</Badge>
                  </div>

                  {historyLoadState === "loading" ? (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">
                      Зареждане на история...
                    </div>
                  ) : null}

                  {historyLoadState === "error" ? (
                    <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                      Историята не беше заредена. Проверете SQL миграциите.
                    </div>
                  ) : null}

                  {historyLoadState !== "loading" && serviceHistory.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
                      Все още няма обслужвания за този пожарогасител.
                    </div>
                  ) : null}

                  {serviceHistory.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {serviceHistory.map((history) => (
                        <div
                          key={history.id}
                          className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1 text-sm font-bold text-slate-700">
                              <div className="text-base font-black text-slate-950">
                                {formatDateValue(history.serviceDate) || "Без дата"}
                              </div>
                              {history.protocolNumber ? (
                                <div>Протокол {history.protocolNumber}</div>
                              ) : null}
                              {history.stickerNumber ? (
                                <div>Стикер №{history.stickerNumber}</div>
                              ) : null}
                              {history.technician ? <div>{history.technician}</div> : null}
                              {history.serviceType ? <div>{history.serviceType}</div> : null}
                              <div>
                                Следваща проверка:{" "}
                                {formatDateValue(history.nextServiceDate) || "—"}
                              </div>
                            </div>
                            {history.stickerNumber ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  printEquipmentSticker(
                                    viewingEquipment,
                                    history.stickerNumber
                                  )
                                }
                                disabled={stickerActionState !== "idle"}
                              >
                                <Printer size={15} />
                                Принтирай стикер
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setViewingEquipment(null)}>
                Затвори
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const item = viewingEquipment;
                  setViewingEquipment(null);
                  openEditForm(item);
                }}
              >
                <Edit3 size={16} />
                Редактирай
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black">Изтриване на оборудване</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                  Сигурни ли сте, че искате да изтриете "{deleteTarget.name || deleteTarget.serialNumber || "това оборудване"}" завинаги?
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteTarget(null)} aria-label="Затвори">
                <X size={18} />
              </Button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
                Отказ
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteEquipment}
                disabled={deletingEquipmentId === deleteTarget.id}
              >
                <Trash2 size={16} />
                {deletingEquipmentId === deleteTarget.id ? "Изтриване..." : "Изтрий"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {saveState === "error" && !formOpen ? (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {errorMessage || "Грешка при зареждане"}
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed right-5 top-5 z-50 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-black text-emerald-700 shadow-xl">
          {toastMessage}
        </div>
      ) : null}

      {equipment.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
          <div className="text-sm font-bold text-slate-500">
            Няма добавено оборудване за този обект.
          </div>
        </div>
      ) : (
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse bg-white text-left">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
              <tr>
                <th className="px-4 py-4">Име</th>
                <th className="px-4 py-4">Тип</th>
                <th className="px-4 py-4">Локация</th>
                <th className="px-4 py-4">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {equipment.map((item) => (
                  <tr
                    key={item.id}
                    className="transition hover:bg-orange-50/40"
                  >
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-800">{item.name}</div>
                      {isFireExtinguisherEquipment(item) ? (
                        <div className="mt-1 space-y-0.5 text-xs font-bold text-slate-500">
                          {item.serialNumber ? <div>SN: {item.serialNumber}</div> : null}
                          <div>
                            Стикер:{" "}
                            {item.stickerNumber ? `№${item.stickerNumber}` : "няма"}
                          </div>
                          {item.nextCheckDate ? (
                            <div>
                              Следваща проверка: {formatDateValue(item.nextCheckDate)}
                            </div>
                          ) : null}
                        </div>
                      ) : item.serialNumber ? (
                        <div className="mt-1 text-xs font-bold text-slate-400">
                          Сериен номер: {item.serialNumber}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-700">
                      {item.type || "—"}
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-600">
                      {item.location || "—"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Преглед"
                          aria-label="Преглед"
                          onClick={() => setViewingEquipment(item)}
                          className="h-10 w-10 px-0"
                        >
                          <Eye size={17} />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Редактирай"
                          aria-label="Редактирай"
                          onClick={() => openEditForm(item)}
                          className="h-10 w-10 px-0"
                        >
                          <Edit3 size={15} />
                        </Button>
                        {isFireExtinguisherEquipment(item) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title="Клонирай"
                            aria-label="Клонирай"
                            onClick={() => openCloneEquipmentForm(item)}
                            className="h-10 w-10 px-0"
                          >
                            <ClipboardPlus size={15} />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          title="Изтрий"
                          aria-label="Изтрий"
                          onClick={() => setDeleteTarget(item)}
                          disabled={deletingEquipmentId === item.id}
                          className="h-10 w-10 px-0"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </Card>
  );
}

function ProtocolsTab() {
  const location = useLocationProfile();
  const { protocols, protocolsLoadState, refreshProtocols } = useLocationProtocols();

  useEffect(() => {
    window.addEventListener("focus", refreshProtocols);
    return () => window.removeEventListener("focus", refreshProtocols);
  }, [refreshProtocols]);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black">Протоколи</h3>
          <p className="mt-1 text-sm text-slate-500">
            История на протоколите, свързани с този обект.
          </p>
        </div>
        <Link
          href={`/protocols/new?object=${encodeURIComponent(location.qrCode)}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
        >
          <ClipboardPlus size={18} />
          Нов протокол
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {protocolsLoadState === "loading" && (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            Зареждане на протоколи...
          </div>
        )}
        {protocolsLoadState === "error" && (
          <div className="rounded-2xl bg-red-50 p-6 text-center text-sm font-bold text-red-600">
            Грешка при зареждане на протоколите.
          </div>
        )}
        {protocolsLoadState === "ready" && protocols.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
              <FileText size={22} />
            </div>
            <div className="mt-3 text-sm font-black text-slate-800">
              Все още няма създадени протоколи за този обект.
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Създайте нов протокол от бутона горе.
            </p>
          </div>
        )}
        {protocolsLoadState === "ready" && protocols.length > 0 && protocols.map((protocol) => (
            <Link
              key={protocol.id}
              href={`/protocols/view/${encodeURIComponent(protocol.protocolNumber)}`}
              className="group block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-orange-200 hover:bg-orange-50"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="font-black text-slate-900">
                        {protocol.protocolNumber}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-500">
                        {PROTOCOL_TYPE_LABEL[protocol.protocolType] ?? protocol.protocolType}
                      </div>
                    </div>
                    <Badge
                      variant={protocol.status === "completed" ? "success" : "neutral"}
                    >
                      {protocol.status === "completed" ? "Завършен" : "Чернова"}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
                    <div>
                      <span className="font-bold text-slate-400">Дата: </span>
                      <span className="font-black text-slate-700">
                        {formatDateValue(protocol.protocolDate)}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-400">Техник: </span>
                      <span className="font-black text-slate-700">
                        {protocol.technician || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-400">Клиент: </span>
                      <span className="font-black text-slate-700">
                        {protocol.clientName || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition group-hover:border-orange-200 group-hover:text-orange-700">
                  Отвори
                  <ArrowRight size={16} />
                </div>
              </div>
            </Link>
          ))}
      </div>
    </Card>
  );
}

function TasksTab() {
  const {
    upcomingActions,
    upcomingActionsLoadState,
    completeUpcomingAction,
  } = useLocationUpcomingActions();
  const [activeFilter, setActiveFilter] = useState<TaskQuickFilter>("all");
  const [expandedActionIds, setExpandedActionIds] = useState<Set<string>>(
    () => new Set()
  );
  const filteredActions = upcomingActions.filter((action) =>
    actionMatchesQuickFilter(action, activeFilter)
  );
  const filterCounts = {
    all: upcomingActions.length,
    problems: upcomingActions.filter((action) =>
      actionMatchesQuickFilter(action, "problems")
    ).length,
    planned: upcomingActions.filter((action) =>
      actionMatchesQuickFilter(action, "planned")
    ).length,
    overdue: upcomingActions.filter((action) =>
      actionMatchesQuickFilter(action, "overdue")
    ).length,
    done: upcomingActions.filter((action) =>
      actionMatchesQuickFilter(action, "done")
    ).length,
  };

  function toggleExpandedAction(actionId: string) {
    setExpandedActionIds((current) => {
      const next = new Set(current);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  }

  return (
    <Card className="overflow-hidden p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-black">Задачи</h3>
          <p className="mt-1 text-sm text-slate-500">
            Подробности за предстоящите посещения, действия и проблеми към обекта.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm">
          <SlidersHorizontal size={15} />
          Филтри
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", "problems", "planned", "overdue", "done"] as TaskQuickFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`h-9 rounded-xl border px-3.5 text-xs font-black transition ${
              activeFilter === filter
                ? "border-orange-300 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50"
            }`}
          >
            {taskQuickFilterLabels[filter]}{" "}
            <span
              className={
                activeFilter === filter ? "text-orange-500" : "text-slate-400"
              }
            >
              ({filterCounts[filter]})
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {upcomingActionsLoadState === "loading" ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            Зареждане на задачи...
          </div>
        ) : null}

        {upcomingActionsLoadState === "error" ? (
          <div className="rounded-2xl bg-red-50 p-6 text-center text-sm font-bold text-red-600">
            Грешка при зареждане на задачите.
          </div>
        ) : null}

        {upcomingActionsLoadState === "ready" && upcomingActions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
            Няма предстоящи задачи за този обект.
          </div>
        ) : null}

        {upcomingActionsLoadState === "ready" &&
        upcomingActions.length > 0 &&
        filteredActions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
            Няма задачи за избрания филтър.
          </div>
        ) : null}

        {upcomingActionsLoadState === "ready" && filteredActions.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden min-w-[1046px] grid-cols-[minmax(420px,1fr)_210px_170px_180px_44px_44px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase text-slate-500 lg:grid lg:items-center">
              <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3">
                <div />
                <div>Задача</div>
              </div>
              <div className="pl-0">Тип</div>
              <div className="pl-0">Следващо посещение</div>
              <div className="pl-0">Отговорник</div>
              <div />
              <div />
            </div>

            {filteredActions.map((action) => {
              const activityTitles = uniqueActionActivityTitles(action);
              const sourceLabel = actionSourceLabel(action);
              const isExpanded = expandedActionIds.has(action.id);
              const isProblem = action.source === "defect";
              const isOverdue = isOverdueAction(action);
              const TaskIcon = actionTypeIcon(action);
              const resolutionTechnician =
                action.resolvedBy && action.resolvedBy !== "current-user"
                  ? action.resolvedBy
                  : action.assignee;

              return (
                <div key={action.id}>
                  <div
                    className={`grid gap-3 border-b border-slate-100 px-4 py-3 text-sm transition last:border-b-0 lg:min-w-[1046px] lg:grid-cols-[minmax(420px,1fr)_210px_170px_180px_44px_44px] lg:items-center ${
                      isProblem ? "bg-red-50/45" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border ${actionIconClasses(action)}`}
                          aria-hidden="true"
                        >
                          <TaskIcon size={18} strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0">
                          <div className="font-black leading-5 text-slate-950">
                            {taskTableTitle(action)}
                          </div>
                          {sourceLabel ? (
                            <div className="mt-1 truncate text-xs font-bold text-slate-500">
                              Източник: {sourceLabel}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 lg:block">
                      <span className="text-xs font-black uppercase text-slate-400 lg:hidden">
                        Тип
                      </span>
                      {isProblem && isCompletedAction(action) ? (
                        <ResolvedProblemBadge />
                      ) : (
                        <Badge
                          variant={actionTypeVariant(action)}
                          className="whitespace-nowrap"
                        >
                          {actionTypeLabel(action)}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-2 lg:block">
                      <span className="text-xs font-black uppercase text-slate-400 lg:hidden">
                        Следващо посещение
                      </span>
                      {action.dueDate ? (
                        <div>
                          <div className={isOverdue ? "font-black text-red-600" : "font-black text-slate-900"}>
                            {formatDateValue(action.dueDate)}
                          </div>
                          <div className={isOverdue ? "mt-0.5 text-xs font-black text-red-600" : "mt-0.5 text-xs font-bold text-slate-500"}>
                            {isOverdue ? "Просрочена" : weekdayShort(action.dueDate)}
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold text-slate-400">—</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-slate-700 lg:block">
                      <span className="text-xs font-black uppercase text-slate-400 lg:hidden">
                        Отговорник
                      </span>
                      <span className="font-bold">{action.assignee || "—"}</span>
                    </div>

                    <div className="flex justify-end lg:block">
                      <button
                        type="button"
                        onClick={() => toggleExpandedAction(action.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-orange-700"
                        aria-label={isExpanded ? "Скрий детайли" : "Покажи детайли"}
                      >
                        <ChevronDown
                          size={17}
                          className={`transition ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>

                    <div className="flex justify-end lg:block">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-orange-700"
                        aria-label="Действия"
                      >
                        <MoreVertical size={17} />
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div
                      className={`min-w-[1046px] border-b border-slate-100 px-4 py-4 ${
                        isProblem ? "bg-red-50/25" : "bg-slate-50/80"
                      }`}
                    >
                      <div className="grid gap-4 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-black uppercase text-slate-400">
                              Описание
                            </div>
                            <div className="mt-1 whitespace-pre-line font-medium leading-6 text-slate-700">
                              {shouldShowActionDescription(action)
                                ? action.description
                                : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-black uppercase text-slate-400">
                              Бележки
                            </div>
                            <div className="mt-1 font-medium leading-6 text-slate-700">
                              {sourceLabel || "—"}
                            </div>
                          </div>
                          {isProblem && isCompletedAction(action) ? (
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                              <div className="text-xs font-black uppercase text-emerald-700">
                                Решение
                              </div>
                              <div className="mt-2 grid gap-2 text-sm font-bold text-slate-700 sm:grid-cols-3">
                                <div>
                                  <span className="text-slate-400">Начин:</span>{" "}
                                  {action.resolutionType || "Не е посочен"}
                                </div>
                                <div>
                                  <span className="text-slate-400">Дата:</span>{" "}
                                  {formatDateValue(action.resolutionDate || action.resolvedAt || "") || "—"}
                                </div>
                                <div>
                                  <span className="text-slate-400">Техник:</span>{" "}
                                  {resolutionTechnician || "Не е посочен"}
                                </div>
                              </div>
                              {action.resolutionNote ? (
                                <div className="mt-2 text-sm font-medium leading-6 text-emerald-900">
                                  <span className="font-black">Бележка:</span>{" "}
                                  {action.resolutionNote}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <div className="text-xs font-black uppercase text-slate-400">
                            Списък дейности
                          </div>
                          {activityTitles.length > 0 ? (
                            <ul className="mt-2 space-y-1.5 font-medium leading-6 text-slate-700">
                              {activityTitles.map((title) => (
                                <li key={`${action.id}-${title}`} className="flex gap-2">
                                  <span className="text-orange-500">•</span>
                                  <span>{title}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 font-medium text-slate-500">—</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <ProtocolSourceLink action={action} />
                        {isProblem && !isCompletedAction(action) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => completeUpcomingAction(action)}
                          >
                            <CheckCircle2 size={15} />
                            Маркирай като решен
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ContractsTab() {
  const location = useLocationProfile();
  const [contracts, setContracts] = useState<LocationContractDocument[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadContracts() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const [documentsResult, opportunitiesResult] = await Promise.all([
          supabase
            .from("saved_documents")
            .select("id, number, title, client, object, href, payload, updated_at")
            .eq("kind", "contract")
            .order("updated_at", { ascending: false }),
          supabase
            .from("sales_opportunities")
            .select("id, converted_object_id"),
        ]);

        if (documentsResult.error) throw new Error(documentsResult.error.message);

        const locationKeys = new Set(
          [location.databaseId, location.id, location.qrCode, location.name]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        );
        const convertedOpportunityIds = new Set(
          (((opportunitiesResult.data ?? []) as { id?: string | null; converted_object_id?: string | null }[])
            .filter((row) => locationKeys.has(String(row.converted_object_id || "").trim()))
            .map((row) => `contract-${String(row.id)}`))
        );

        const mapped = ((documentsResult.data ?? []) as {
          id: string;
          number?: string | null;
          title?: string | null;
          client?: string | null;
          object?: string | null;
          href?: string | null;
          payload?: unknown;
          updated_at?: string | null;
        }[])
          .filter((row) => {
            const payload = isRecord(row.payload) ? row.payload : {};
            const contract = isRecord(payload.contract) ? payload.contract : {};
            const keys = [
              payload.locationId,
              payload.locationQrCode,
              payload.convertedObjectId,
              contract.object,
              row.object,
            ].map((value) => String(value || "").trim());

            return convertedOpportunityIds.has(String(row.id)) || keys.some((key) => key && locationKeys.has(key));
          })
          .map((row) => {
            const payload = isRecord(row.payload) ? row.payload : {};
            const contract = isRecord(payload.contract) ? payload.contract : {};
            const status = payload.status === "accepted" ? "Договор приет" : "Чернова";
            const href = String(row.href || `/sales/contract/${String(row.id).replace(/^contract-/, "")}`);
            const createdAt = textValue(contract, ["date", "createdAt", "created_at"]) || String(row.updated_at || "").slice(0, 10);

            return {
              id: String(row.id),
              number: String(row.number || contract.number || "Без номер"),
              title: String(row.title || `Договор ${row.number || ""}`.trim()),
              client: String(row.client || contract.client || location.client || "Без клиент"),
              object: String(row.object || contract.object || location.name || "Без обект"),
              href: `${href}${href.includes("?") ? "&" : "?"}mode=view`,
              status,
              createdAt,
              expiresAt: addYearsToDateValue(createdAt, 1),
              updatedAt: String(row.updated_at || ""),
            };
          });

        if (!cancelled) {
          setContracts(mapped);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    loadContracts();

    return () => {
      cancelled = true;
    };
  }, [location.client, location.databaseId, location.id, location.name, location.qrCode]);

  if (loadState === "loading") {
    return (
      <Card className="flex min-h-40 items-center justify-center p-8">
        <Loader2 className="animate-spin text-orange-500" size={26} />
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card className="p-8">
        <div className="text-sm font-bold text-red-600">Договорите не могат да се заредят.</div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-950">Договори</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Договори, свързани с този обект.
          </p>
        </div>
        <Badge variant="neutral">{contracts.length}</Badge>
      </div>

      {contracts.length ? (
        <div className="mt-5 grid gap-3">
          {contracts.map((contract) => (
            <div key={contract.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(240px,1.2fr)_minmax(260px,0.9fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-black text-slate-950">{contract.number}</div>
                  <Badge variant={contract.status === "Договор приет" ? "success" : "neutral"}>{contract.status}</Badge>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-600">{contract.client}</div>
                <div className="mt-0.5 text-xs font-medium text-slate-400">{contract.object}</div>
              </div>
              <div className="grid gap-3 border-t border-slate-200 pt-3 text-xs font-bold text-slate-500 sm:grid-cols-2 md:border-l md:border-t-0 md:py-1 md:pl-5">
                <div>
                  <div className="uppercase text-slate-400">Създаден на</div>
                  <div className="mt-1 text-sm text-slate-800">{formatDateValue(contract.createdAt) || "—"}</div>
                </div>
                <div>
                  <div className="uppercase text-slate-400">Изтича на</div>
                  <div className="mt-1 text-sm text-slate-800">{formatDateValue(contract.expiresAt) || "—"}</div>
                </div>
              </div>
              <Link
                href={contract.href}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 md:justify-self-end"
              >
                <ExternalLink size={16} />
                Отвори договор
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
          Няма свързани договори.
        </div>
      )}
    </Card>
  );
}

function MediaTab() {
  const location = useLocationProfile();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [media, setMedia] = useState<ProtocolPhotoRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [description, setDescription] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<ConfirmationDialogState>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refreshMedia = useCallback(async () => {
    setLoadState("loading");
    try {
      const rows = await readProtocolPhotosForObject({
        objectId: location.databaseId,
        objectCode: location.qrCode,
      });
      setMedia(rows);
      setLoadState("ready");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при зареждане");
      setLoadState("error");
    }
  }, [location.databaseId, location.qrCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshMedia();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshMedia]);

  async function uploadObjectMedia(fileList: FileList | null) {
    if (!fileList?.length) return;

    setUploadState("uploading");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const objectId = location.databaseId || location.qrCode;

      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith("image/")) continue;

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const storagePath = `${objectId}/object-media/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(protocolPhotosBucket)
          .upload(storagePath, file, {
            contentType: file.type || "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw new Error(uploadError.message);

        const fileUrl = supabase.storage
          .from(protocolPhotosBucket)
          .getPublicUrl(storagePath).data.publicUrl;

        const { error: insertError } = await supabase
          .from("protocol_photos")
          .insert({
            protocol_id: null,
            protocol_number: "",
            object_id: objectId,
            uploaded_by: "",
            file_url: fileUrl,
            storage_path: storagePath,
            description: description.trim(),
          });

        if (insertError) throw new Error(insertError.message);
      }

      setDescription("");
      setUploadState("idle");
      await refreshMedia();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Снимките не бяха качени");
      setUploadState("error");
    }
  }

  async function deletePhoto(photo: ProtocolPhotoRecord) {
    setDeleteBusy(true);
    try {
      await deleteProtocolPhoto(photo);
      setMedia((current) => current.filter((item) => item.id !== photo.id));
      setDeleteDialog(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Снимката не беше изтрита");
      setLoadState("error");
    } finally {
      setDeleteBusy(false);
    }
  }

  function handleDelete(photo: ProtocolPhotoRecord) {
    setDeleteDialog({
      title: "Изтриване на снимка",
      message: "Сигурни ли сте, че искате да изтриете \"тази снимка\" завинаги?",
      confirmLabel: "Изтрий",
      variant: "danger",
      onConfirm: () => deletePhoto(photo),
    });
  }

  return (
    <>
      <ConfirmationDialog
        dialog={deleteDialog}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setDeleteDialog(null);
        }}
      />
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-black">Медия</h3>
          <p className="mt-1 text-sm text-slate-500">
            Снимки от протоколи и директно качени снимки за този обект.
          </p>
        </div>
        <Badge variant="orange">{media.length} снимки</Badge>
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-slate-400">
              Описание / причина
            </label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Снимка на спринклерна система"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                uploadObjectMedia(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                uploadObjectMedia(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadState === "uploading"}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={17} />
              Избери снимки
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={uploadState === "uploading"}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={17} />
              Снимай
            </Button>
          </div>
        </div>
        {uploadState === "error" ? (
          <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>

      {loadState === "loading" ? (
        <div className="mt-5 rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
          Зареждане на снимки...
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="mt-5 rounded-2xl bg-red-50 p-6 text-center text-sm font-bold text-red-600">
          {errorMessage || "Грешка при зареждане на снимките."}
        </div>
      ) : null}

      {loadState === "ready" && media.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <div className="text-sm font-bold text-slate-500">
            Все още няма снимки за този обект.
          </div>
        </div>
      ) : null}

      {loadState === "ready" && media.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {media.map((photo) => {
            const protocolLabel = photo.protocolNumber
              ? `${PROTOCOL_TYPE_LABEL[photo.protocolType ?? ""] ?? photo.protocolType ?? "Протокол"} – ${photo.protocolNumber}`
              : "Обектова снимка";

            return (
              <div
                key={photo.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <a href={photo.fileUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.fileUrl}
                    alt={photo.description || protocolLabel}
                    className="aspect-[4/3] w-full bg-slate-50 object-contain"
                  />
                </a>
                <div className="p-4">
                  <div className="text-sm font-black text-slate-800">
                    {protocolLabel}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-500">
                    {photo.description || "Без описание"}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-1 text-xs font-bold text-slate-400">
                    <span>Качена: {formatDateValue(photo.createdAt)}</span>
                    <span>Техник: {photo.technician || photo.uploadedBy || "—"}</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <a
                      href={photo.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    >
                      Отвори
                    </a>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(photo)}
                    >
                      <Trash2 size={14} />
                      Изтрий
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      </Card>
    </>
  );
}

export default function LocationProfilePage() {
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [activeTab, setActiveTab] = useState("Общо");
  const [locationProfile, setLocationProfile] =
    useState<LocationProfile | null>(null);
  const [locationEquipment, setLocationEquipment] = useState<EquipmentItem[]>(
    []
  );
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "not-found" | "error"
  >("loading");
  const [deleteState, setDeleteState] = useState<"idle" | "deleting">("idle");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<LocationEditFormState>({
    clientId: "",
    objectType: "",
    name: "",
    address: "",
    region: "",
    qrCode: "",
  });
  const [editClients, setEditClients] = useState<ClientOption[]>([]);
  const [protocolSettings, setProtocolSettings] = useState<ProtocolSettings>(
    defaultProtocolSettings
  );
  const [addingObjectType, setAddingObjectType] = useState(false);
  const [newObjectType, setNewObjectType] = useState("");
  const [editState, setEditState] = useState<"idle" | "saving" | "error">(
    "idle"
  );
  const [editErrorMessage, setEditErrorMessage] = useState("");
  const [locationProtocols, setLocationProtocols] = useState<DbProtocol[]>([]);
  const [protocolsLoadState, setProtocolsLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [upcomingActions, setUpcomingActions] = useState<UpcomingObjectAction[]>([]);
  const [upcomingActionsLoadState, setUpcomingActionsLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [toastMessage, setToastMessage] = useState("");
  const [confirmationDialog, setConfirmationDialog] =
    useState<ConfirmationDialogState>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [problemResolutionForm, setProblemResolutionForm] = useState({
    resolutionType: "Ремонт",
    note: "",
    date: new Date().toISOString().slice(0, 10),
    technician: "",
  });

  function updateEditForm(key: keyof LocationEditFormState, value: string) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  const availableObjectTypes = objectTypeOptions(
    protocolSettings,
    editForm.objectType
  );

  async function addObjectTypeToEditForm() {
    const value = newObjectType.trim();
    if (!value) return;

    const nextSettings = {
      ...protocolSettings,
      objectTypes: uniqueValues([...(protocolSettings.objectTypes ?? []), value]),
    };

    try {
      await writeProtocolSettingsToSupabase(nextSettings);
      setProtocolSettings(nextSettings);
      updateEditForm("objectType", value);
      setNewObjectType("");
      setAddingObjectType(false);
    } catch {
      setEditErrorMessage("Типът обект не беше записан в настройките.");
      setEditState("error");
    }
  }

  function openEditForm() {
    if (!locationProfile) return;

    setEditForm({
      clientId: locationProfile.clientId,
      objectType: locationProfile.objectType,
      name: locationProfile.name,
      address: locationProfile.address,
      region: locationProfile.region,
      qrCode: locationProfile.qrCode,
    });
    setEditState("idle");
    setEditErrorMessage("");
    setAddingObjectType(false);
    setNewObjectType("");
    setEditOpen(true);
  }

  function closeEditForm() {
    setEditOpen(false);
    setEditState("idle");
    setEditErrorMessage("");
    setAddingObjectType(false);
    setNewObjectType("");
  }

  useEffect(() => {
    if (!toastMessage) return;

    const timer = window.setTimeout(() => setToastMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  async function resolveUpcomingAction(action: UpcomingObjectAction) {
    setConfirmationBusy(true);
    const resolution = {
      ...problemResolutionForm,
      technician: problemResolutionForm.technician || action.assignee,
    };
    try {
      await resolveDefectTask(action.id, resolution);
      setUpcomingActions((current) =>
        current.map((item) =>
          item.id === action.id
            ? {
                ...item,
                status: "RESOLVED",
                resolutionType: resolution.resolutionType,
                resolutionNote: resolution.note,
                resolutionDate: resolution.date,
                resolvedBy: resolution.technician,
                resolvedAt: new Date().toISOString(),
              }
            : item
        )
      );
      setToastMessage("Проблемът е маркиран като решен.");
      setConfirmationDialog(null);
    } catch {
      setToastMessage("Проблемът не беше обновен.");
    } finally {
      setConfirmationBusy(false);
    }
  }

  async function completeUpcomingAction(action: UpcomingObjectAction) {
    if (action.source !== "defect") return;

    const nextResolutionForm = {
      ...problemResolutionForm,
      technician: action.assignee || problemResolutionForm.technician,
      date: new Date().toISOString().slice(0, 10),
    };
    setProblemResolutionForm(nextResolutionForm);
    setConfirmationDialog({
      title: "Разрешаване на проблем",
      message: `Маркирай проблема "${action.title}" като решен?`,
      confirmLabel: "Маркирай като решен",
      content: (
        <div className="space-y-3">
          <label className="block text-xs font-black uppercase text-slate-500">
            Начин на решение
            <select
              defaultValue={nextResolutionForm.resolutionType}
              onChange={(event) =>
                setProblemResolutionForm((current) => ({
                  ...current,
                  resolutionType: event.target.value,
                }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              {["Ремонт", "Смяна на оборудване", "Настройка", "Фалшива тревога", "Друго"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-black uppercase text-slate-500">
            Бележка
            <textarea
              defaultValue={nextResolutionForm.note}
              onChange={(event) =>
                setProblemResolutionForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black uppercase text-slate-500">
              Дата
              <Input
                type="date"
                defaultValue={nextResolutionForm.date}
                onChange={(event) =>
                  setProblemResolutionForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="mt-1"
              />
            </label>
            <label className="block text-xs font-black uppercase text-slate-500">
              Техник
              <Input
                defaultValue={nextResolutionForm.technician}
                onChange={(event) =>
                  setProblemResolutionForm((current) => ({
                    ...current,
                    technician: event.target.value,
                  }))
                }
                className="mt-1"
              />
            </label>
          </div>
        </div>
      ),
      onConfirm: () => resolveUpcomingAction(action),
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadLocation() {
      if (!routeId) {
        setLoadState("not-found");
        return;
      }

      setLoadState("loading");

      try {
        const supabase = createSupabaseBrowserClient();
        const [locationResult, clientsResult] = await Promise.all([
          supabase.from("locations").select("*").eq("qr_code", routeId).maybeSingle(),
          supabase.from("clients").select("*").order("name", { ascending: true }),
        ]);
        let locationRow = locationResult.data;
        let locationError = locationResult.error;

        if (!locationRow && !locationError && isUuidValue(routeId)) {
          const fallbackResult = await supabase
            .from("locations")
            .select("*")
            .eq("id", routeId)
            .maybeSingle();
          locationRow = fallbackResult.data;
          locationError = fallbackResult.error;
        }

        if (clientsResult.error) {
          setLoadState("error");
          return;
        }

        setEditClients(
          ((clientsResult.data as DataRecord[]) ?? []).map((row) => ({
            id: textValue(row, ["id"]),
            name: textValue(row, ["name", "organization", "company_name"]),
          }))
        );

        const localSettings = readProtocolSettings();
        setProtocolSettings(localSettings);
        try {
          setProtocolSettings(await readProtocolSettingsFromSupabase());
        } catch {
          setProtocolSettings(localSettings);
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
        let clientRecord: DataRecord | null = null;

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

        let { data: equipmentRows, error: equipmentError } = await supabase
          .from("equipment")
          .select("*")
          .eq("location_id", locationId)
          .order("created_at", { ascending: true });

        if (!isMounted) return;

        if (equipmentError) {
          const fallbackResult = await supabase
            .from("equipment")
            .select("*")
            .eq("location_id", locationId);

          if (!isMounted) return;

          equipmentRows = fallbackResult.data;
          equipmentError = fallbackResult.error;
        }

        if (equipmentError) {
          equipmentRows = [];
        }

        const mappedLocation = mapLocation(locationRecord, clientRecord, routeId);
        setLocationProfile(mappedLocation);
        setLocationEquipment(mapEquipment((equipmentRows as DataRecord[]) ?? []));
        setLoadState("ready");
      } catch {
        if (isMounted) {
          setLoadState("error");
        }
      }
    }

    loadLocation();

    return () => {
      isMounted = false;
    };
  }, [routeId]);

  useEffect(() => {
    let isMounted = true;

    async function loadUpcomingActions() {
      if (!locationProfile) return;

      setUpcomingActionsLoadState("loading");

      try {
        const supabase = createSupabaseBrowserClient();
        const seen = new Set<string>();
        const rows: DataRecord[] = [];

        function mergeRows(nextRows: DataRecord[] | null) {
          for (const row of nextRows ?? []) {
            const id = textValue(row, ["id"]);
            if (id && !seen.has(id)) {
              seen.add(id);
              rows.push(row);
            }
          }
        }

        const objectCodes = [
          locationProfile.qrCode,
          locationProfile.databaseId,
          locationProfile.id,
        ].filter(Boolean);

        for (const objectCode of objectCodes) {
          const { data, error } = await supabase
            .from("service_tasks")
            .select("*")
            .eq("object_code", objectCode)
            .in("status", ["planned", "open", "done", "completed", "resolved"])
            .order("due_date", { ascending: true });

          if (!isMounted) return;
          if (error) throw new Error(error.message);
          mergeRows((data as DataRecord[]) ?? []);
        }

        if (locationProfile.name) {
          const { data, error } = await supabase
            .from("service_tasks")
            .select("*")
            .eq("object_name", locationProfile.name)
            .in("status", ["planned", "open", "done", "completed", "resolved"])
            .order("due_date", { ascending: true });

          if (!isMounted) return;
          if (error) throw new Error(error.message);
          mergeRows((data as DataRecord[]) ?? []);
        }

        const displayRows = collapseReplacedEquipmentRows(rows, locationProfile);

        displayRows.sort((first, second) =>
          textValue(first, ["due_date"]).localeCompare(textValue(second, ["due_date"]))
        );

        const problemIds = uniqueValues(
          displayRows.map((row) => textValue(row, ["related_problem_id"]))
        );
        const problemsById = new Map<string, DataRecord>();

        if (problemIds.length > 0) {
          const { data: problemRows, error: problemError } = await supabase
            .from("problems")
            .select("id,resolution_type,resolution_note,resolution_date,resolved_at,resolved_by,assigned_to,status")
            .in("id", problemIds);

          if (!isMounted) return;

          if (!problemError) {
            for (const problem of (problemRows as DataRecord[]) ?? []) {
              const id = textValue(problem, ["id"]);
              if (id) problemsById.set(id, problem);
            }
          }
        }

        const protocolRefs = uniqueValues(
          displayRows.flatMap((row) => taskProtocolRefs(row))
        );
        const techniciansByProtocolRef = new Map<string, string>();

        function mergeProtocolTechnicians(nextRows: DataRecord[] | null) {
          for (const row of nextRows ?? []) {
            const technician = textValue(row, ["technician", "technician_id"]);
            if (!technician) continue;

            for (const ref of [
              textValue(row, ["id"]),
              textValue(row, ["protocol_number", "number"]),
            ]) {
              if (ref) techniciansByProtocolRef.set(ref, technician);
            }
          }
        }

        if (protocolRefs.length > 0) {
          const protocolQueries = await Promise.all([
            supabase
              .from("protocols")
              .select("id, protocol_number, number, technician")
              .in("protocol_number", protocolRefs),
            supabase
              .from("protocols")
              .select("id, protocol_number, number, technician")
              .in("number", protocolRefs),
            supabase
              .from("protocols")
              .select("id, protocol_number, number, technician")
              .in("id", protocolRefs),
          ]);

          if (!isMounted) return;

          for (const result of protocolQueries) {
            if (!result.error) {
              mergeProtocolTechnicians((result.data as DataRecord[]) ?? []);
            }
          }

          if (typeof window !== "undefined") {
            try {
              const parsed = JSON.parse(window.localStorage.getItem(PROTOCOLS_LS_KEY) || "[]");
              if (Array.isArray(parsed)) {
                for (const item of parsed) {
                  if (!item || typeof item !== "object") continue;
                  const record = item as DataRecord;
                  const protocolNumber = textValue(record, ["number", "protocolNumber"]);
                  const technician = textValue(record, ["technician"]);
                  if (protocolNumber && technician && protocolRefs.includes(protocolNumber)) {
                    techniciansByProtocolRef.set(protocolNumber, technician);
                  }
                }
              }
            } catch {
              // Local protocol fallback is best-effort only.
            }
          }
        }

        const groupedActions = new Map<string, UpcomingObjectAction>();

        for (const row of displayRows) {
          const title = textValue(row, ["title"]) || "Предстоящо действие";
          const dueDate = textValue(row, ["due_date"]);
          const objectId =
            textValue(row, ["object_id", "object_code"]) ||
            locationProfile.databaseId ||
            locationProfile.qrCode ||
            locationProfile.name;
          const sourceProtocolId =
            textValue(row, ["source_protocol_id", "protocol_id"]) ||
            textValue(row, ["source_protocol_number"]) ||
            textValue(row, ["source_label"]);
          const sourceProtocolRow = textValue(row, ["source_protocol_row"]);
          const sourceProtocolNumber = textValue(row, ["source_protocol_number"]);
          const sourceProtocolType = textValue(row, ["source_protocol_type"]);
          const sourceLabel =
            textValue(row, ["source_label"]) ||
            (sourceProtocolNumber ? `Протокол №${sourceProtocolNumber}` : "");
          const activities = taskActivities(row["activities"], title);
          const relatedProblemId = textValue(row, ["related_problem_id"]);
          const relatedProblem = relatedProblemId
            ? problemsById.get(relatedProblemId)
            : undefined;
          const taskType = textValue(row, ["task_type"]) || "Планирано посещение";
          const normalizedTaskType = taskType.trim().toLowerCase();
          const status = textValue(row, ["status"]) || "planned";
          const normalizedStatus = status.trim().toLowerCase();
          const isSubscriptionProtocol =
            sourceProtocolType ===
              "Абонаментно обслужване / профилактичен преглед" ||
            sourceProtocolType === "subscription";
          const looksLikeLegacyProtocolProblem =
            !dueDate &&
            Boolean(sourceProtocolRow) &&
            isSubscriptionProtocol &&
            normalizedStatus !== "completed" &&
            normalizedStatus !== "done" &&
            normalizedStatus !== "resolved";
          const isDefect =
            normalizedTaskType === "defect" ||
            normalizedTaskType === "problem" ||
            textValue(row, ["related_problem_id"]) !== "" ||
            looksLikeLegacyProtocolProblem;
          const groupKey = taskGroupKey(row, locationProfile, isDefect);
          const existing = groupedActions.get(groupKey);
          const nextAction: UpcomingObjectAction = {
            id: textValue(row, ["id"]),
            title: isDefect
              ? title
              : title,
            description: textValue(row, ["description"]),
            taskType,
            activities,
            objectId,
            dueDate,
            status: isDefect && !["completed", "done", "resolved"].includes(normalizedStatus)
              ? "open"
              : status,
            sourceProtocolId,
            sourceLabel,
            sourceProtocolNumber,
            sourceProtocolRow,
            sourceProtocolType,
            recurrenceMonths: Number(row["recurrence_months"] ?? 0) || undefined,
            relatedProblemId,
            resolutionType:
              textValue(row, ["resolution_type"]) ||
              textValue(relatedProblem, ["resolution_type"]),
            resolutionNote:
              textValue(row, ["resolution_note"]) ||
              textValue(relatedProblem, ["resolution_note"]),
            resolutionDate:
              textValue(row, ["resolution_date"]) ||
              textValue(relatedProblem, ["resolution_date"]),
            resolvedBy:
              textValue(row, ["resolved_by"]) ||
              textValue(relatedProblem, ["resolved_by"]) ||
              textValue(relatedProblem, ["assigned_to"]),
            resolvedAt:
              textValue(row, ["resolved_at"]) ||
              textValue(relatedProblem, ["resolved_at"]),
            source: isDefect
              ? "defect"
              : isSubscriptionProtocol
                ? "subscription_protocol"
                : "service_protocol",
            createdAt: textValue(row, ["created_at", "created_at_ms"]),
            assignee: protocolTechnicianForTask(row, techniciansByProtocolRef),
          };

          if (existing) {
            mergeActivityList(existing.activities, activities);
            existing.description = mergeDescriptions(
              existing.description,
              nextAction.description
            );
            continue;
          }

          groupedActions.set(groupKey, nextAction);
        }

        setUpcomingActions(
          Array.from(groupedActions.values()).sort((first, second) =>
            first.dueDate.localeCompare(second.dueDate)
          )
        );
        setUpcomingActionsLoadState("ready");
      } catch {
        if (isMounted) {
          setUpcomingActions([]);
          setUpcomingActionsLoadState("error");
        }
      }
    }

    loadUpcomingActions();

    return () => {
      isMounted = false;
    };
  }, [locationProfile]);

  const loadProtocols = useCallback(async () => {
    if (!locationProfile) return;
    setProtocolsLoadState("loading");

    // Select both naming conventions: older tables use "type"/"date"/"number",
    // newer ones use "protocol_type"/"protocol_date"/"protocol_number".
    const COLS =
      "id, protocol_number, number, protocol_type, type, protocol_date, date, status, object_code, client_name, object_name, technician, created_at";

    try {
      const supabase = createSupabaseBrowserClient();
      const locationId = locationProfile.databaseId; // UUID of the location row
      const qrCode = locationProfile.qrCode;         // qr_code value (e.g. OBJ-123456)

      // Debug: log what we're searching by so it's visible in DevTools
      console.log("[protocols] loading for location", { locationId, qrCode });

      // Collect rows from multiple queries and deduplicate by id.
      // A single .or() with a UUID column can silently return 0 rows in some
      // Supabase/PostgREST versions, so we use three targeted .eq() calls.
      const seen = new Set<string>();
      const allRows: DataRecord[] = [];
      const deletedProtocolNumbers =
        typeof window !== "undefined" ? readDeletedProtocolNumbers() : new Set<string>();

      function mergeRows(rows: DataRecord[] | null) {
        for (const row of rows ?? []) {
          const protocolNumber = textValue(row, ["protocol_number", "number"]);
          if (protocolNumber && deletedProtocolNumbers.has(protocolNumber)) {
            continue;
          }
          const rowId = String(row["id"] ?? "");
          if (rowId && !seen.has(rowId)) {
            seen.add(rowId);
            allRows.push(row);
          }
        }
      }

      // 1. Match by location_id UUID (most reliable for newly created protocols)
      if (locationId) {
        const { data, error } = await supabase
          .from("protocols")
          .select(COLS)
          .eq("location_id", locationId)
          .order("protocol_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);
        console.log("[protocols] by location_id →", data?.length ?? 0, error?.message);
        if (error) { setProtocolsLoadState("error"); return; }
        mergeRows(data as DataRecord[]);
      }

      // 2. Match by object_code = QR code (protocols stored with the qr_code string)
      if (qrCode) {
        const { data, error } = await supabase
          .from("protocols")
          .select(COLS)
          .eq("object_code", qrCode)
          .order("protocol_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);
        console.log("[protocols] by object_code(qr) →", data?.length ?? 0, error?.message);
        if (error) { setProtocolsLoadState("error"); return; }
        mergeRows(data as DataRecord[]);
      }

      // 3. Match by object_code = UUID (fallback: some records store the location
      //    UUID as object_code when the qr_code field was empty at creation time)
      if (locationId && locationId !== qrCode) {
        const { data, error } = await supabase
          .from("protocols")
          .select(COLS)
          .eq("object_code", locationId)
          .order("protocol_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);
        console.log("[protocols] by object_code(uuid) →", data?.length ?? 0, error?.message);
        // Non-fatal: ignore errors here, it's just a fallback
        if (!error) mergeRows(data as DataRecord[]);
      }

      // 4. Also read localStorage protocols that match this location.
      //    These are protocols saved by the form but whose Supabase insert may
      //    have failed silently (e.g. missing DB column).  We include them so
      //    the object page always reflects what the user actually saved.
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(PROTOCOLS_LS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              for (const p of parsed) {
                const num = String(p.number ?? "");
                if (!num) continue;
                if (deletedProtocolNumbers.has(num)) continue;
                // Skip if already found in Supabase (dedup by protocol number)
                if (allRows.some((r) => String(r["protocol_number"]) === num)) continue;
                // Match by object_code = QR code, object_code = UUID, or object name
                const matches =
                  (p.objectCode && p.objectCode === qrCode) ||
                  (p.objectCode && p.objectCode === locationId) ||
                  (p.objectName && locationProfile.name && p.objectName === locationProfile.name);
                if (!matches) continue;
                // Convert localStorage record to DataRecord shape expected by mergeRows
                const syntheticRow: DataRecord = {
                  id: `ls:${num}`,
                  protocol_number: num,
                  protocol_type: PROTOCOL_TYPE_FROM_LABEL[String(p.protocolType ?? "")] ?? "service",
                  protocol_date: String(p.date ?? ""),
                  status: String(p.status ?? "draft"),
                  object_code: String(p.objectCode ?? ""),
                  client_name: String(p.client ?? ""),
                  object_name: String(p.objectName ?? ""),
                  technician: String(p.technician ?? ""),
                  created_at: p.savedAt ? new Date(Number(p.savedAt)).toISOString() : "",
                };
                allRows.push(syntheticRow);
                console.log("[protocols] from localStorage:", num);
              }
            }
          }
        } catch {
          // localStorage read errors are non-fatal
        }
      }

      // Sort merged list: newest protocol_date first, then newest created_at
      allRows.sort((a, b) => {
        const pd = String(b["protocol_date"] ?? "").localeCompare(String(a["protocol_date"] ?? ""));
        if (pd !== 0) return pd;
        return String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""));
      });

      const trimmed = allRows.slice(0, 50);
      console.log("[protocols] total after merge:", trimmed.length, trimmed.map((r) => r["id"]));

      const mapped: DbProtocol[] = trimmed.map((row) => ({
        id: textValue(row, ["id"]),
        protocolNumber: textValue(row, ["protocol_number", "number"]),
        protocolType: textValue(row, ["protocol_type", "type"]),
        protocolDate: textValue(row, ["protocol_date", "date"]),
        status: textValue(row, ["status"]),
        objectCode: textValue(row, ["object_code"]),
        clientName: textValue(row, ["client_name"]),
        objectName: textValue(row, ["object_name"]),
        technician: textValue(row, ["technician"]),
        createdAt: textValue(row, ["created_at"]),
      }));

      setLocationProtocols(mapped);
      setProtocolsLoadState("ready");
    } catch (err) {
      console.error("[protocols] unexpected error:", err);
      setProtocolsLoadState("error");
    }
  }, [locationProfile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProtocols();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProtocols]);

  async function handleUpdateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationProfile || editState === "saving" || !editForm.name.trim()) {
      return;
    }

    setEditState("saving");
    setEditErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const nextQrCode =
        editForm.qrCode.trim() ||
        locationProfile.qrCode ||
        locationProfile.databaseId;
      const nextAddress = editForm.address.trim();
      const geocoded = nextAddress ? await geocodeAddress(nextAddress) : null;
      const updates: Record<string, unknown> = {
        client_id: editForm.clientId,
        object_type: editForm.objectType.trim(),
        name: editForm.name.trim(),
        address: nextAddress,
        region: "",
        qr_code: nextQrCode,
      };
      if (geocoded) {
        updates.latitude = geocoded.latitude;
        updates.longitude = geocoded.longitude;
        updates.geocoded_address = geocoded.displayName;
        updates.geocoded_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from("locations")
        .update(updates)
        .eq("id", locationProfile.databaseId)
        .select("*")
        .single();

      if (error || !data) {
        setEditErrorMessage(
          error?.message || "Обектът не беше обновен"
        );
        setEditState("error");
        return;
      }

      const updatedLocation = mapLocation(
        data as DataRecord,
        {
          id: editForm.clientId,
          name:
            editClients.find((client) => client.id === editForm.clientId)?.name ||
            locationProfile.client,
          contact_person: locationProfile.contact,
          phone: locationProfile.phone,
        },
        nextQrCode
      );

      setLocationProfile(updatedLocation);
      setEditOpen(false);
      setEditState("idle");

      if (nextQrCode !== routeId) {
        router.replace(`/locations/${encodeURIComponent(nextQrCode)}`);
      }
    } catch {
      setEditErrorMessage("Грешка при връзка със Supabase");
      setEditState("error");
    }
  }

  async function handleDeleteLocation() {
    if (!locationProfile || deleteState === "deleting") return;

    setConfirmationDialog({
      title: "Изтриване на обект",
      message: `Сигурни ли сте, че искате да изтриете "${locationProfile.name}" завинаги?`,
      confirmLabel: "Изтрий",
      variant: "danger",
      onConfirm: deleteLocation,
    });
  }

  async function deleteLocation() {
    if (!locationProfile || deleteState === "deleting") return;
    setConfirmationBusy(true);
    setDeleteState("deleting");

    try {
      const supabase = createSupabaseBrowserClient();

      await supabase
        .from("location_services")
        .delete()
        .eq("location_id", locationProfile.databaseId);
      await supabase
        .from("equipment")
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("location_id", locationProfile.databaseId);

      const { error } = await supabase
        .from("locations")
        .delete()
        .eq("id", locationProfile.databaseId);

      if (error) {
        setLoadState("error");
        setDeleteState("idle");
        setConfirmationBusy(false);
        return;
      }

      setConfirmationDialog(null);
      router.push("/locations");
    } catch {
      setLoadState("error");
      setDeleteState("idle");
      setConfirmationBusy(false);
    }
  }

  if (loadState === "loading") {
    return (
      <AppShell
        title="Обекти"
        description="Профил на обект, проверки, протоколи и сервизни дейности"
        showSearch={false}
      >
        <Card className="p-8 text-center text-sm font-bold text-slate-500">
          Loading...
        </Card>
      </AppShell>
    );
  }

  if (loadState === "error") {
    return (
      <AppShell
        title="Обекти"
        description="Профил на обект, проверки, протоколи и сервизни дейности"
        showSearch={false}
      >
        <Card className="p-8 text-center text-sm font-bold text-slate-500">
          Грешка при зареждане
        </Card>
      </AppShell>
    );
  }

  if (loadState === "not-found" || !locationProfile) {
    return (
      <AppShell
        title="Обекти"
        description="Профил на обект, проверки, протоколи и сервизни дейности"
        showSearch={false}
      >
        <Card className="p-8 text-center text-sm font-bold text-slate-500">
          Обектът не е намерен
        </Card>
      </AppShell>
    );
  }

  const openDefectCount = upcomingActions.filter(
    (action) => action.source === "defect" && action.status === "open"
  ).length;

  return (
    <LocationProfileContext.Provider
      value={{
        location: locationProfile,
        equipment: locationEquipment,
        setEquipment: setLocationEquipment,
        protocols: locationProtocols,
        protocolsLoadState,
        refreshProtocols: loadProtocols,
        upcomingActions,
        upcomingActionsLoadState,
        completeUpcomingAction,
      }}
    >
      <ConfirmationDialog
        dialog={confirmationDialog}
        busy={confirmationBusy}
        onClose={() => {
          if (!confirmationBusy) setConfirmationDialog(null);
        }}
      />
      <AppShell
        title="Обекти"
        description="Профил на обект, проверки, протоколи и сервизни дейности"
        showSearch={false}
      >
      <PageHeader
        title={locationProfile.name}
        badge={
          openDefectCount > 0 ? (
            <Badge variant="danger" className="gap-1.5">
              <AlertTriangle size={14} />
              {openDefectCount === 1
                ? "Има активен проблем"
                : `Има активни проблеми (${openDefectCount})`}
            </Badge>
          ) : null
        }
        description={
          <span className="flex items-center gap-2">
            <MapPin size={17} />
            {locationProfile.address}
          </span>
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={openEditForm}>
              <Edit3 size={18} />
              Редакция
            </Button>
            <QrScannerButton buttonClassName="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4.5 text-sm font-bold leading-none text-orange-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-100 hover:text-orange-800 active:bg-orange-200/70">
              <QrCode size={18} />
              Сканирай QR
            </QrScannerButton>
            <Link
              href={`/protocols/new?object=${encodeURIComponent(locationProfile.qrCode)}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-5 text-sm font-black text-white shadow-sm transition hover:shadow-md"
            >
              <ClipboardPlus size={18} />
              Нов протокол
            </Link>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteLocation}
              disabled={deleteState === "deleting"}
            >
              <Trash2 size={18} />
              {deleteState === "deleting" ? "Изтриване..." : "Изтрий"}
            </Button>
          </>
        }
      />

      {toastMessage ? (
        <div className="fixed right-5 top-5 z-50 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-black text-emerald-700 shadow-xl">
          {toastMessage}
        </div>
      ) : null}

      {editOpen ? (
        <Card className="mt-6 border-orange-100 bg-orange-50 p-5">
          <form onSubmit={handleUpdateLocation}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  Редакция на обект
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-600">
                  Обновете основните данни за този обект.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Затвори редакцията"
                onClick={closeEditForm}
              >
                <X size={18} />
              </Button>
            </div>            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-500">
                  Клиент
                </label>
                <select
                  required
                  value={editForm.clientId}
                  onChange={(event) =>
                    updateEditForm("clientId", event.target.value)
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  <option value="">Изберете клиент</option>
                  {editClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-500">
                  Тип обект
                </label>
                <div className="flex gap-2">
                  <select
                    value={editForm.objectType}
                    onChange={(event) => {
                      if (event.target.value === ADD_OBJECT_TYPE_VALUE) {
                        setAddingObjectType(true);
                        updateEditForm("objectType", "");
                        return;
                      }
                      setAddingObjectType(false);
                      updateEditForm("objectType", event.target.value);
                    }}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    <option value="">Изберете тип</option>
                    {availableObjectTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                    <option value={ADD_OBJECT_TYPE_VALUE}>Добави +</option>
                  </select>
                </div>
                {addingObjectType ? (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={newObjectType}
                      onChange={(event) => setNewObjectType(event.target.value)}
                      placeholder="Нов тип обект"
                      className="w-full"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addObjectTypeToEditForm}
                      disabled={!newObjectType.trim()}
                    >
                      Добави
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-500">
                  Име на обект
                </label>
                <Input
                  required
                  value={editForm.name}
                  onChange={(event) =>
                    updateEditForm("name", event.target.value)
                  }
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-500">
                  QR код
                </label>
                <Input
                  onChange={(event) =>
                    updateEditForm("qrCode", event.target.value)
                  }
                  className="w-full"
                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <label className="text-xs font-black uppercase text-slate-500">
                  Адрес
                </label>
                <Input
                  value={editForm.address}
                  onChange={(event) =>
                    updateEditForm("address", event.target.value)
                  }
                  placeholder="град, улица, номер..."
                  className="w-full"
                />
              </div>
            </div>
            {editState === "error" ? (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                {editErrorMessage || "Грешка при запис"}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={closeEditForm}>
                Отказ
              </Button>
              <Button
                type="submit"
                disabled={editState === "saving" || !editForm.name.trim()}
              >
                <Save size={17} />
                {editState === "saving" ? "Записване..." : "Запази промените"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Tabs className="mt-6">
        {tabs.map((tab) => (
          <TabButton
            key={tab}
            type="button"
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </TabButton>
        ))}
      </Tabs>

      <div className="mt-6">
        {activeTab === "Общо" && <OverviewTab />}
        {activeTab === "Оборудване" && <EquipmentTab />}
        {activeTab === "Протоколи" && <ProtocolsTab />}
        {activeTab === "Задачи" && <TasksTab />}
        {activeTab === "Договори" && <ContractsTab />}
        {activeTab === "Медия" && <MediaTab />}
        {!["Общо", "Оборудване", "Протоколи", "Задачи", "Договори", "Медия"].includes(activeTab) && (
          <Card className="p-8">
            <h3 className="text-lg font-black">{activeTab}</h3>
            <p className="mt-2 text-sm text-slate-500">
              Този раздел ще бъде изграден тук.
            </p>
          </Card>
        )}
      </div>
      </AppShell>
    </LocationProfileContext.Provider>
  );
}
