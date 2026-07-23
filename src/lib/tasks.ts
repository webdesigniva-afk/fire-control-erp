import { createSupabaseBrowserClient } from "./supabase/client";

export type ServiceTaskStatus =
  | "planned"
  | "done"
  | "open"
  | "completed"
  | "resolved"
  | "NEW"
  | "PLANNED"
  | "IN_PROGRESS"
  | "WAITING"
  | "COMPLETED"
  | "CANCELLED";

export type ProblemStatus =
  | "OPEN"
  | "PLANNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CLOSED";

export type ProblemSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TaskType = "PROBLEM" | "VISIT" | "SERVICE" | "CALL" | "REPAIR";

export type ServiceTaskActivity = {
  row: string;
  title: string;
  description: string;
  recurrenceMonths: number;
};

export type ServiceTask = {
  id: string;
  relatedProblemId?: string;
  protocolId?: string;
  title: string;
  description: string;
  taskType: string;
  type?: TaskType | string;
  activities: ServiceTaskActivity[];
  objectCode: string;
  objectId?: string;
  objectName: string;
  client: string;
  assignedTo?: string;
  dueDate: string;
  dueTime?: string;
  sourceProtocolId?: string;
  sourceProtocolNumber?: string;
  sourceProtocolRow?: string;
  sourceProtocolType?: string;
  sourceLabel?: string;
  recurrenceMonths?: number;
  resolutionType?: string;
  resolutionNote?: string;
  resolutionDate?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  status: ServiceTaskStatus;
  createdAt: number;
  completedAt?: string;
};

export type Problem = {
  id: string;
  objectId: string;
  protocolId?: string;
  title: string;
  description: string;
  severity: ProblemSeverity;
  status: ProblemStatus;
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
  linkedTasks?: ServiceTask[];
};

export type ProblemResolutionInput = {
  resolutionType: string;
  note: string;
  date: string;
  technician: string;
};

export const serviceTasksStorageKey = "firecontrol:tasks";
export const serviceTasksUpdatedEvent = "firecontrol:tasks-updated";

function createTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTaskStatus(value: unknown): ServiceTaskStatus {
  if (
    value === "done" ||
    value === "open" ||
    value === "completed" ||
    value === "planned" ||
    value === "resolved" ||
    value === "NEW" ||
    value === "PLANNED" ||
    value === "IN_PROGRESS" ||
    value === "WAITING" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  ) {
    return value;
  }

  return "planned";
}

function normalizeProblemStatus(value: unknown): ProblemStatus {
  if (
    value === "OPEN" ||
    value === "PLANNED" ||
    value === "IN_PROGRESS" ||
    value === "RESOLVED" ||
    value === "CLOSED"
  ) {
    return value;
  }

  if (value === "resolved" || value === "completed" || value === "done") {
    return "RESOLVED";
  }
  if (value === "planned") return "PLANNED";
  return "OPEN";
}

function normalizeProblemSeverity(value: unknown): ProblemSeverity {
  if (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "CRITICAL"
  ) {
    return value;
  }

  return "MEDIUM";
}

export function readServiceTasks(): ServiceTask[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(serviceTasksStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ServiceTask[]) : [];
  } catch {
    return [];
  }
}

