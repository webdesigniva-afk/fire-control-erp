import { createSupabaseBrowserClient } from "./supabase/client";

export type WarehouseMovementType =
  | "inbound"
  | "outbound"
  | "transfer"
  | "adjustment";

export type WarehouseLocation = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
};

export type WarehouseItem = {
  id: string;
  name: string;
  category: string;
  sku: string;
  unit: string;
  minimumQuantity: number;
  isActive: boolean;
  notes: string;
};

export type WarehouseStock = {
  itemId: string;
  locationId: string;
  quantity: number;
};

export type WarehouseMovement = {
  id: string;
  itemId: string;
  movementType: WarehouseMovementType;
  quantity: number;
  fromLocationId: string;
  toLocationId: string;
  protocolId: string;
  protocolNumber: string;
  objectId: string;
  objectName: string;
  performedBy: string;
  note: string;
  createdAt: string;
};

export type UsedWarehouseItemInput = {
  itemId: string;
  locationId: string;
  quantity: number;
  note?: string;
};

type DataRecord = Record<string, unknown>;

export function warehouseErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  function formatErrorQuantity(value: string) {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed)) return value;
    return parsed.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
  }

  if (
    normalized.includes("insufficient stock") ||
    normalized.includes("available:")
  ) {
    const availableMatch = message.match(/available:\s*([0-9.,]+)/i);
    const requestedMatch = message.match(/requested:\s*([0-9.,]+)/i);
    const available = formatErrorQuantity(availableMatch?.[1] ?? "0");
    const requested = requestedMatch?.[1]
      ? formatErrorQuantity(requestedMatch[1])
      : "";

    return requested
      ? `Недостатъчна наличност. Налично: ${available}, заявено: ${requested}.`
      : "Недостатъчна наличност в избраната локация.";
  }

  if (normalized.includes("quantity must be positive")) {
    return "Количеството трябва да бъде по-голямо от 0.";
  }

  if (normalized.includes("invalid movement type")) {
    return "Невалиден тип складово движение.";
  }

  if (normalized.includes("inbound movement requires target location")) {
    return "При зареждане трябва да изберете локация.";
  }

  if (normalized.includes("outbound movement requires source location")) {
    return "При изписване трябва да изберете локация.";
  }

  if (normalized.includes("transfer requires source and target locations")) {
    return "При трансфер трябва да изберете начална и крайна локация.";
  }

  if (normalized.includes("transfer locations must be different")) {
    return "При трансфер началната и крайната локация трябва да са различни.";
  }

  if (normalized.includes("adjustment requires a note")) {
    return "Корекцията изисква бележка с причина.";
  }

  if (normalized.includes("protocol number is required")) {
    return "Липсва номер на протокол за складовото изписване.";
  }

  if (normalized.includes("used warehouse item was not found")) {
    return "Използваният складов артикул не беше намерен.";
  }

  if (normalized.includes("has not affected stock")) {
    return "Този ред още не е повлиял на складовата наличност.";
  }

  if (
    normalized.includes("violates row-level security policy") ||
    normalized.includes("permission denied")
  ) {
    return "Нямате право за това складово действие или SQL миграцията за склада не е пусната докрай.";
  }

  if (
    normalized.includes("could not find the table") ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache")
  ) {
    return "Липсват складови таблици или функции. Пуснете sql/warehouse_module.sql в Supabase SQL editor.";
  }

  if (normalized.includes("duplicate key value")) {
    return "Вече има такъв складов запис. Проверете име, код или SKU.";
  }

  if (normalized.includes("violates check constraint")) {
    return "Въведените складови данни не са валидни. Проверете количество, име и задължителни полета.";
  }

  return message || "Възникна грешка при складовата операция.";
}

function throwWarehouseError(message: string) {
  throw new Error(warehouseErrorMessage(message));
}

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function boolValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLocation(row: DataRecord): WarehouseLocation {
  return {
    id: textValue(row, ["id"]),
    name: textValue(row, ["name"]),
    code: textValue(row, ["code"]),
    sortOrder: numberValue(row["sort_order"]),
    isActive: boolValue(row["is_active"], true),
  };
}

function mapItem(row: DataRecord): WarehouseItem {
  return {
    id: textValue(row, ["id"]),
    name: textValue(row, ["name"]),
    category: textValue(row, ["category"]),
    sku: textValue(row, ["sku"]),
    unit: textValue(row, ["unit"]) || "бр.",
    minimumQuantity: numberValue(row["minimum_quantity"]),
    isActive: boolValue(row["is_active"], true),
    notes: textValue(row, ["notes"]),
  };
}

function mapStock(row: DataRecord): WarehouseStock {
  return {
    itemId: textValue(row, ["item_id"]),
    locationId: textValue(row, ["location_id"]),
    quantity: numberValue(row["quantity"]),
  };
}

function mapMovement(row: DataRecord): WarehouseMovement {
  return {
    id: textValue(row, ["id"]),
    itemId: textValue(row, ["item_id"]),
    movementType: textValue(row, ["movement_type"]) as WarehouseMovementType,
    quantity: numberValue(row["quantity"]),
    fromLocationId: textValue(row, ["from_location_id"]),
    toLocationId: textValue(row, ["to_location_id"]),
    protocolId: textValue(row, ["protocol_id"]),
    protocolNumber: textValue(row, ["protocol_number"]),
    objectId: textValue(row, ["object_id"]),
    objectName: textValue(row, ["object_name"]),
    performedBy: textValue(row, ["performed_by"]),
    note: textValue(row, ["note"]),
    createdAt: textValue(row, ["created_at"]),
  };
}

