import { createSupabaseBrowserClient } from "./supabase/client";
import { geocodeAddress } from "./geocoding";

type DataRecord = Record<string, unknown>;

export type ObjectStatus = string;

export const OBJECT_STATUS_OK = "\u0438\u0437\u0440\u044f\u0434\u0435\u043d";
export const OBJECT_STATUS_UPCOMING = "\u043f\u0440\u0435\u0434\u0441\u0442\u043e\u0438";
export const OBJECT_STATUS_OVERDUE = "\u0434\u043e 7 \u0434\u043d\u0438";

export type DashboardMapObject = {
  id: string;
  name: string;
  status: ObjectStatus;
  nextInspection: string;
  position: [number, number];
  href: string;
};

export type MapLocationItem = {
  id: string;
  qrCode: string;
  name: string;
  address?: string;
  geocodedAddress?: string;
  status: string;
  latitude?: number;
  longitude?: number;
};

export type MapEquipmentItem = {
  locationId: string;
  nextCheckDate: string;
};

export type MapServiceTaskItem = {
  id: string;
  title: string;
  taskType: string;
  objectId?: string;
  objectCode: string;
  objectName: string;
  dueDate: string;
  status: string;
  sourceProtocolId?: string;
  sourceProtocolNumber?: string;
  sourceProtocolRow?: string;
  sourceProtocolType?: string;
  sourceLabel?: string;
};

export type MapObjectsData = {
  locations: MapLocationItem[];
  mapObjects: DashboardMapObject[];
  missingCoordinates: MapLocationItem[];
  upcomingVisitCount: number;
};

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function numberValue(record: DataRecord | null | undefined, keys: string[]) {
  const raw = textValue(record, keys).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeStatus(value: string): ObjectStatus {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("\u043f\u0440\u043e\u0441\u0440\u043e\u0447") ||
    normalized.includes("\u043f\u0440\u043e\u0431\u043b\u0435\u043c") ||
    normalized.includes("overdue") ||
    normalized.includes("problem")
  ) {
    return OBJECT_STATUS_OVERDUE;
  }
  if (normalized.includes("\u043f\u0440\u0435\u0434\u0441\u0442") || normalized.includes("pending")) {
    return OBJECT_STATUS_UPCOMING;
  }
  return OBJECT_STATUS_OK;
}

function dateFromIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(fromKey: string, toKey: string) {
  const from = dateFromIso(fromKey);
  const to = dateFromIso(toKey);
  if (!from || !to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = dateFromIso(value);
  if (!date) return value || "\u043d\u044f\u043c\u0430 \u0434\u0430\u0442\u0430";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function mapLocation(row: DataRecord, index: number): MapLocationItem {
  const id = textValue(row, ["id"]);
  const qrCode = textValue(row, ["qr_code", "code"]) || id;

  return {
    id: id || String(index + 1),
    qrCode,
    name:
      textValue(row, ["name", "object_name", "title"]) ||
      "\u0411\u0435\u0437 \u0438\u043c\u0435",
    address: textValue(row, ["address", "full_address"]),
    geocodedAddress: textValue(row, ["geocoded_address"]),
    status: normalizeStatus(textValue(row, ["status"])),
    latitude: numberValue(row, ["latitude", "lat"]),
    longitude: numberValue(row, ["longitude", "lng", "lon"]),
  };
}

function hasUsableBulgariaCoordinates(location: MapLocationItem) {
  if (
    typeof location.latitude !== "number" ||
    typeof location.longitude !== "number"
  ) {
    return false;
  }

  if (!location.geocodedAddress) return false;

  return (
    location.latitude >= 41.0 &&
    location.latitude <= 44.5 &&
    location.longitude >= 22.0 &&
    location.longitude <= 29.0
  );
}

export async function geocodeMissingLocationCoordinates<T extends MapLocationItem>(
  locations: T[],
  options: { limit?: number; refreshExisting?: boolean } = {}
): Promise<T[]> {
  const supabase = createSupabaseBrowserClient();
  const limit = options.limit ?? 8;
  const refreshExisting = options.refreshExisting ?? false;
  let geocodedCount = 0;
  const nextLocations = [...locations];

  for (let index = 0; index < nextLocations.length; index += 1) {
    const location = nextLocations[index];
    const hasCoordinates = hasUsableBulgariaCoordinates(location);

    if ((!refreshExisting && hasCoordinates) || !location.address || geocodedCount >= limit) continue;

    try {
      const geocoded = await geocodeAddress(location.address);
      if (!geocoded) continue;

      nextLocations[index] = {
        ...location,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
      };
      geocodedCount += 1;

      await supabase
        .from("locations")
        .update({
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          geocoded_address: geocoded.displayName,
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", location.id);
    } catch {
      // Keep the map usable even when a single address cannot be resolved.
    }
  }

  return nextLocations;
}

function mapEquipment(row: DataRecord): MapEquipmentItem {
  return {
    locationId: textValue(row, ["location_id", "object_id", "site_id"]),
    nextCheckDate: textValue(row, ["next_check_date", "next_check"]),
  };
}

function mapServiceTask(row: DataRecord): MapServiceTaskItem {
  return {
    id: textValue(row, ["id"]),
    title: textValue(row, ["title"]),
    taskType: textValue(row, ["task_type"]),
    objectId: textValue(row, ["object_id"]) || undefined,
    objectCode: textValue(row, ["object_code"]),
    objectName: textValue(row, ["object_name"]),
    dueDate: textValue(row, ["due_date"]),
    status: textValue(row, ["status"]),
    sourceProtocolId: textValue(row, ["source_protocol_id"]) || undefined,
    sourceProtocolNumber: textValue(row, ["source_protocol_number"]) || undefined,
    sourceProtocolRow: textValue(row, ["source_protocol_row"]) || undefined,
    sourceProtocolType: textValue(row, ["source_protocol_type"]) || undefined,
    sourceLabel: textValue(row, ["source_label"]) || undefined,
  };
}

function isSalesFlowTask(task: MapServiceTaskItem) {
  const taskType = (task.taskType || "").trim().toLowerCase();
  const sourceProtocolType = (task.sourceProtocolType || "").trim().toLowerCase();
  const sourceLabel = (task.sourceLabel || "").trim().toLowerCase();

  return (
    taskType === "търговско проследяване" ||
    sourceProtocolType === "sales_lead" ||
    sourceLabel === "лийд"
  );
}

function protocolReferenceValues(row: DataRecord) {
  const payload = row["protocol_payload"];
  const payloadRecord =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as DataRecord)
      : null;

  return [
    textValue(row, ["id"]),
    textValue(row, ["protocol_number", "number"]),
    textValue(payloadRecord, ["number", "protocolNumber"]),
  ].filter(Boolean);
}

function taskSourceIsActive(
  task: MapServiceTaskItem,
  activeProtocolRefs: Set<string>
) {
  const directRefs = [
    task.sourceProtocolId,
    task.sourceProtocolNumber,
  ].filter(Boolean) as string[];

  if (directRefs.length === 0 && !task.sourceLabel) return true;
  if (directRefs.some((ref) => activeProtocolRefs.has(ref))) return true;

  const label = task.sourceLabel || "";
  return Array.from(activeProtocolRefs).some((ref) => label.includes(ref));
}

function taskMatchesLocation(task: MapServiceTaskItem, location: MapLocationItem) {
  const locationKeys = new Set(
    [location.id, location.qrCode, location.name].filter(Boolean)
  );

  return [task.objectId, task.objectCode, task.objectName].some((key) =>
    key ? locationKeys.has(key) : false
  );
}

function normalizedTaskPart(value: string | undefined, fallback: string) {
  const normalized = (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || fallback;
}

function isExtinguisherServiceTask(task: MapServiceTaskItem) {
  return [
    task.sourceProtocolType,
    task.sourceLabel,
    task.title,
  ].some((value) => (value || "").toLowerCase().includes("пожарогас")) ||
    (task.sourceProtocolType || "").toLowerCase().includes("extinguisher");
}

export function collapseReplacedEquipmentTasks<T extends MapServiceTaskItem>(
  tasks: T[]
) {
  const collapsed = new Map<string, MapServiceTaskItem>();

  for (const task of tasks) {
    const key = isExtinguisherServiceTask(task)
      ? [
          normalizedTaskPart(task.objectId || task.objectCode || task.objectName, "object"),
          "extinguisher-service",
          normalizedTaskPart(task.sourceProtocolRow || task.title, "equipment"),
        ].join("|")
      : [
          normalizedTaskPart(task.id, "task"),
          normalizedTaskPart(task.dueDate, "date"),
        ].join("|");
    const existing = collapsed.get(key);

    if (!existing || task.dueDate > existing.dueDate) {
      collapsed.set(key, task);
    }
  }

  return Array.from(collapsed.values()) as T[];
}

export function buildMapObjectsData(
  locations: MapLocationItem[],
  _equipment: MapEquipmentItem[],
  tasks: MapServiceTaskItem[],
  todayKey = toLocalDateKey(new Date())
): MapObjectsData {
  const plannedTasks = collapseReplacedEquipmentTasks(
    tasks.filter((task) => task.status === "planned" && !isSalesFlowTask(task))
  );
  let upcomingVisitCount = 0;

  const mapObjects = locations
    .filter(
      (location) =>
        typeof location.latitude === "number" &&
        typeof location.longitude === "number"
    )
    .map((location) => {
      const locationTasks = plannedTasks.filter((task) =>
        taskMatchesLocation(task, location)
      );
      const futureDates = locationTasks
        .map((task) => task.dueDate)
        .filter((date) => date && date >= todayKey)
        .sort((first, second) => first.localeCompare(second));
      const overdueOrUrgentDates = locationTasks
        .map((task) => task.dueDate)
        .filter(
          (date) => date && dateFromIso(date) && daysBetween(todayKey, date) <= 7
        );
      const hasUrgent = overdueOrUrgentDates.length > 0;
      const hasUpcoming = futureDates.some((date) => {
        const days = daysBetween(todayKey, date);
        return days > 7 && days <= 30;
      });

      if (hasUrgent || hasUpcoming) upcomingVisitCount += 1;

      return {
        id: location.id,
        name: location.name,
        status: hasUrgent
          ? OBJECT_STATUS_OVERDUE
          : hasUpcoming
            ? OBJECT_STATUS_UPCOMING
            : OBJECT_STATUS_OK,
        nextInspection: futureDates[0] ? formatDate(futureDates[0]) : "",
        position: [
          location.latitude as number,
          location.longitude as number,
        ] as [number, number],
        href: `/locations/${encodeURIComponent(location.qrCode)}`,
      };
    });

  return {
    locations,
    mapObjects,
    missingCoordinates: locations.filter(
      (location) =>
        typeof location.latitude !== "number" ||
        typeof location.longitude !== "number"
    ),
    upcomingVisitCount,
  };
}

export async function loadMapObjectsData(): Promise<MapObjectsData> {
  const supabase = createSupabaseBrowserClient();
  const [locationsResult, equipmentResult, tasksResult, protocolsResult] =
    await Promise.all([
      supabase.from("locations").select("*").order("name", { ascending: true }),
      supabase.from("equipment").select("*"),
      supabase.from("service_tasks").select("*").eq("status", "planned"),
      supabase.from("protocols").select("*"),
    ]);

  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (equipmentResult.error) throw new Error(equipmentResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (protocolsResult.error) throw new Error(protocolsResult.error.message);

  const activeProtocolRefs = new Set(
    ((protocolsResult.data as DataRecord[]) ?? []).flatMap(protocolReferenceValues)
  );
  const activeTasks = ((tasksResult.data as DataRecord[]) ?? [])
    .map(mapServiceTask)
    .filter((task) => taskSourceIsActive(task, activeProtocolRefs));

  const locations = await geocodeMissingLocationCoordinates(
    ((locationsResult.data as DataRecord[]) ?? []).map(mapLocation),
    { refreshExisting: true, limit: 8 }
  );

  return buildMapObjectsData(
    locations,
    ((equipmentResult.data as DataRecord[]) ?? [])
      .filter((row) => row["archived"] !== true)
      .map(mapEquipment),
    activeTasks
  );
}