export function writeServiceTasks(tasks: ServiceTask[]) {
  window.localStorage.setItem(serviceTasksStorageKey, JSON.stringify(tasks));
  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

function mapTaskRow(row: Record<string, unknown>): ServiceTask {
  const activities = mapTaskActivities(row["activities"]);
  const fallbackActivity =
    !activities.length && String(row["title"] ?? "").trim()
      ? [
          {
            row: String(row["source_protocol_row"] ?? ""),
            title: String(row["title"] ?? ""),
            description: String(row["description"] ?? row["title"] ?? ""),
            recurrenceMonths: Number(row["recurrence_months"] ?? 0) || 0,
          },
        ]
      : [];

  return {
    id: String(row["id"] ?? ""),
    relatedProblemId: String(row["related_problem_id"] ?? "") || undefined,
    protocolId: String(row["protocol_id"] ?? "") || undefined,
    title: String(row["title"] ?? ""),
    description: String(row["description"] ?? ""),
    taskType: String(row["task_type"] ?? "") || "Планирано посещение",
    type: String(row["type"] ?? row["task_type"] ?? "") || undefined,
    activities: activities.length ? activities : fallbackActivity,
    objectCode: String(row["object_code"] ?? ""),
    objectId: String(row["object_id"] ?? "") || undefined,
    objectName: String(row["object_name"] ?? ""),
    client: String(row["client"] ?? ""),
    assignedTo: String(row["assigned_to"] ?? "") || undefined,
    dueDate: String(row["due_date"] ?? ""),
    dueTime: String(row["due_time"] ?? "") || undefined,
    sourceProtocolId: String(row["source_protocol_id"] ?? "") || undefined,
    sourceProtocolNumber: String(row["source_protocol_number"] ?? "") || undefined,
    sourceProtocolRow: String(row["source_protocol_row"] ?? "") || undefined,
    sourceProtocolType: String(row["source_protocol_type"] ?? "") || undefined,
    sourceLabel: String(row["source_label"] ?? "") || undefined,
    recurrenceMonths: Number(row["recurrence_months"] ?? 0) || undefined,
    resolutionType: String(row["resolution_type"] ?? "") || undefined,
    resolutionNote: String(row["resolution_note"] ?? "") || undefined,
    resolutionDate: String(row["resolution_date"] ?? "") || undefined,
    resolvedBy: String(row["resolved_by"] ?? "") || undefined,
    resolvedAt: String(row["resolved_at"] ?? "") || undefined,
    status: normalizeTaskStatus(row["status"]),
    createdAt: Number(row["created_at_ms"] ?? 0),
    completedAt: String(row["completed_at"] ?? "") || undefined,
  };
}

function mapProblemRow(row: Record<string, unknown>): Problem {
  return {
    id: String(row["id"] ?? ""),
    objectId: String(row["object_id"] ?? ""),
    protocolId: String(row["protocol_id"] ?? "") || undefined,
    title: String(row["title"] ?? "") || "Проблем",
    description: String(row["description"] ?? ""),
    severity: normalizeProblemSeverity(row["severity"]),
    status: normalizeProblemStatus(row["status"]),
    assignedTo: String(row["assigned_to"] ?? "") || undefined,
    createdAt: String(row["created_at"] ?? ""),
    resolvedAt: String(row["resolved_at"] ?? "") || undefined,
  };
}

function taskPayload(task: ServiceTask) {
  return {
    id: task.id,
    related_problem_id: task.relatedProblemId || null,
    protocol_id: task.protocolId || task.sourceProtocolId || null,
    title: task.title || "",
    description: task.description || task.title || "",
    task_type: task.taskType || "Планирано посещение",
    activities: task.activities,
    object_code: task.objectCode,
    object_id: task.objectId || task.objectCode || null,
    object_name: task.objectName,
    client: task.client,
    assigned_to: task.assignedTo || null,
    due_date: task.dueDate || null,
    due_time: task.dueTime || null,
    source_protocol_id: task.sourceProtocolId || null,
    source_protocol_number: task.sourceProtocolNumber || null,
    source_protocol_row: task.sourceProtocolRow || null,
    source_protocol_type: task.sourceProtocolType || null,
    source_label: task.sourceLabel || null,
    recurrence_months: task.recurrenceMonths || null,
    resolution_type: task.resolutionType || null,
    resolution_note: task.resolutionNote || null,
    resolution_date: task.resolutionDate || null,
    resolved_by: task.resolvedBy || null,
    resolved_at: task.resolvedAt || null,
    completed_at: task.completedAt || null,
    status: task.status,
    created_at_ms: task.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function legacyTaskPayload(task: ServiceTask) {
  const payload = taskPayload(task) as Record<string, unknown>;
  delete payload["object_id"];
  delete payload["source_protocol_id"];
  delete payload["source_protocol_type"];
  return payload;
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.includes("does not exist"));
}

function isMissingTableError(
  error: { message?: string } | null | undefined,
  tableName: string
) {
  const message = error?.message ?? "";
  return (
    message.includes(`Could not find the table 'public.${tableName}'`) ||
    message.includes(`relation "public.${tableName}" does not exist`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

function missingColumnName(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  const schemaCacheMatch = message.match(/'([^']+)' column/);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const missingColumnMatch = message.match(/column [^.]+\.([a-zA-Z0-9_]+) does not exist/);
  return missingColumnMatch?.[1] ?? "";
}

async function upsertTaskPayloadWithFallback(task: ServiceTask) {
  const supabase = createSupabaseBrowserClient();
  const payload = taskPayload(task) as Record<string, unknown>;
  const removableColumns = [
    "related_problem_id",
    "protocol_id",
    "activities",
    "description",
    "task_type",
    "object_id",
    "source_protocol_id",
    "due_time",
    "source_protocol_row",
    "source_protocol_type",
    "source_label",
    "recurrence_months",
    "resolution_type",
    "resolution_note",
    "resolution_date",
    "resolved_by",
    "resolved_at",
    "completed_at",
  ];

  for (let attempt = 0; attempt <= removableColumns.length; attempt += 1) {
    const { error } = await supabase
      .from("service_tasks")
      .upsert(payload, { onConflict: "id" });

    if (!error) return;

    const column = missingColumnName(error);
    if (!column || !(column in payload)) {
      throw new Error(error.message);
    }

    delete payload[column];
  }
}

function mapTaskActivities(value: unknown): ServiceTaskActivity[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = String(record["title"] ?? "").trim();
      const description = String(record["description"] ?? title).trim();
      const recurrenceMonths = Number(record["recurrenceMonths"] ?? 0) || 0;

      if (!title) return null;

      return {
        row: String(record["row"] ?? ""),
        title,
        description,
        recurrenceMonths,
      };
    })
    .filter((item): item is ServiceTaskActivity => item !== null);
}

function describeActivities(activities: ServiceTaskActivity[]) {
  return activities.map((activity) => `• ${activity.title}`).join("\n");
}

function groupActivitiesByDueDate(
  baseDueDate: string,
  activities: ServiceTaskActivity[]
) {
  const grouped = new Map<string, ServiceTaskActivity[]>();

  for (const activity of activities) {
    if (!activity.recurrenceMonths) continue;
    const dueDate = addMonthsToInputDate(baseDueDate, activity.recurrenceMonths);
    grouped.set(dueDate, [...(grouped.get(dueDate) ?? []), activity]);
  }

  return grouped;
}

function addMonthsToInputDate(value: string, months: number) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);

  if (date.getDate() < day) {
    date.setDate(0);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateDay = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateDay}`;
}

export function recurrenceMonthsFromPeriodicity(periodicity: string) {
  const normalized = periodicity
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (normalized === "ежемесечно") return 1;
  if (
    normalized === "на три месеца" ||
    normalized === "на три месеца (3/6/9/12)"
  ) {
    return 3;
  }
  if (normalized === "годишно" || normalized === "годишно (12)") return 12;

  return 0;
}

export async function readServiceTasksFromSupabase(): Promise<ServiceTask[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("service_tasks")
    .select("*")
    .order("due_date", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(mapTaskRow);
}

export async function writeServiceTasksToSupabase(tasks: ServiceTask[]) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("service_tasks")
    .upsert(tasks.map(taskPayload), { onConflict: "id" });

  if (error) throw new Error(error.message);
  writeServiceTasks(tasks);
}

export async function deleteServiceTasks(taskIds: string[]) {
  const ids = Array.from(new Set(taskIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("service_tasks")
    .delete()
    .in("id", ids);

  if (error) throw new Error(error.message);

  writeServiceTasks(readServiceTasks().filter((task) => !ids.includes(task.id)));
  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

export async function createManualServiceTask(input: {
  title: string;
  description?: string;
  taskType: string;
  objectId?: string;
  objectCode?: string;
  objectName: string;
  address?: string;
  client?: string;
  assignedTo?: string;
  dueDate: string;
  dueTime?: string;
}) {
  const title = input.title.trim() || input.taskType || "Задача";
  const dueTime = input.dueTime?.trim() ?? "";
  const descriptionParts = [
    input.description?.trim() ?? "",
    input.assignedTo?.trim() ? `Отговорник: ${input.assignedTo.trim()}` : "",
    input.address?.trim() ? `Адрес: ${input.address.trim()}` : "",
    dueTime ? `Час: ${dueTime}` : "",
  ].filter(Boolean);

  const task: ServiceTask = {
    id: createTaskId(),
    title,
    description: descriptionParts.join("\n"),
    taskType: input.taskType || "Ръчна задача",
    type: "VISIT",
    activities: [
      {
        row: "",
        title,
        description: input.description?.trim() ?? "",
        recurrenceMonths: 0,
      },
    ],
    objectCode: input.objectCode || input.objectId || "",
    objectId: input.objectId || undefined,
    objectName: input.objectName.trim(),
    client: input.client?.trim() ?? "",
    assignedTo: input.assignedTo?.trim() || undefined,
    dueDate: input.dueDate,
    dueTime: dueTime || undefined,
    sourceProtocolType: "manual",
    sourceLabel: "Ръчна задача",
    status: "planned",
    createdAt: Date.now(),
  };

  await upsertTaskPayloadWithFallback(task);
  writeServiceTasks([task, ...readServiceTasks().filter((item) => item.id !== task.id)]);
  return task;
}

export async function saveServiceTask(task: ServiceTask) {
  await upsertTaskPayloadWithFallback(task);
  writeServiceTasks([task, ...readServiceTasks().filter((item) => item.id !== task.id)]);
  return task;
}

export async function updateServiceTaskStatus(
  taskId: string,
  status: ServiceTaskStatus
) {
  const supabase = createSupabaseBrowserClient();
  let completedTask: ServiceTask | null = null;

  if (status === "done") {
    const { data, error } = await supabase
      .from("service_tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    completedTask = data ? mapTaskRow(data as Record<string, unknown>) : null;
  }

  const { error } = await supabase
    .from("service_tasks")
    .update({
      status,
      completed_at:
        status === "done" || status === "completed"
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (isMissingColumnError(error)) {
    const { error: fallbackError } = await supabase
      .from("service_tasks")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (fallbackError) throw new Error(fallbackError.message);
  } else if (error) {
    throw new Error(error.message);
  }

  if (status === "done" && completedTask?.sourceProtocolNumber) {
    const activities =
      completedTask.activities.length > 0
        ? completedTask.activities
        : [
            {
              row: completedTask.sourceProtocolRow || "",
              title: completedTask.title,
              description: completedTask.description || completedTask.title,
              recurrenceMonths: completedTask.recurrenceMonths || 0,
            },
          ];
    const groupedActivities = groupActivitiesByDueDate(
      completedTask.dueDate,
      activities
    );

    for (const [nextDueDate, nextActivities] of groupedActivities) {
      await upsertServiceTask({
        title: completedTask.title,
        description: describeActivities(nextActivities),
        taskType: completedTask.taskType || "Планирано посещение",
        activities: nextActivities,
        objectCode: completedTask.objectCode,
        objectId: completedTask.objectId,
        objectName: completedTask.objectName,
        client: completedTask.client,
        dueDate: nextDueDate,
        sourceProtocolId: completedTask.sourceProtocolId,
        sourceProtocolNumber: completedTask.sourceProtocolNumber,
        sourceProtocolRow: nextDueDate,
        sourceLabel: completedTask.sourceLabel,
        recurrenceMonths: undefined,
        status: "planned",
      });
    }

    window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
    return;
  }

  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

export async function readProblemsFromSupabase(): Promise<Problem[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("problems")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(mapProblemRow);
}

export async function readTasksForProblem(problemId: string): Promise<ServiceTask[]> {
  if (!problemId) return [];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("service_tasks")
    .select("*")
    .eq("related_problem_id", problemId)
    .order("created_at_ms", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[]) ?? []).map(mapTaskRow);
}

export async function resolveProblem(
  problemId: string,
  resolution: ProblemResolutionInput
) {
  const supabase = createSupabaseBrowserClient();
  const { data: userData } = await supabase.auth.getUser();
  const resolvedBy =
    resolution.technician || userData.user?.email || userData.user?.id || "current-user";
  const resolvedAt = new Date().toISOString();

  const { error } = await supabase
    .from("problems")
    .update({
      status: "RESOLVED",
      resolution_type: resolution.resolutionType,
      resolution_note: resolution.note,
      resolution_date: resolution.date || resolvedAt.slice(0, 10),
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
      updated_at: resolvedAt,
    })
    .eq("id", problemId);

  if (error) throw new Error(error.message);
  await supabase
    .from("service_tasks")
    .update({
      status: "resolved",
      resolution_type: resolution.resolutionType,
      resolution_note: resolution.note,
      resolution_date: resolution.date || resolvedAt.slice(0, 10),
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
      completed_at: resolvedAt,
      updated_at: resolvedAt,
    })
    .eq("related_problem_id", problemId);
  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

async function resolveLegacyDefectTask(
  taskOrProblemId: string,
  resolution: ProblemResolutionInput
) {
  const supabase = createSupabaseBrowserClient();
  const resolvedAt = new Date().toISOString();
  const resolvedBy = resolution.technician || "current-user";

  let { error } = await supabase
    .from("service_tasks")
    .update({
      status: "resolved",
      resolution_type: resolution.resolutionType,
      resolution_note: resolution.note,
      resolution_date: resolution.date || resolvedAt.slice(0, 10),
      resolved_at: resolvedAt,
      resolved_by: resolvedBy,
      completed_at: resolvedAt,
      updated_at: resolvedAt,
    })
    .eq("id", taskOrProblemId);

  if (isMissingColumnError(error)) {
    const fallback = await supabase
      .from("service_tasks")
      .update({
        status: "resolved",
        completed_at: resolvedAt,
        updated_at: resolvedAt,
      })
      .eq("id", taskOrProblemId);
    error = fallback.error;
  }

  if (error) throw new Error(error.message);
  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

export async function resolveDefectTask(
  taskOrProblemId: string,
  resolution: ProblemResolutionInput = {
    resolutionType: "Друго",
    note: "",
    date: new Date().toISOString().slice(0, 10),
    technician: "",
  }
) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("service_tasks")
    .select("related_problem_id")
    .eq("id", taskOrProblemId)
    .maybeSingle();

  if (isMissingColumnError(error)) {
    await resolveLegacyDefectTask(taskOrProblemId, resolution);
    return;
  }

  if (error) throw new Error(error.message);

  const row = (data as Record<string, unknown> | null) ?? null;
  const problemId = String(row?.["related_problem_id"] ?? "");

  if (!problemId) {
    await resolveLegacyDefectTask(taskOrProblemId, resolution);
    return;
  }

  try {
    await resolveProblem(problemId, resolution);
  } catch (err) {
    if (isMissingTableError(err as { message?: string }, "problems")) {
      await resolveLegacyDefectTask(taskOrProblemId, resolution);
      return;
    }

    throw err;
  }
}

export async function upsertDefectTask(
  task: Omit<
    ServiceTask,
    "id" | "createdAt" | "taskType" | "status" | "dueDate"
  > & {
    dueDate?: string;
  }
) {
  const supabase = createSupabaseBrowserClient();
  const sourceProtocolId =
    task.sourceProtocolId || task.sourceProtocolNumber || task.sourceLabel || "";
  const sourceProtocolNumber = task.sourceProtocolNumber || sourceProtocolId;
  const sourceProtocolRow = task.sourceProtocolRow || task.title;

  if (!sourceProtocolId || !sourceProtocolRow) {
    throw new Error("Missing defect source protocol or checklist row.");
  }

  async function upsertLegacyDefectTask() {
    let existingDbTask: ServiceTask | null = null;
    const { data, error } = await supabase
      .from("service_tasks")
      .select("*")
      .eq("source_protocol_number", sourceProtocolNumber)
      .eq("source_protocol_row", sourceProtocolRow)
      .eq("task_type", "defect")
      .order("created_at_ms", { ascending: true })
      .limit(1);

    if (!error && Array.isArray(data) && data[0]) {
      existingDbTask = mapTaskRow(data[0] as Record<string, unknown>);
    }

    const nextTask: ServiceTask = {
      ...task,
      id: existingDbTask?.id ?? createTaskId(),
      taskType: "defect",
      dueDate: task.dueDate || "",
      sourceProtocolId,
      sourceProtocolNumber,
      sourceProtocolRow,
      status:
        existingDbTask?.status === "completed" ||
        existingDbTask?.status === "done" ||
        existingDbTask?.status === "resolved"
          ? existingDbTask.status
          : "open",
      createdAt: existingDbTask?.createdAt || Date.now(),
    };

    await upsertTaskPayloadWithFallback(nextTask);
    window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
  }

  let { data: problemData, error: problemError } = await supabase
    .from("problems")
    .select("*")
    .eq("protocol_id", sourceProtocolId)
    .eq("object_id", task.objectId || task.objectCode)
    .eq("title", task.title)
    .order("created_at", { ascending: true })
    .limit(1);

  if (isMissingTableError(problemError, "problems")) {
    await upsertLegacyDefectTask();
    return;
  }

  if (problemError) throw new Error(problemError.message);

  let problem = Array.isArray(problemData) && problemData[0]
    ? mapProblemRow(problemData[0] as Record<string, unknown>)
    : null;
  const now = new Date().toISOString();

  if (!problem) {
    const { data: insertedProblem, error: insertProblemError } = await supabase
      .from("problems")
      .insert({
        object_id: task.objectId || task.objectCode || "",
        protocol_id: sourceProtocolId,
        title: task.title || "Проблем",
        description: task.description || task.title || "",
        severity: "MEDIUM",
        status: "OPEN",
        assigned_to: task.assignedTo || null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (isMissingTableError(insertProblemError, "problems")) {
      await upsertLegacyDefectTask();
      return;
    }

    if (insertProblemError) throw new Error(insertProblemError.message);
    problem = mapProblemRow(insertedProblem as Record<string, unknown>);
  }

  let { data: existingTasks, error: taskLookupError } = await supabase
    .from("service_tasks")
    .select("*")
    .eq("related_problem_id", problem.id)
    .eq("source_protocol_row", sourceProtocolRow)
    .order("created_at_ms", { ascending: true })
    .limit(1);

  if (isMissingColumnError(taskLookupError)) {
    const fallbackResult = await supabase
      .from("service_tasks")
      .select("*")
      .eq("source_protocol_number", sourceProtocolNumber)
      .eq("source_protocol_row", sourceProtocolRow)
      .order("created_at_ms", { ascending: true })
      .limit(1);

    existingTasks = fallbackResult.data;
    taskLookupError = fallbackResult.error;
  }

  if (taskLookupError) throw new Error(taskLookupError.message);

  const existingDbTask = Array.isArray(existingTasks) && existingTasks[0]
    ? mapTaskRow(existingTasks[0] as Record<string, unknown>)
    : null;
  const taskId = existingDbTask?.id ?? createTaskId();

  await upsertTaskPayloadWithFallback({
    ...task,
    id: taskId,
    relatedProblemId: problem.id,
    protocolId: sourceProtocolId,
    title: task.title || problem.title,
    description: task.description || problem.description || problem.title,
    taskType: "PROBLEM",
    dueDate: task.dueDate || "",
    sourceProtocolId,
    sourceProtocolNumber,
    sourceProtocolRow,
    status: existingDbTask?.status || "NEW",
    createdAt: existingDbTask?.createdAt || Date.now(),
  });

  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

function taskHasMatchingRecurrence(
  row: Record<string, unknown>,
  recurrenceMonths: Set<number>,
  dueDates: Set<string>
) {
  const directRecurrence = Number(row["recurrence_months"] ?? 0) || 0;
  if (directRecurrence && recurrenceMonths.has(directRecurrence)) return true;

  const activities = mapTaskActivities(row["activities"]);
  if (activities.some((activity) => recurrenceMonths.has(activity.recurrenceMonths))) {
    return true;
  }

  const dueDate = String(row["due_date"] ?? "");
  return activities.length === 0 && dueDate && dueDates.has(dueDate);
}

function normalizedTaskIdentityText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function taskActivitiesIdentity(activities: ServiceTaskActivity[]) {
  return activities
    .map((activity) =>
      [
        normalizedTaskIdentityText(activity.row),
        activity.recurrenceMonths || 0,
        normalizedTaskIdentityText(activity.title),
      ].join(":")
    )
    .sort()
    .join("|");
}

function extinguisherServiceActionKey(task: Pick<ServiceTask, "title" | "description" | "activities">) {
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

  if (haystack.includes("хидростат")) return "hydrostatic";
  if (haystack.includes("презареж") || haystack.includes("презаряд")) {
    return "recharge";
  }
  if (haystack.includes("техническо обслуж")) return "technical-service";

  return normalizedTaskIdentityText(task.title);
}

function isSubscriptionPlannedTask(task: ServiceTask) {
  const haystack = [
    task.sourceProtocolType,
    task.sourceLabel,
    task.title,
    task.description,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes("абонамент") || haystack.includes("subscription");
}

function isExtinguisherPlannedTask(task: ServiceTask) {
  const haystack = [
    task.sourceProtocolType,
    task.sourceLabel,
    task.title,
    task.description,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes("пожарогас") || haystack.includes("extinguisher");
}

async function readPlannedTasksForObjectKeys(objectKeys: string[]) {
  const supabase = createSupabaseBrowserClient();
  const keys = Array.from(new Set(objectKeys.map((key) => key.trim()).filter(Boolean)));
  const rowsById = new Map<string, Record<string, unknown>>();

  async function mergeRows(column: "object_code" | "object_id" | "object_name", value: string) {
    const { data, error } = await supabase
      .from("service_tasks")
      .select("*")
      .eq("status", "planned")
      .eq(column, value);

    if (error) throw new Error(error.message);

    for (const row of (data as Record<string, unknown>[] | null) ?? []) {
      const id = String(row["id"] ?? "");
      if (id) rowsById.set(id, row);
    }
  }

  for (const key of keys) {
    await mergeRows("object_code", key);
    await mergeRows("object_id", key);
    await mergeRows("object_name", key);
  }

  return Array.from(rowsById.values()).map(mapTaskRow);
}

export async function clearPlannedSubscriptionTasksForObject(
  objectKeys: string[],
  recurrenceMonthValues: number[],
  dueDateValues: string[]
) {
  const supabase = createSupabaseBrowserClient();
  const keys = Array.from(new Set(objectKeys.map((key) => key.trim()).filter(Boolean)));
  const plannedTaskType = "Планирано посещение";
  const recurrenceMonths = new Set(
    recurrenceMonthValues.filter((value) => Number.isFinite(value) && value > 0)
  );
  const dueDates = new Set(dueDateValues.filter(Boolean));
  const rowsById = new Map<string, Record<string, unknown>>();

  for (const key of keys) {
    let { data, error } = await supabase
      .from("service_tasks")
      .select("*")
      .eq("status", "planned")
      .eq("task_type", plannedTaskType)
      .eq("object_code", key);

    if (isMissingColumnError(error)) {
      const fallback = await supabase
        .from("service_tasks")
        .select("*")
        .eq("status", "planned")
        .eq("object_code", key);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    for (const row of (data as Record<string, unknown>[] | null) ?? []) {
      const id = String(row["id"] ?? "");
      if (id) rowsById.set(id, row);
    }

    let nameResult = await supabase
      .from("service_tasks")
      .select("*")
      .eq("status", "planned")
      .eq("task_type", plannedTaskType)
      .eq("object_name", key);

    if (isMissingColumnError(nameResult.error)) {
      nameResult = await supabase
        .from("service_tasks")
        .select("*")
        .eq("status", "planned")
        .eq("object_name", key);
    }

    if (nameResult.error) throw new Error(nameResult.error.message);
    for (const row of (nameResult.data as Record<string, unknown>[] | null) ?? []) {
      const id = String(row["id"] ?? "");
      if (id) rowsById.set(id, row);
    }
  }

  const idsToDelete = Array.from(rowsById.values())
    .filter((row) => taskHasMatchingRecurrence(row, recurrenceMonths, dueDates))
    .map((row) => String(row["id"] ?? ""))
    .filter(Boolean);

  if (idsToDelete.length > 0) {
    const { error } = await supabase
      .from("service_tasks")
      .delete()
      .in("id", idsToDelete);

    if (error) throw new Error(error.message);
  }
}

export async function upsertPlannedSubscriptionTaskForObject(
  objectKeys: string[],
  task: Omit<ServiceTask, "id" | "createdAt">
) {
  const existing = readServiceTasks();
  const candidates = await readPlannedTasksForObjectKeys(objectKeys);
  const nextIdentity = taskActivitiesIdentity(task.activities);
  const existingDbTask =
    candidates.find(
      (candidate) =>
        isSubscriptionPlannedTask(candidate) &&
        taskActivitiesIdentity(candidate.activities) === nextIdentity
    ) ?? null;

  const nextTask = {
    ...task,
    id: existingDbTask?.id ?? createTaskId(),
    createdAt: existingDbTask?.createdAt || Date.now(),
  };

  await upsertTaskPayloadWithFallback(nextTask);
  writeServiceTasks([nextTask, ...existing.filter((item) => item.id !== nextTask.id)]);
}

export async function upsertPlannedEquipmentServiceTask(
  task: Omit<ServiceTask, "id" | "createdAt">
) {
  const existing = readServiceTasks();
  const supabase = createSupabaseBrowserClient();
  let existingDbTask: ServiceTask | null = null;

  if (task.sourceProtocolRow) {
    const { data, error } = await supabase
      .from("service_tasks")
      .select("*")
      .eq("status", "planned")
      .eq("source_protocol_row", task.sourceProtocolRow)
      .order("created_at_ms", { ascending: true });

    if (error) throw new Error(error.message);

    const serviceActionKey = extinguisherServiceActionKey(task);
    existingDbTask =
      ((data as Record<string, unknown>[] | null) ?? [])
        .map(mapTaskRow)
        .find(
          (candidate) =>
            isExtinguisherPlannedTask(candidate) &&
            extinguisherServiceActionKey(candidate) === serviceActionKey
        ) ?? null;
  }

  const nextTask = {
    ...task,
    id: existingDbTask?.id ?? createTaskId(),
    createdAt: existingDbTask?.createdAt || Date.now(),
  };

  await upsertTaskPayloadWithFallback(nextTask);
  writeServiceTasks([nextTask, ...existing.filter((item) => item.id !== nextTask.id)]);
}

export async function completePlannedEquipmentTasks(
  equipmentId: string,
  currentProtocolNumber?: string
) {
  const supabase = createSupabaseBrowserClient();
  if (!equipmentId) return;

  let query = supabase
    .from("service_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "planned")
    .eq("source_protocol_row", equipmentId);

  if (currentProtocolNumber) {
    query = query.neq("source_protocol_number", currentProtocolNumber);
  }

  const { error } = await query;

  if (isMissingColumnError(error)) {
    let fallbackQuery = supabase
      .from("service_tasks")
      .update({
        status: "done",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "planned")
      .eq("source_protocol_row", equipmentId);

    if (currentProtocolNumber) {
      fallbackQuery = fallbackQuery.neq("source_protocol_number", currentProtocolNumber);
    }

    const { error: fallbackError } = await fallbackQuery;
    if (fallbackError) throw new Error(fallbackError.message);
  } else if (error) {
    throw new Error(error.message);
  }

  window.dispatchEvent(new Event(serviceTasksUpdatedEvent));
}

export async function upsertServiceTask(task: Omit<ServiceTask, "id" | "createdAt">) {
  const existing = readServiceTasks();
  const supabase = createSupabaseBrowserClient();
  let existingDbTask: ServiceTask | null = null;

  if (task.sourceProtocolNumber && task.dueDate) {
    let query = supabase
      .from("service_tasks")
      .select("*")
      .eq("source_protocol_number", task.sourceProtocolNumber)
      .eq("due_date", task.dueDate)
      .eq("status", "planned")
      .order("created_at_ms", { ascending: true });

    if (task.sourceProtocolRow) {
      query = query.eq("source_protocol_row", task.sourceProtocolRow);
    }

    query = query.limit(1);

    const { data, error } = await query;

    if (error) throw new Error(error.message);
    existingDbTask = Array.isArray(data) && data[0]
      ? mapTaskRow(data[0] as Record<string, unknown>)
      : null;
  } else if (task.sourceProtocolNumber) {
    const { data, error } = await supabase
      .from("service_tasks")
      .select("*")
      .eq("source_protocol_number", task.sourceProtocolNumber)
      .eq("status", "planned")
      .order("created_at_ms", { ascending: true })
      .limit(1);

    if (error) throw new Error(error.message);
    existingDbTask = Array.isArray(data) && data[0]
      ? mapTaskRow(data[0] as Record<string, unknown>)
      : null;
  }

  const nextTask = {
    ...task,
    id: existingDbTask?.id ?? createTaskId(),
    createdAt: existingDbTask?.createdAt || Date.now(),
  };

  await upsertTaskPayloadWithFallback(nextTask);

  const filtered = existing.filter(
    (item) =>
      !(
        item.sourceProtocolNumber &&
        item.sourceProtocolNumber === task.sourceProtocolNumber &&
        (!task.dueDate || item.dueDate === task.dueDate) &&
        (!task.sourceProtocolRow || item.sourceProtocolRow === task.sourceProtocolRow)
      )
  );

  writeServiceTasks([nextTask, ...filtered]);
}

export function formatTaskDate(value: string) {
  if (!value) return "Без дата";
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}