export async function readWarehouseLocations() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("warehouse_locations")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throwWarehouseError(error.message);
  return ((data as DataRecord[] | null) ?? []).map(mapLocation);
}

export async function readWarehouseItems(includeInactive = false) {
  const supabase = createSupabaseBrowserClient();
  let query = supabase
    .from("warehouse_items")
    .select("*")
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throwWarehouseError(error.message);
  return ((data as DataRecord[] | null) ?? []).map(mapItem);
}

export async function readWarehouseStock() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("warehouse_stock").select("*");

  if (error) throwWarehouseError(error.message);
  return ((data as DataRecord[] | null) ?? []).map(mapStock);
}

export async function readWarehouseMovements(itemId?: string) {
  const supabase = createSupabaseBrowserClient();
  let query = supabase
    .from("warehouse_movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(120);

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data, error } = await query;
  if (error) throwWarehouseError(error.message);
  return ((data as DataRecord[] | null) ?? []).map(mapMovement);
}

export async function saveWarehouseItem(
  item: Partial<WarehouseItem> & { name: string }
) {
  const supabase = createSupabaseBrowserClient();
  const payload = {
    name: item.name.trim(),
    category: item.category?.trim() || "Друго",
    sku: item.sku?.trim() || "",
    unit: item.unit?.trim() || "бр.",
    minimum_quantity: item.minimumQuantity ?? 0,
    is_active: item.isActive ?? true,
    notes: item.notes?.trim() || "",
    updated_at: new Date().toISOString(),
  };

  const result = item.id
    ? await supabase.from("warehouse_items").update(payload).eq("id", item.id)
    : await supabase.from("warehouse_items").insert(payload);

  if (result.error) throwWarehouseError(result.error.message);
}

export async function createWarehouseMovement(input: {
  itemId: string;
  movementType: WarehouseMovementType;
  quantity: number;
  fromLocationId?: string;
  toLocationId?: string;
  protocolId?: string;
  protocolNumber?: string;
  objectId?: string;
  objectName?: string;
  performedBy?: string;
  note?: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_warehouse_movement", {
    p_item_id: input.itemId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_from_location_id: input.fromLocationId || null,
    p_to_location_id: input.toLocationId || null,
    p_protocol_id: input.protocolId || null,
    p_protocol_number: input.protocolNumber || "",
    p_object_id: input.objectId || "",
    p_object_name: input.objectName || "",
    p_performed_by: input.performedBy || "",
    p_note: input.note || "",
    p_reversal_of_movement_id: null,
  });

  if (error) throwWarehouseError(error.message);
  return String(data ?? "");
}

export async function finalizeProtocolUsedWarehouseItems(input: {
  protocolId?: string;
  protocolNumber: string;
  objectId: string;
  objectName: string;
  performedBy: string;
  items: UsedWarehouseItemInput[];
}) {
  const supabase = createSupabaseBrowserClient();
  const currentKeys = new Set(
    input.items
      .filter((item) => item.itemId && item.locationId && item.quantity > 0)
      .map(
        (item) =>
          `${item.itemId}|${item.locationId}|${(item.note || "").trim()}`
      )
  );

  const { data: existingRows, error: existingError } = await supabase
    .from("protocol_used_items")
    .select(
      "id,warehouse_item_id,warehouse_location_id,note,deducted_movement_id,voided_at"
    )
    .eq("protocol_number", input.protocolNumber)
    .not("deducted_movement_id", "is", null)
    .is("voided_at", null);

  if (existingError) throwWarehouseError(existingError.message);

  for (const row of (existingRows as DataRecord[] | null) ?? []) {
    const key = `${textValue(row, ["warehouse_item_id"])}|${textValue(
      row,
      ["warehouse_location_id"]
    )}|${textValue(row, ["note"]).trim()}`;

    if (currentKeys.has(key)) continue;

    const { error } = await supabase.rpc("void_protocol_used_item", {
      p_used_item_id: textValue(row, ["id"]),
      p_performed_by: input.performedBy,
      p_note: "Премахнат използван артикул от протокол",
    });

    if (error) throwWarehouseError(error.message);
  }

  for (const item of input.items) {
    if (!item.itemId || !item.locationId || item.quantity <= 0) continue;

    const { error } = await supabase.rpc("finalize_protocol_used_item", {
      p_protocol_id: input.protocolId || null,
      p_protocol_number: input.protocolNumber,
      p_object_id: input.objectId,
      p_object_name: input.objectName,
      p_item_id: item.itemId,
      p_location_id: item.locationId,
      p_quantity: item.quantity,
      p_performed_by: input.performedBy,
      p_note: item.note || "",
    });

    if (error) throwWarehouseError(error.message);
  }
}

export function stockQuantity(
  stock: WarehouseStock[],
  itemId: string,
  locationId: string
) {
  return (
    stock.find((row) => row.itemId === itemId && row.locationId === locationId)
      ?.quantity ?? 0
  );
}

export function totalStock(stock: WarehouseStock[], itemId: string) {
  return stock
    .filter((row) => row.itemId === itemId)
    .reduce((total, row) => total + row.quantity, 0);
}
