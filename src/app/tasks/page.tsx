"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ListChecks,
  MapPin,
  Play,
  Search,
  Wrench,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  type ServiceTask,
  formatTaskDate,
  readServiceTasks,
  readServiceTasksFromSupabase,
  serviceTasksUpdatedEvent,
  updateServiceTaskStatus,
} from "../../lib/tasks";

const PROTOCOLS_LS_KEY = "firecontrol:protocols";
const UNASSIGNED_TECHNICIAN = "Не е зададен";

type TaskListItem = ServiceTask & {
  href?: string;
  locationAddress?: string;
  sourceKind?: "service" | "sales";
};

type LocationDirectoryEntry = {
  id: string;
  qrCode: string;
  name: string;
  address: string;
  client: string;
};

type LocationDirectory = {
  identifiers: Set<string>;
  byIdentifier: Map<string, LocationDirectoryEntry>;
};

type ScheduleGroup = {
  id: string;
  title: string;
  kindLabel: string;
  dueDate: string;
  objectName: string;
  objectCode: string;
  client: string;
  address: string;
  technician: string;
  sourceText: string;
  href?: string;
  tasks: TaskListItem[];
  items: { label: string; count: number; problem: boolean }[];
  visibleItems: { label: string; count: number; problem: boolean }[];
  problem: boolean;
  completed: boolean;
  sales: boolean;
};

function normalizedTaskType(task: ServiceTask) {
  return (task.type || task.taskType || "").trim().toLowerCase();
}

function normalizedTaskStatus(task: ServiceTask) {
  return String(task.status || "").trim().toLowerCase();
}

function isProblemTask(task: ServiceTask) {
  const type = normalizedTaskType(task);
  return type === "problem" || type === "defect" || Boolean(task.relatedProblemId);
}

function isSalesTask(task: TaskListItem | ServiceTask) {
  return "sourceKind" in task && task.sourceKind === "sales";
}

