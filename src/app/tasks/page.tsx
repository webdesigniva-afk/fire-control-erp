"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, ClipboardCheck } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  type ServiceTask,
  formatTaskDate,
  readServiceTasks,
  readServiceTasksFromSupabase,
  serviceTasksUpdatedEvent,
  updateServiceTaskStatus,
} from "../../lib/tasks";

export default function TasksPage() {
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function refreshTasks() {
      try {
        const dbTasks = await readServiceTasksFromSupabase();
        setTasks(dbTasks);
      } catch {
        setTasks(readServiceTasks());
      }
    }

    void refreshTasks();
    window.addEventListener(serviceTasksUpdatedEvent, refreshTasks);
    window.addEventListener("storage", refreshTasks);

    return () => {
      window.removeEventListener(serviceTasksUpdatedEvent, refreshTasks);
      window.removeEventListener("storage", refreshTasks);
    };
  }, []);

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

  function isCompletedTask(task: ServiceTask) {
    const status = normalizedTaskStatus(task);
    return status === "completed" || status === "done" || status === "resolved";
  }

  const plannedTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks
      .filter((task) => {
        const type = normalizedTaskType(task);
        const taskTypeText = task.taskType.toLowerCase();
        if (filter === "mine") return Boolean(task.assignedTo);
        if (filter === "problems") return isProblemTask(task) && !isCompletedTask(task);
        if (filter === "visits") return type === "visit" || taskTypeText.includes("посещение");
        if (filter === "service") return type === "service" || taskTypeText.includes("обслуж");
        if (filter === "repairs") return type === "repair";
        if (filter === "calls") return type === "call";
        if (filter === "overdue") {
          return Boolean(task.dueDate && task.dueDate < today && !isCompletedTask(task));
        }
        if (filter === "completed") return isCompletedTask(task);
        return true;
      })
      .sort((first, second) => (first.dueDate || "9999").localeCompare(second.dueDate || "9999"));
  }, [filter, tasks]);

  async function completeTask(taskId: string) {
    const nextTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, status: "COMPLETED" as const } : task
    );
    setTasks(nextTasks);
    await updateServiceTaskStatus(taskId, "COMPLETED");
  }

  const taskFilters = [
    ["all", "Всички"],
    ["mine", "Мои"],
    ["problems", "Проблеми"],
    ["visits", "Посещения"],
    ["service", "Обслужване"],
    ["repairs", "Ремонти"],
    ["calls", "Обаждания"],
    ["overdue", "Просрочени"],
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
          .map((activity) => activity.title.trim())
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

  function taskDisplayTitle(task: ServiceTask) {
    if (taskRecurrenceLabel(task)) return "Планирано посещение";

    const titles = taskActivityTitles(task);
    if (titles.length === 1) return titles[0];

    return task.taskType || task.title || "Планирано посещение";
  }

  function taskSourceLabel(task: ServiceTask) {
    return (
      task.sourceLabel ||
      (task.sourceProtocolNumber ? `Протокол №${task.sourceProtocolNumber}` : "")
    );
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
            <Badge variant="orange">{plannedTasks.length} активни</Badge>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          {taskFilters.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? "primary" : "outline"}
              size="sm"
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {plannedTasks.length ? (
          <div className="space-y-3">
            {plannedTasks.map((task) => (
              <Card key={task.id} className="p-5" hover>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                        <ClipboardCheck size={18} />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-950">
                          {taskDisplayTitle(task)}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={isProblemTask(task) ? "danger" : "neutral"}>
                            {taskTypeLabel(task)}
                          </Badge>
                          <Badge variant="neutral">{String(task.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm font-black text-slate-600">
                          Дейности: {task.activities?.length || 1}
                        </p>
                        <ul className="mt-2 space-y-1 text-sm font-medium leading-6 text-slate-500">
                          {(task.activities?.length
                            ? task.activities
                            : [{ title: task.title }]
                          ).map((activity, index) => (
                            <li key={`${task.id}-${index}`} className="flex gap-2">
                              <span className="text-orange-500">•</span>
                              <span>{activity.title}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-sm font-medium text-slate-500">
                          {task.objectName || "Обект"} · {task.client || "Клиент"}
                        </p>
                        {task.sourceLabel || task.sourceProtocolNumber ? (
                          <p className="mt-1 text-xs font-black uppercase text-slate-400">
                            {task.sourceLabel ||
                              `Протокол №${task.sourceProtocolNumber}`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Badge variant="warning">{formatTaskDate(task.dueDate)}</Badge>
                    {task.objectCode ? (
                      <Link
                        href={`/locations/${encodeURIComponent(task.objectCode)}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                      >
                        Отвори обект
                      </Link>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => completeTask(task.id)}
                    >
                      <CheckCircle2 size={17} />
                      Завърши
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
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
