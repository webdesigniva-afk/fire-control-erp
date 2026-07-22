"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, ClipboardCheck } from "lucide-react";
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

type TaskListItem = ServiceTask & {
  href?: string;
  sourceKind?: "service" | "sales";
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
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function textValue(record: Record<string, unknown>, keys: string[]) {
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

async function readExistingLocationIdentifiers() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("locations")
    .select("*");

  if (error) throw new Error(error.message);

  return new Set(
    ((data as Record<string, unknown>[]) ?? []).flatMap((row) =>
      uniqueValues([
        textValue(row, ["id"]),
        textValue(row, ["qr_code", "code"]),
        textValue(row, ["name", "object_name", "title"]),
      ])
    )
  );
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

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [periodFilter, setPeriodFilter] = useState("upcoming");
  const [statusFilter, setStatusFilter] = useState("active");

  useEffect(() => {
    async function refreshTasks() {
      let dbTasks: ServiceTask[] = [];
      let locationIdentifiers = new Set<string>();
      let salesTasks: TaskListItem[] = [];

      try {
        dbTasks = await readServiceTasksFromSupabase();
      } catch {
        dbTasks = readServiceTasks();
      }

      try {
        locationIdentifiers = await readExistingLocationIdentifiers();
      } catch {
        locationIdentifiers = new Set<string>();
      }

      try {
        salesTasks = await readSalesFollowUpTasks();
      } catch {
        salesTasks = [];
      }

      setTasks([
        ...dbTasks.filter((task) =>
          task.sourceProtocolType !== "sales_lead" &&
          taskBelongsToExistingLocation(task, locationIdentifiers)
        ),
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

  const plannedTasks = useMemo(() => {
    const today = dateKey(new Date());
    const weekEnd = dateKey(addDays(new Date(), 7));
    const monthEnd = dateKey(addDays(new Date(), 30));

    return tasks
      .filter((task) => {
        const completed = isCompletedTask(task, today);
        const problem = isProblemTask(task);
        const dueDate = task.dueDate || "";

        if (statusFilter === "active" && completed) return false;
        if (statusFilter === "completed" && !completed) return false;
        if (statusFilter === "problems" && (!problem || completed)) return false;

        if (periodFilter === "today") return dueDate === today;
        if (periodFilter === "week") return Boolean(dueDate && dueDate >= today && dueDate <= weekEnd);
        if (periodFilter === "month") return Boolean(dueDate && dueDate >= today && dueDate <= monthEnd);
        if (periodFilter === "overdue") {
          return Boolean(dueDate && dueDate < today && !completed);
        }

        return true;
      })
      .sort((first, second) => (first.dueDate || "9999").localeCompare(second.dueDate || "9999"));
  }, [periodFilter, statusFilter, tasks]);

  async function completeTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    const nextTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: "COMPLETED" as const } : task
    );
    setTasks(nextTasks);

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

  function taskTypeLabel(task: ServiceTask) {
    const type = normalizedTaskType(task);
    if (type === "problem" || type === "defect" || task.relatedProblemId) return "Проблем";
    if (type === "visit") return "Посещение";
    if (type === "service") return "Обслужване";
    if (type === "repair") return "Ремонт";
    if (type === "call") return "Обаждане";
    if (task.taskType.includes("посещение")) return "Посещение";
    return "Задача";
  }

  function taskActivityTitles(task: ServiceTask) {
    return Array.from(
      new Set(
        (task.activities?.length ? task.activities : [{ title: task.title }])
          .map((activity) => sentenceTitle(activity.title))
          .filter(Boolean)
      )
    );
  }

  function sentenceTitle(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return `${trimmed.charAt(0).toLocaleUpperCase("bg-BG")}${trimmed.slice(1)}`;
  }

  function sameDisplayText(first: string, second: string) {
    return first.trim().toLocaleLowerCase("bg-BG") === second.trim().toLocaleLowerCase("bg-BG");
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

  function taskDisplayTitle(task: ServiceTask) {
    if (taskRecurrenceLabel(task)) return "Планирано посещение";

    const titles = taskActivityTitles(task);
    if (titles.length === 1) return titles[0];

    return sentenceTitle(task.taskType || task.title || "Планирано посещение");
  }

  return (
    <AppShell
      title="Задачи"
      description="Планиране, проследяване и изпълнение на сервизни задачи"
    >
      <div className="space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                <CalendarCheck size={22} />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">
                  Сервизен график
                </h2>
                <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                  Тук влизат следващите проверки, проблеми и оперативни действия.
                </p>
              </div>
            </div>
            <Badge variant="orange">{plannedTasks.length} задачи</Badge>
          </div>
        </Card>

        <Card className="p-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <p className="mb-2 text-xs font-black uppercase text-slate-400">Период</p>
              <div className="flex flex-wrap gap-2">
                {periodFilters.map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={periodFilter === value ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setPeriodFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase text-slate-400">Състояние</p>
              <div className="flex flex-wrap gap-2">
                {statusFilters.map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={statusFilter === value ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {plannedTasks.length ? (
          <div className="space-y-3">
            {plannedTasks.map((task) => {
              const isCompleted = isCompletedTask(task);
              const displayTitle = taskDisplayTitle(task);
              const activities = task.activities?.length
                ? task.activities
                : [{ title: task.title }];
              const activityTitles = activities
                .map((activity) => sentenceTitle(activity.title))
                .filter((title) => title && !sameDisplayText(title, displayTitle));
              const visibleActivities = activityTitles.slice(0, 3);
              const hiddenActivities = Math.max(activityTitles.length - 3, 0);

              if (isSalesTask(task)) {
                return (
                  <Card key={task.id} className="p-0" hover>
                    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                          <ClipboardCheck size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-black text-slate-950">
                              {sentenceTitle(task.activities[0]?.title || task.taskType || "Следващо действие")}
                            </h3>
                            <Badge variant="warning">Лийд</Badge>
                          </div>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                            {task.client || task.objectName || "Без фирма"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <Badge variant="warning">{formatTaskDate(task.dueDate)}</Badge>
                        {task.href ? (
                          <Link
                            href={task.href}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                          >
                            Отвори лийд
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              }

              return (
                <Card key={task.id} className="overflow-hidden p-0" hover>
                  <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 sm:flex">
                        <ClipboardCheck size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="text-base font-black leading-6 text-slate-950">
                            {displayTitle}
                          </h3>
                          <Badge variant={isProblemTask(task) ? "danger" : "neutral"}>
                            {taskTypeLabel(task)}
                          </Badge>
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold leading-6 text-slate-500">
                          <span>
                            {task.objectName || "Обект"} · {task.client || "Клиент"}
                          </span>
                          {task.sourceLabel || task.sourceProtocolNumber ? (
                            <span className="text-xs font-black uppercase leading-5 text-slate-400">
                              {task.sourceLabel ||
                                `Протокол №${task.sourceProtocolNumber}`}
                            </span>
                          ) : null}
                        </div>
                        {visibleActivities.length ? (
                          <div className="mt-2 space-y-1 text-sm font-medium leading-6 text-slate-500">
                            {visibleActivities.map((activity, index) => (
                              <div key={`${task.id}-activity-${index}`} className="flex gap-2">
                                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-orange-500" />
                                <span>{activity}</span>
                              </div>
                            ))}
                            {hiddenActivities ? (
                              <div className="pl-3 text-xs font-black text-slate-400">
                                + още {hiddenActivities} дейности
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:min-w-[330px] xl:justify-end">
                      <Badge variant="warning">{formatTaskDate(task.dueDate)}</Badge>
                      {task.objectCode ? (
                        <Link
                          href={`/locations/${encodeURIComponent(task.objectCode)}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                        >
                          Отвори обект
                        </Link>
                      ) : null}
                      {!isCompleted ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => completeTask(task.id)}
                        >
                          <CheckCircle2 size={17} />
                          Завърши
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <CalendarCheck size={22} />
            </div>
            <h2 className="mt-4 text-lg font-black text-slate-900">
              Няма активни задачи
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Няма записи за избрания филтър.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