function isCompletedTask(task: TaskListItem, todayKey = dateKey(new Date())) {
  if (isSalesTask(task)) {
    return Boolean(task.dueDate && task.dueDate < todayKey);
  }

  const status = normalizedTaskStatus(task);
  return status === "completed" || status === "done" || status === "resolved";
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inputDateToLocalDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function weekdayName(value: string) {
  const date = inputDateToLocalDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("bg-BG", { weekday: "long" }).format(date);
}

function textValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function protocolNumberFromSourceLabel(value: string) {
  const match = value.match(/(?:№|No|N)\s*([A-Za-zА-Яа-я0-9-]+)/i);
  return match?.[1] ?? "";
}

function taskProtocolRefs(task: ServiceTask) {
  return uniqueValues([
    task.sourceProtocolNumber ?? "",
    task.sourceProtocolId ?? "",
    task.protocolId ?? "",
    protocolNumberFromSourceLabel(task.sourceLabel ?? ""),
  ]);
}

function normalizeGroupPart(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || fallback;
}

function sentenceTitle(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toLocaleUpperCase("bg-BG")}${trimmed.slice(1)}`;
}

function sameDisplayText(first: string, second: string) {
  return first.trim().toLocaleLowerCase("bg-BG") === second.trim().toLocaleLowerCase("bg-BG");
}

function cleanActivityLabel(value: string) {
  return sentenceTitle(
    value
      .replace(/^техническо обслужване\s*[:\-–]?\s*/i, "")
      .replace(/^презареждане\s*[:\-–]?\s*/i, "")
      .replace(/^презарядка\s*[:\-–]?\s*/i, "")
      .replace(/^хидростатичен тест\s*[:\-–]?\s*/i, "")
      .replace(/^хидростатично изпитване\s*[:\-–]?\s*/i, "")
      .replace(/^на\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function taskTypeLabel(task: ServiceTask) {
  const type = normalizedTaskType(task);
  if (type === "problem" || type === "defect" || task.relatedProblemId) return "Проблем / повреда";
  if (type === "visit") return "Посещение";
  if (type === "service") return "Обслужване";
  if (type === "repair") return "Ремонт";
  if (type === "call") return "Обаждане";
  if (task.taskType.includes("посещение")) return "Посещение";
  if (task.taskType.includes("обслужване")) return "Абонаментно обслужване";
  return task.taskType || "Задача";
}

function taskActivityTitles(task: ServiceTask) {
  return Array.from(
    new Set(
      (task.activities?.length ? task.activities : [{ title: task.title }])
        .map((activity) => cleanActivityLabel(activity.title || task.title))
        .filter(Boolean)
    )
  );
}

function taskRecurrenceLabel(task: ServiceTask) {
  const recurrenceMonths =
    task.activities.find((activity) => activity.recurrenceMonths > 0)
      ?.recurrenceMonths ||
    task.recurrenceMonths ||
    0;

  if (recurrenceMonths === 1) return "ежемесечно";
  if (recurrenceMonths === 3) return "на 3 месеца";
  if (recurrenceMonths === 6) return "на 6 месеца";
  if (recurrenceMonths === 12) return "годишно";

  return "";
}

function isExtinguisherServiceTask(task: ServiceTask) {
  const haystack = [
    task.sourceProtocolType,
    task.sourceLabel,
    task.title,
    task.taskType,
    ...task.activities.map((activity) => activity.title),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes("extinguisher") || haystack.includes("пожарогас");
}

function extinguisherServiceActionLabel(task: ServiceTask) {
  const haystack = [
    task.title,
    task.description,
    ...task.activities.flatMap((activity) => [
      activity.title,
      activity.description,
    ]),
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("хидростат")) return "Хидростатичен тест";
  if (haystack.includes("презареж") || haystack.includes("презаряд")) return "Презареждане";
  if (haystack.includes("техническо обслуж")) return "Техническо обслужване";

  return "Проверка на пожарогасители";
}

function taskDisplayTitle(task: ServiceTask) {
  if (isProblemTask(task)) return sentenceTitle(task.title || "Проблем");
  if (isExtinguisherServiceTask(task)) return extinguisherServiceActionLabel(task);
  if (taskRecurrenceLabel(task)) return "Планирано посещение";

  const titles = taskActivityTitles(task);
  if (titles.length === 1) return titles[0];

  return sentenceTitle(task.taskType || task.title || "Планирано посещение");
}

function technicianName(task: TaskListItem) {
  return task.assignedTo?.trim() || UNASSIGNED_TECHNICIAN;
}

function sourceText(task: ServiceTask) {
  if (isSalesTask(task as TaskListItem)) return "Лийд";

  const sourceType = (task.sourceProtocolType || "").trim().toLowerCase();
  const sourceLabel = (task.sourceLabel || "").trim().toLowerCase();

  if (
    sourceType === "subscription" ||
    sourceType.includes("абонамент") ||
    sourceLabel.includes("абонамент")
  ) {
    return "Абонаментно обслужване";
  }

  if (
    sourceType === "service" ||
    sourceType.includes("поддръжка") ||
    sourceType.includes("пис") ||
    sourceLabel.includes("поддръжка") ||
    sourceLabel.includes("пис")
  ) {
    return "Поддръжка на ПИС";
  }

  if (
    sourceType === "extinguisher" ||
    sourceType.includes("пожарогас") ||
    sourceLabel.includes("пожарогас") ||
    isExtinguisherServiceTask(task)
  ) {
    return "Протокол за пожарогасители";
  }

  return task.sourceLabel?.replace(/\s*№.*$/, "").trim() || task.taskType || "Задача";
}

function scheduleGroupKey(task: TaskListItem) {
  if (isSalesTask(task)) return task.id;

  const objectKey = task.objectId || task.objectCode || task.objectName || task.client;
  const tech = technicianName(task);
  const source = task.sourceProtocolNumber || task.sourceProtocolId || task.sourceLabel || "";
  const kind = isProblemTask(task)
    ? "problem"
    : isExtinguisherServiceTask(task)
      ? `extinguisher-${extinguisherServiceActionLabel(task)}`
      : task.taskType || task.type || task.title;

  return [
    normalizeGroupPart(task.dueDate, "date"),
    normalizeGroupPart(objectKey, "object"),
    normalizeGroupPart(tech, "technician"),
    normalizeGroupPart(kind, "kind"),
    normalizeGroupPart(source, "source"),
  ].join("|");
}

function summarizeGroupItems(tasks: TaskListItem[]) {
  const summaries = new Map<string, { label: string; count: number; problem: boolean }>();

  for (const task of tasks) {
    const titles = isProblemTask(task)
      ? [sentenceTitle(task.title || "Проблем")]
      : taskActivityTitles(task);

    for (const title of titles.length ? titles : [taskDisplayTitle(task)]) {
      const key = title.toLocaleLowerCase("bg-BG");
      const existing = summaries.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        summaries.set(key, {
          label: title,
          count: 1,
          problem: isProblemTask(task),
        });
      }
    }
  }

  return Array.from(summaries.values()).sort((first, second) =>
    first.label.localeCompare(second.label, "bg-BG")
  );
}

async function readLocationDirectory(): Promise<LocationDirectory> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("locations")
    .select("*");

  if (error) throw new Error(error.message);

  const byIdentifier = new Map<string, LocationDirectoryEntry>();
  const identifiers = new Set<string>();

  for (const row of (data as Record<string, unknown>[]) ?? []) {
    const entry = {
      id: textValue(row, ["id"]),
      qrCode: textValue(row, ["qr_code", "code"]),
      name: textValue(row, ["name", "object_name", "title"]),
      address: textValue(row, ["address", "full_address"]),
      client: textValue(row, ["client_name", "client"]),
    };

    for (const identifier of uniqueValues([entry.id, entry.qrCode, entry.name])) {
      identifiers.add(identifier);
      byIdentifier.set(identifier, entry);
    }
  }

  return { identifiers, byIdentifier };
}

function taskBelongsToExistingLocation(task: ServiceTask, locationIdentifiers: Set<string>) {
  if (!locationIdentifiers.size) return true;

  const taskIdentifiers = uniqueValues([
    task.objectId ?? "",
    task.objectCode,
    task.objectName,
  ]);

  if (!taskIdentifiers.length) return true;
  return taskIdentifiers.some((value) => locationIdentifiers.has(value));
}

function hydrateTaskLocation(task: TaskListItem, directory: LocationDirectory): TaskListItem {
  if (isSalesTask(task)) return task;

  const location = uniqueValues([
    task.objectId ?? "",
    task.objectCode,
    task.objectName,
  ])
    .map((identifier) => directory.byIdentifier.get(identifier))
    .find(Boolean);

  if (!location) return task;

  return {
    ...task,
    objectCode: location.qrCode || location.id || task.objectCode,
    objectId: location.id || task.objectId,
    objectName: location.name || task.objectName,
    client: task.client || location.client,
    locationAddress: location.address,
  };
}

function mapSalesFollowUp(row: Record<string, unknown>): TaskListItem | null {
  const id = String(row.id ?? "");
  const dueDate = String(row.next_action_date ?? "");
  if (!id || !dueDate) return null;

  const company = String(row.company_name ?? "").trim();
  const action = String(row.next_action ?? "").trim() || "Следващо действие";
  const objectName = String(row.object_name ?? "").trim();
  const contactName = String(row.contact_name ?? "").trim();
  const phone = String(row.phone ?? "").trim();

  return {
    id: `sales-${id}`,
    title: `${action}${company ? `: ${company}` : ""}`,
    description: [
      company ? `Лийд: ${company}` : "",
      contactName ? `Контакт: ${contactName}` : "",
      phone ? `Телефон: ${phone}` : "",
    ].filter(Boolean).join("\n"),
    taskType: "Търговско проследяване",
    type: "sales_follow_up",
    activities: [{ row: "", title: action, description: "", recurrenceMonths: 0 }],
    objectCode: "",
    objectId: id,
    objectName: objectName || company || "Лийд",
    client: company,
    dueDate,
    sourceProtocolId: id,
    sourceProtocolType: "sales_lead",
    sourceLabel: "Лийд",
    status: "planned",
    createdAt: Date.parse(String(row.created_at ?? "")) || 0,
    href: `/sales/${id}`,
    sourceKind: "sales",
  };
}

async function readSalesFollowUpTasks() {
  const supabase = createSupabaseBrowserClient();
  const primaryResult = await supabase
    .from("sales_opportunities")
    .select("id,company_name,contact_name,phone,object_name,next_action,next_action_date,created_at,archived")
    .not("next_action_date", "is", null)
    .or("archived.is.false,archived.is.null")
    .order("next_action_date", { ascending: true });
  let data = primaryResult.data as Record<string, unknown>[] | null;
  let error = primaryResult.error;

  if (error) {
    const fallbackResult = await supabase
      .from("sales_opportunities")
      .select("id,company_name,contact_name,phone,object_name,next_action,next_action_date,created_at")
      .not("next_action_date", "is", null)
      .order("next_action_date", { ascending: true });

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? [])
    .map(mapSalesFollowUp)
    .filter((task): task is TaskListItem => Boolean(task));
}

async function hydrateTaskTechnicians(tasks: ServiceTask[]) {
  const protocolRefs = uniqueValues(tasks.flatMap((task) => taskProtocolRefs(task)));
  const techniciansByProtocolRef = new Map<string, string>();

  function mergeProtocolTechnicians(nextRows: Record<string, unknown>[] | null) {
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
    const supabase = createSupabaseBrowserClient();
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

    for (const result of protocolQueries) {
      if (!result.error) {
        mergeProtocolTechnicians((result.data as Record<string, unknown>[]) ?? []);
      }
    }
  }

  if (typeof window !== "undefined") {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PROTOCOLS_LS_KEY) || "[]");
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const record = item as Record<string, unknown>;
          const protocolNumber = textValue(record, ["number", "protocolNumber"]);
          const technician = textValue(record, ["technician"]);
          if (protocolNumber && technician) {
            techniciansByProtocolRef.set(protocolNumber, technician);
          }
        }
      }
    } catch {
      // Best-effort fallback for older local protocol drafts.
    }
  }

  return tasks.map((task) => {
    if (task.assignedTo?.trim()) return task;

    const technician = taskProtocolRefs(task)
      .map((ref) => techniciansByProtocolRef.get(ref))
      .find(Boolean);

    return technician ? { ...task, assignedTo: technician } : task;
  });
}

function buildScheduleGroups(tasks: TaskListItem[]) {
  const grouped = new Map<string, TaskListItem[]>();

  for (const task of tasks) {
    const key = scheduleGroupKey(task);
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }

  return Array.from(grouped.entries())
    .map(([id, groupTasks]) => {
      const first = groupTasks[0];
      const problem = groupTasks.some(isProblemTask);
      const sales = groupTasks.some(isSalesTask);
      const completed = groupTasks.every((task) => isCompletedTask(task));
      const title = sales
        ? sentenceTitle(first.activities[0]?.title || first.taskType || "Следващо действие")
        : problem
          ? "Проблеми и повреди"
          : isExtinguisherServiceTask(first)
            ? extinguisherServiceActionLabel(first)
            : taskDisplayTitle(first);
      const kindLabel = sales
        ? "Лийд"
        : problem
          ? "Проблем / повреда"
          : isExtinguisherServiceTask(first)
            ? ""
            : taskTypeLabel(first);
      const items = summarizeGroupItems(groupTasks);
      const visibleItems =
        items.length === 1 &&
        items[0].count === 1 &&
        sameDisplayText(items[0].label, title)
          ? []
          : items;

      return {
        id,
        title,
        kindLabel,
        dueDate: first.dueDate,
        objectName: first.objectName || first.client || "Без обект",
        objectCode: first.objectCode,
        client: first.client,
        address: first.locationAddress || "",
        technician: technicianName(first),
        sourceText: sourceText(first),
        href: first.href,
        tasks: groupTasks,
        items,
        visibleItems,
        problem,
        completed,
        sales,
      } satisfies ScheduleGroup;
    })
    .sort((first, second) => {
      const dateCompare = (first.dueDate || "9999").localeCompare(second.dueDate || "9999");
      if (dateCompare) return dateCompare;
      return first.objectName.localeCompare(second.objectName, "bg-BG");
    });
}

function calendarDaysForMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const days: { key: string; label: string; currentMonth: boolean }[] = [];

  for (let index = leadingDays; index > 0; index -= 1) {
    const day = new Date(year, month, 1 - index);
    days.push({
      key: dateKey(day),
      label: String(day.getDate()),
      currentMonth: false,
    });
  }

  for (let dayNumber = 1; dayNumber <= lastDay.getDate(); dayNumber += 1) {
    const day = new Date(year, month, dayNumber);
    days.push({
      key: dateKey(day),
      label: String(dayNumber),
      currentMonth: true,
    });
  }

  while (days.length % 7 !== 0) {
    const day = new Date(year, month, lastDay.getDate() + (days.length % 7) + 1);
    days.push({
      key: dateKey(day),
      label: String(day.getDate()),
      currentMonth: false,
    });
  }

  return days;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [periodFilter, setPeriodFilter] = useState("upcoming");
  const [statusFilter, setStatusFilter] = useState("active");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

  useEffect(() => {
    async function refreshTasks() {
      let dbTasks: ServiceTask[] = [];
      let locationDirectory: LocationDirectory = {
        identifiers: new Set<string>(),
        byIdentifier: new Map<string, LocationDirectoryEntry>(),
      };
      let salesTasks: TaskListItem[] = [];

      try {
        dbTasks = await hydrateTaskTechnicians(await readServiceTasksFromSupabase());
      } catch {
        dbTasks = readServiceTasks();
      }

      try {
        locationDirectory = await readLocationDirectory();
      } catch {
        locationDirectory = {
          identifiers: new Set<string>(),
          byIdentifier: new Map<string, LocationDirectoryEntry>(),
        };
      }

      try {
        salesTasks = await readSalesFollowUpTasks();
      } catch {
        salesTasks = [];
      }

      setTasks([
        ...dbTasks.filter((task) =>
          task.sourceProtocolType !== "sales_lead" &&
          taskBelongsToExistingLocation(task, locationDirectory.identifiers)
        ).map((task) => hydrateTaskLocation(task, locationDirectory)),
        ...salesTasks,
      ]);
    }

    void refreshTasks();
    window.addEventListener(serviceTasksUpdatedEvent, refreshTasks);
    window.addEventListener("storage", refreshTasks);

    return () => {
      window.removeEventListener(serviceTasksUpdatedEvent, refreshTasks);
      window.removeEventListener("storage", refreshTasks);
    };
  }, []);

  const technicianOptions = useMemo(
    () =>
      uniqueValues(tasks.map((task) => technicianName(task))).sort((first, second) =>
        first.localeCompare(second, "bg-BG")
      ),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const today = dateKey(new Date());
    const weekEnd = dateKey(addDays(new Date(), 7));
    const monthEnd = dateKey(addDays(new Date(), 30));
    const query = searchQuery.trim().toLocaleLowerCase("bg-BG");

    return tasks
      .filter((task) => {
        const completed = isCompletedTask(task, today);
        const problem = isProblemTask(task);
        const dueDate = task.dueDate || "";

        if (statusFilter === "active" && completed) return false;
        if (statusFilter === "completed" && !completed) return false;
        if (statusFilter === "problems" && (!problem || completed)) return false;

        if (selectedDate) {
          if (dueDate !== selectedDate) return false;
        } else {
          if (periodFilter === "today" && dueDate !== today) return false;
          if (periodFilter === "week" && !(dueDate && dueDate >= today && dueDate <= weekEnd)) return false;
          if (periodFilter === "month" && !(dueDate && dueDate >= today && dueDate <= monthEnd)) return false;
          if (periodFilter === "overdue" && !(dueDate && dueDate < today && !completed)) return false;
        }

        if (technicianFilter !== "all" && technicianName(task) !== technicianFilter) return false;

        if (query) {
          const haystack = [
            task.title,
            task.taskType,
            task.objectName,
            task.client,
            task.locationAddress,
            task.objectCode,
            task.assignedTo,
            task.sourceProtocolNumber,
            task.sourceLabel,
            ...task.activities.map((activity) => activity.title),
          ]
            .join(" ")
            .toLocaleLowerCase("bg-BG");
          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((first, second) => (first.dueDate || "9999").localeCompare(second.dueDate || "9999"));
  }, [periodFilter, searchQuery, selectedDate, statusFilter, tasks, technicianFilter]);

  const calendarTaskDates = useMemo(() => {
    const today = dateKey(new Date());
    const query = searchQuery.trim().toLocaleLowerCase("bg-BG");

    return new Set(
      tasks
        .filter((task) => {
          const completed = isCompletedTask(task, today);
          const problem = isProblemTask(task);

          if (statusFilter === "active" && completed) return false;
          if (statusFilter === "completed" && !completed) return false;
          if (statusFilter === "problems" && (!problem || completed)) return false;
          if (technicianFilter !== "all" && technicianName(task) !== technicianFilter) return false;

          if (query) {
            const haystack = [
              task.title,
              task.taskType,
              task.objectName,
              task.client,
              task.locationAddress,
              task.objectCode,
              task.assignedTo,
              task.sourceProtocolNumber,
              task.sourceLabel,
              ...task.activities.map((activity) => activity.title),
            ]
              .join(" ")
              .toLocaleLowerCase("bg-BG");
            if (!haystack.includes(query)) return false;
          }

          return Boolean(task.dueDate);
        })
        .map((task) => task.dueDate)
    );
  }, [searchQuery, statusFilter, tasks, technicianFilter]);

  const scheduleGroups = useMemo(() => buildScheduleGroups(filteredTasks), [filteredTasks]);

  async function completeTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    setTasks((current) => current.map((task) =>
      task.id === taskId ? { ...task, status: "COMPLETED" as const } : task
    ));

    if (task?.sourceKind === "sales" && task.objectId) {
      const supabase = createSupabaseBrowserClient();
      await supabase
        .from("sales_opportunities")
        .update({
          next_action_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.objectId);
      window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
      return;
    }

    await updateServiceTaskStatus(taskId, "COMPLETED");
  }

  async function completeGroup(group: ScheduleGroup) {
    for (const task of group.tasks) {
      await completeTask(task.id);
    }
  }

  const periodFilters = [
    ["upcoming", "Предстоящи"],
    ["today", "Днес"],
    ["week", "7 дни"],
    ["month", "30 дни"],
    ["overdue", "Просрочени"],
    ["all", "Всички"],
  ];

  const statusFilters = [
    ["active", "Активни"],
    ["problems", "Проблеми"],
    ["completed", "Приключени"],
  ];

  const summary = {
    visits: scheduleGroups.length,
    completed: scheduleGroups.filter((group) => group.completed).length,
    active: scheduleGroups.filter((group) => !group.completed && !group.problem).length,
    upcoming: scheduleGroups.filter((group) => group.dueDate >= dateKey(new Date()) && !group.completed).length,
    problems: scheduleGroups.filter((group) => group.problem && !group.completed).length,
  };
  const today = new Date();
  const todayKey = dateKey(today);
  const calendarDays = calendarDaysForMonth(calendarMonth);
  const monthLabel = new Intl.DateTimeFormat("bg-BG", {
    month: "long",
    year: "numeric",
  }).format(calendarMonth);
  const selectedDateLabel = selectedDate ? formatTaskDate(selectedDate) : "";
  const calendarYears = Array.from(
    { length: 9 },
    (_, index) => calendarMonth.getFullYear() - 4 + index
  );

  return (
    <AppShell
      title="Задачи"
      description="Планиране, проследяване и изпълнение на сервизни задачи"
      showSearch={false}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 xl:flex-row xl:items-center">
          <div className="relative w-full shrink-0 sm:w-[420px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Обект, адрес, протокол, дейност..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-bold text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
            <select
              value={technicianFilter}
              aria-label="Техник"
              onChange={(event) => setTechnicianFilter(event.target.value)}
              className="h-9 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">Всички техници</option>
              {technicianOptions.map((technician) => (
                <option key={technician} value={technician}>
                  {technician}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              aria-label="Състояние"
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 min-w-[145px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              {statusFilters.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
              {periodFilters.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    setPeriodFilter(value);
                  }}
                  className={`h-8 shrink-0 rounded-lg px-3 text-xs font-black transition ${
                    periodFilter === value
                      ? "bg-white text-orange-700 shadow-sm"
                      : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="relative min-w-0 space-y-0">
            {scheduleGroups.length ? (
              scheduleGroups.map((group) => {
                const tone = group.completed
                  ? "border-emerald-100 bg-emerald-50/25"
                  : group.problem
                    ? "border-red-100 bg-red-50/25"
                    : "border-slate-200 bg-white";

                return (
                  <div
                    key={group.id}
                    className="grid gap-3 pb-5 md:grid-cols-[148px_32px_minmax(0,1fr)]"
                  >
                    <div className="pt-4 md:text-right">
                      <div className="text-lg font-black leading-none text-slate-950">
                        {formatTaskDate(group.dueDate) || "Без дата"}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-400">
                        {weekdayName(group.dueDate) || "—"}
                      </div>
                    </div>

                    <div className="relative hidden justify-center md:flex">
                      <div className="absolute bottom-0 top-0 w-px bg-slate-200" />
                      <div
                        className={`relative mt-8 h-3.5 w-3.5 rounded-full ring-4 ring-white ${
                          group.completed
                            ? "bg-emerald-500"
                            : group.problem
                              ? "bg-red-500"
                              : "bg-orange-500"
                        }`}
                      />
                    </div>

                    <Card className={`overflow-hidden rounded-xl p-0 shadow-sm ${tone}`}>
                      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
                        <div className="min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-extrabold leading-6 text-slate-950">
                                {group.objectName}
                              </h3>
                              {group.kindLabel ? (
                                <Badge variant={group.problem ? "danger" : group.sales ? "warning" : "neutral"}>
                                  {group.kindLabel}
                                </Badge>
                              ) : null}
                              {group.completed ? <Badge variant="success">Приключено</Badge> : null}
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold leading-6 text-slate-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Wrench size={16} />
                                {group.technician}
                              </span>
                              {group.client ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Building2 size={16} />
                                  {group.client}
                                </span>
                              ) : null}
                              {group.address ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin size={16} />
                                  {group.address}
                                </span>
                              ) : null}
                              {group.sourceText ? (
                                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-500">
                                  {group.sourceText}
                                </span>
                              ) : null}
                            </div>

                            {group.title ? (
                              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/70 px-2.5 py-1.5 text-sm font-bold text-orange-900">
                                <ClipboardCheck size={15} />
                                <span className="text-orange-500">Задача:</span>
                                <span>{group.title}</span>
                              </div>
                            ) : null}

                            {group.visibleItems.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {group.visibleItems.slice(0, 5).map((item) => (
                                <span
                                  key={item.label}
                                  className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm font-semibold ${
                                    item.problem
                                      ? "border-red-100 bg-white text-red-700"
                                      : "border-slate-100 bg-white text-slate-700"
                                  }`}
                                >
                                  <CheckCircle2 size={15} className={item.problem ? "text-red-500" : "text-emerald-500"} />
                                  {item.count > 1 ? `${item.count} x ` : ""}
                                  {item.label}
                                </span>
                              ))}
                              {group.visibleItems.length > 5 ? (
                                <span className="inline-flex items-center rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-black text-slate-500">
                                  + още {group.visibleItems.length - 5}
                                </span>
                              ) : null}
                            </div>
                            ) : null}
                          </div>
                      </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {group.sales && group.href ? (
                          <Link
                            href={group.href}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                          >
                            Отвори лийд
                          </Link>
                        ) : group.objectCode ? (
                          <Link
                            href={`/locations/${encodeURIComponent(group.objectCode)}`}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                          >
                            Отвори обект
                          </Link>
                        ) : null}
                        {!group.completed ? (
                          <Button
                            type="button"
                            variant={group.problem ? "danger" : "secondary"}
                            size="sm"
                            onClick={() => completeGroup(group)}
                          >
                            <Play size={15} />
                            Завърши
                          </Button>
                        ) : null}
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })
            ) : (
              <Card className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                  <CalendarCheck size={22} />
                </div>
                <h2 className="mt-4 text-lg font-black text-slate-900">
                  Няма задачи за избрания изглед
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Пробвайте друг период, техник или текст в търсенето.
                </p>
              </Card>
            )}
          </section>

          <aside className="space-y-5">
            <Card className="p-5">
              <h3 className="text-lg font-black text-slate-950">Обобщение</h3>
              <div className="mt-4 space-y-3">
                <SummaryRow icon={CalendarCheck} label="Всички посещения" value={summary.visits} />
                <SummaryRow icon={CheckCircle2} label="Приключени" value={summary.completed} tone="success" />
                <SummaryRow icon={Clock3} label="Активни" value={summary.active} tone="warning" />
                <SummaryRow icon={ListChecks} label="Предстоящи" value={summary.upcoming} />
                <SummaryRow icon={AlertTriangle} label="Проблеми" value={summary.problems} tone="danger" />
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-black text-slate-950">Календар</h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    aria-label="Предишен месец"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    aria-label="Следващ месец"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                <select
                  value={calendarMonth.getMonth()}
                  onChange={(event) =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), Number(event.target.value), 1)
                    )
                  }
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold capitalize text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  aria-label="Месец"
                >
                  {Array.from({ length: 12 }, (_, month) => (
                    <option key={month} value={month}>
                      {new Intl.DateTimeFormat("bg-BG", { month: "long" }).format(new Date(2026, month, 1))}
                    </option>
                  ))}
                </select>
                <select
                  value={calendarMonth.getFullYear()}
                  onChange={(event) =>
                    setCalendarMonth(new Date(Number(event.target.value), calendarMonth.getMonth(), 1))
                  }
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  aria-label="Година"
                >
                  {calendarYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex min-h-5 items-center justify-between gap-2 text-xs font-bold text-slate-400">
                <span className="capitalize">{monthLabel}</span>
                {selectedDate ? (
                  <button
                    type="button"
                    onClick={() => setSelectedDate("")}
                    className="font-black text-orange-700 hover:text-orange-800"
                  >
                    Изчисти {selectedDateLabel}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-black uppercase text-slate-400">
                {["П", "В", "С", "Ч", "П", "С", "Н"].map((day, index) => (
                  <div key={`${day}-${index}`} className="py-1">
                    {day}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm font-bold">
                {calendarDays.map((day) => {
                  const hasTask = calendarTaskDates.has(day.key);
                  const isToday = day.key === todayKey;
                  const isSelected = day.key === selectedDate;

                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => {
                        const clickedDate = inputDateToLocalDate(day.key);
                        if (clickedDate) setCalendarMonth(startOfMonth(clickedDate));
                        setSelectedDate(day.key);
                        setPeriodFilter("all");
                      }}
                      className={`relative flex h-9 items-center justify-center rounded-xl transition ${
                        isSelected
                          ? "bg-slate-950 text-white shadow-sm"
                          : isToday
                          ? "bg-orange-500 text-white shadow-sm"
                          : day.currentMonth
                            ? "text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                            : "text-slate-300"
                      }`}
                    >
                      {day.label}
                      {hasTask && !isSelected ? (
                        <span
                          className={`absolute bottom-1 h-1 w-1 rounded-full ${
                            isToday ? "bg-white" : "bg-orange-500"
                          }`}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-lg font-black text-slate-950">Техници</h3>
              <div className="mt-4 space-y-2">
                {technicianOptions.length ? (
                  technicianOptions.map((technician) => {
                    const count = scheduleGroups.filter((group) => group.technician === technician).length;
                    return (
                      <button
                        key={technician}
                        type="button"
                        onClick={() => setTechnicianFilter(technician)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${
                          technicianFilter === technician
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/60"
                        }`}
                      >
                        <span>{technician}</span>
                        <span className="text-slate-400">{count}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-400">
                    Няма зададени техници.
                  </div>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "bg-orange-50 text-orange-700"
        : tone === "danger"
          ? "bg-red-50 text-red-700"
          : "bg-slate-50 text-slate-500";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon size={18} />
        </span>
        <span className="text-sm font-bold text-slate-600">{label}</span>
      </div>
      <span className="text-lg font-black text-slate-950">{value}</span>
    </div>
  );
}
