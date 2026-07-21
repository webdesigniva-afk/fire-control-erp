"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Mail,
  PackageCheck,
  PackageOpen,
  PenLine,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Truck,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "error";
type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "orange" | "info";
type SupplyStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "in_transit"
  | "partial"
  | "received";

type WarehouseItem = {
  id: string;
  name: string;
  category: string;
  sku: string;
  unit: string;
  minimumQuantity: number;
};

type WarehouseLocation = {
  id: string;
  name: string;
  code: string;
};

type WarehouseStock = {
  itemId: string;
  locationId: string;
  quantity: number;
};

type SupplyOrder = {
  id: string;
  number: string;
  supplier: string;
  contact: string;
  items: string[];
  warehouse: string;
  requestedAt: string;
  expectedAt: string;
  value: number;
  status: SupplyStatus;
  responsible: string;
};

type Supplier = {
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  paymentTerms: string;
  deliveryTime: string;
  activeOrders: number;
  lastDelivery: string;
};

type SupplyFormState = {
  supplier: string;
  contact: string;
  warehouse: string;
  expectedAt: string;
  itemsText: string;
  value: string;
  responsible: string;
  note: string;
};

type SupplierFormState = {
  name: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  paymentTerms: string;
  deliveryTime: string;
  lastDelivery: string;
};

const nextStatus: Partial<Record<SupplyStatus, SupplyStatus>> = {
  draft: "sent",
  sent: "confirmed",
  confirmed: "in_transit",
  in_transit: "partial",
  partial: "received",
};

const nextStatusActionLabel: Partial<Record<SupplyStatus, string>> = {
  draft: "Изпрати",
  sent: "Потвърди",
  confirmed: "Към доставка",
  in_transit: "Приеми частично",
  partial: "Приеми",
};

const statusLabels: Record<SupplyStatus, string> = {
  draft: "Нова заявка",
  sent: "Изпратена",
  confirmed: "Потвърдена",
  in_transit: "В доставка",
  partial: "Частично получена",
  received: "Получена",
};

const statusVariants: Record<SupplyStatus, BadgeVariant> = {
  draft: "neutral",
  sent: "orange",
  confirmed: "info",
  in_transit: "warning",
  partial: "warning",
  received: "success",
};

const fallbackLocations: WarehouseLocation[] = [
  { id: "warehouse-1", name: "Склад 1", code: "warehouse-1" },
  { id: "warehouse-2", name: "Склад 2", code: "warehouse-2" },
  { id: "office-service", name: "Офис/сервиз", code: "office-service" },
];

const fallbackItems: WarehouseItem[] = [
  { id: "abc-6kg", name: "Пожарогасител 6 кг ABC", category: "Пожарогасители", sku: "FE-ABC-6", unit: "бр.", minimumQuantity: 12 },
  { id: "powder-abc", name: "Прах ABC за презареждане", category: "Консумативи", sku: "POW-ABC", unit: "кг", minimumQuantity: 80 },
  { id: "seal-tags", name: "Пломби и контролни стикери", category: "Консумативи", sku: "SEAL-SET", unit: "бр.", minimumQuantity: 300 },
  { id: "emergency-light", name: "Аварийно осветително тяло", category: "Аварийно осветление", sku: "EL-01", unit: "бр.", minimumQuantity: 10 },
  { id: "detector-optic", name: "Оптично-димен детектор", category: "ПИС", sku: "FAS-DET-O", unit: "бр.", minimumQuantity: 20 },
];

const fallbackStock: WarehouseStock[] = [
  { itemId: "abc-6kg", locationId: "warehouse-1", quantity: 7 },
  { itemId: "abc-6kg", locationId: "warehouse-2", quantity: 2 },
  { itemId: "powder-abc", locationId: "warehouse-2", quantity: 42 },
  { itemId: "seal-tags", locationId: "office-service", quantity: 180 },
  { itemId: "emergency-light", locationId: "warehouse-1", quantity: 4 },
  { itemId: "detector-optic", locationId: "warehouse-2", quantity: 9 },
];

const fallbackOrders: SupplyOrder[] = [
  {
    id: "po-2026-0034",
    number: "PO-2026-0034",
    supplier: "ПожарТех Снабдяване",
    contact: "+359 88 640 1102",
    items: ["Прах ABC 120 кг", "Пломби 500 бр.", "Контролни стикери 500 бр."],
    warehouse: "Склад 2",
    requestedAt: "2026-07-18",
    expectedAt: "2026-07-23",
    value: 1240,
    status: "confirmed",
    responsible: "Склад",
  },
  {
    id: "po-2026-0035",
    number: "PO-2026-0035",
    supplier: "Сигнал Системс ООД",
    contact: "+359 88 710 4410",
    items: ["Оптично-димни детектори 30 бр.", "Ръчни бутони 8 бр."],
    warehouse: "Склад 1",
    requestedAt: "2026-07-19",
    expectedAt: "2026-07-26",
    value: 1860,
    status: "in_transit",
    responsible: "Офис",
  },
  {
    id: "po-2026-0036",
    number: "PO-2026-0036",
    supplier: "Евро Лайт Безопасност",
    contact: "+359 88 220 9050",
    items: ["Аварийни осветители 18 бр.", "Пиктограми EXIT 30 бр."],
    warehouse: "Офис/сервиз",
    requestedAt: "2026-07-20",
    expectedAt: "2026-07-29",
    value: 980,
    status: "sent",
    responsible: "Мария Георгиева",
  },
  {
    id: "po-2026-0031",
    number: "PO-2026-0031",
    supplier: "ХидроФайър ЕООД",
    contact: "+359 88 510 3380",
    items: ["Маркучи за пожарни кранове 6 бр.", "Струйници 6 бр."],
    warehouse: "Склад 1",
    requestedAt: "2026-07-10",
    expectedAt: "2026-07-17",
    value: 720,
    status: "received",
    responsible: "Склад",
  },
];

const suppliers: Supplier[] = [
  {
    name: "ПожарТех Снабдяване",
    category: "Пожарогасители и консумативи",
    contactPerson: "Димитър Колев",
    phone: "+359 88 640 1102",
    email: "orders@pojartech.bg",
    paymentTerms: "14 дни",
    deliveryTime: "2-3 работни дни",
    activeOrders: 1,
    lastDelivery: "17.07.2026",
  },
  {
    name: "Сигнал Системс ООД",
    category: "Пожароизвестителни системи",
    contactPerson: "Антония Велева",
    phone: "+359 88 710 4410",
    email: "sales@signalsystems.bg",
    paymentTerms: "аванс 30%",
    deliveryTime: "5 работни дни",
    activeOrders: 1,
    lastDelivery: "03.07.2026",
  },
  {
    name: "Евро Лайт Безопасност",
    category: "Аварийно осветление и табели",
    contactPerson: "Георги Данов",
    phone: "+359 88 220 9050",
    email: "office@eurolight-safe.bg",
    paymentTerms: "7 дни",
    deliveryTime: "3-4 работни дни",
    activeOrders: 1,
    lastDelivery: "28.06.2026",
  },
  {
    name: "ХидроФайър ЕООД",
    category: "Пожарни кранове и хидранти",
    contactPerson: "Росен Петров",
    phone: "+359 88 510 3380",
    email: "logistics@hydrofire.bg",
    paymentTerms: "при доставка",
    deliveryTime: "до 1 седмица",
    activeOrders: 0,
    lastDelivery: "17.07.2026",
  },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createEmptySupplyForm(warehouse = "Склад 2"): SupplyFormState {
  return {
    supplier: suppliers[0]?.name ?? "",
    contact: suppliers[0]?.phone ?? "",
    warehouse,
    expectedAt: addDaysToToday(5),
    itemsText: "Прах ABC 50 кг\nПломби 200 бр.\nКонтролни стикери 200 бр.",
    value: "780",
    responsible: "Склад",
    note: "",
  };
}

function createEmptySupplierForm(): SupplierFormState {
  return {
    name: "",
    category: "Пожарогасители и консумативи",
    contactPerson: "",
    phone: "+359 ",
    email: "",
    paymentTerms: "14 дни",
    deliveryTime: "3-5 работни дни",
    lastDelivery: todayKey(),
  };
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

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}\u00a0€`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("bg-BG").replace(" г.", "\u00a0г.");
}

function totalStock(stock: WarehouseStock[], itemId: string) {
  return stock
    .filter((row) => row.itemId === itemId)
    .reduce((total, row) => total + row.quantity, 0);
}

function mapWarehouseItem(row: DataRecord): WarehouseItem {
  return {
    id: textValue(row, ["id"]),
    name: textValue(row, ["name"]),
    category: textValue(row, ["category"]),
    sku: textValue(row, ["sku"]),
    unit: textValue(row, ["unit"]) || "бр.",
    minimumQuantity: numberValue(row["minimum_quantity"]),
  };
}

function mapWarehouseLocation(row: DataRecord): WarehouseLocation {
  return {
    id: textValue(row, ["id"]),
    name: textValue(row, ["name"]),
    code: textValue(row, ["code"]),
  };
}

function mapWarehouseStock(row: DataRecord): WarehouseStock {
  return {
    itemId: textValue(row, ["item_id"]),
    locationId: textValue(row, ["location_id"]),
    quantity: numberValue(row["quantity"]),
  };
}

function StatCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "orange" | "emerald" | "red" | "blue";
}) {
  const toneClasses = {
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    red: "bg-red-50 text-red-600 ring-red-100",
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-500">{detail}</div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${toneClasses[tone]}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-black uppercase text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function OrderCard({
  order,
  onAdvanceStatus,
  onReceive,
}: {
  order: SupplyOrder;
  onAdvanceStatus: (orderId: string) => void;
  onReceive: (orderId: string) => void;
}) {
  const actionLabel = nextStatusActionLabel[order.status];

  return (
    <Card hover className="p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-black text-slate-950">{order.number}</div>
            <Badge variant={statusVariants[order.status]}>{statusLabels[order.status]}</Badge>
          </div>
          <div className="mt-2 text-sm font-black text-slate-800">{order.supplier}</div>
          <div className="mt-1 text-xs font-bold text-slate-500">{order.contact}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600 sm:grid-cols-4 xl:min-w-[520px]">
          <div>
            <div className="text-xs font-black uppercase text-slate-400">Склад</div>
            <div className="mt-1 text-slate-800">{order.warehouse}</div>
          </div>
          <div>
            <div className="text-xs font-black uppercase text-slate-400">Заявена</div>
            <div className="mt-1 whitespace-nowrap">{formatDate(order.requestedAt)}</div>
          </div>
          <div>
            <div className="text-xs font-black uppercase text-slate-400">Очаквана</div>
            <div className="mt-1 whitespace-nowrap">{formatDate(order.expectedAt)}</div>
          </div>
          <div>
            <div className="text-xs font-black uppercase text-slate-400">Стойност</div>
            <div className="mt-1 whitespace-nowrap text-slate-950">{formatMoney(order.value)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {order.items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-bold text-slate-500">
          Отговорник: <span className="text-slate-800">{order.responsible}</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {actionLabel ? (
            <Button
              type="button"
              size="sm"
              variant={order.status === "partial" ? "primary" : "outline"}
              onClick={() =>
                order.status === "partial"
                  ? onReceive(order.id)
                  : onAdvanceStatus(order.id)
              }
            >
              <CheckCircle2 size={15} />
              {actionLabel}
            </Button>
          ) : null}
          {order.status === "in_transit" ? (
            <Button type="button" size="sm" onClick={() => onReceive(order.id)}>
              <PackageCheck size={15} />
              Приеми
            </Button>
          ) : null}
          <Link
            href="/warehouse"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            <Warehouse size={15} />
            Към склада
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default function SupplyPage() {
  const [items, setItems] = useState<WarehouseItem[]>(fallbackItems);
  const [locations, setLocations] = useState<WarehouseLocation[]>(fallbackLocations);
  const [stock, setStock] = useState<WarehouseStock[]>(fallbackStock);
  const [orders, setOrders] = useState<SupplyOrder[]>(fallbackOrders);
  const [supplierList, setSupplierList] = useState<Supplier[]>(suppliers);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState<"all" | SupplyStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SupplyFormState>(() =>
    createEmptySupplyForm(fallbackLocations[1]?.name ?? fallbackLocations[0]?.name)
  );
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierEditMode, setSupplierEditMode] = useState(false);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(() =>
    createEmptySupplierForm()
  );

  async function loadSupplyData() {
    setLoadState("loading");
    try {
      const supabase = createSupabaseBrowserClient();
      const [itemsResult, locationsResult, stockResult] = await Promise.all([
        supabase
          .from("warehouse_items")
          .select("*")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("warehouse_locations")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase.from("warehouse_stock").select("*"),
      ]);

      if (itemsResult.error) throw new Error(itemsResult.error.message);
      if (locationsResult.error) throw new Error(locationsResult.error.message);
      if (stockResult.error) throw new Error(stockResult.error.message);

      const nextItems = ((itemsResult.data as DataRecord[] | null) ?? []).map(mapWarehouseItem);
      const nextLocations = ((locationsResult.data as DataRecord[] | null) ?? []).map(mapWarehouseLocation);
      const nextStock = ((stockResult.data as DataRecord[] | null) ?? []).map(mapWarehouseStock);

      setItems(nextItems.length ? nextItems : fallbackItems);
      setLocations(nextLocations.length ? nextLocations : fallbackLocations);
      setStock(nextStock.length ? nextStock : fallbackStock);
      setLoadState("ready");
    } catch {
      setItems(fallbackItems);
      setLocations(fallbackLocations);
      setStock(fallbackStock);
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadSupplyData();
  }, []);

  const lowStockItems = useMemo(
    () =>
      items
        .map((item) => ({
          ...item,
          currentQuantity: totalStock(stock, item.id),
        }))
        .filter((item) => item.minimumQuantity > 0 && item.currentQuantity <= item.minimumQuantity)
        .sort((a, b) => a.currentQuantity / a.minimumQuantity - b.currentQuantity / b.minimumQuantity)
        .slice(0, 6),
    [items, stock]
  );

  const warehouseNames = useMemo(
    () => locations.map((location) => location.name).join(" · "),
    [locations]
  );

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (activeStatus !== "all" && order.status !== activeStatus) return false;
      if (!normalized) return true;

      return [
        order.number,
        order.supplier,
        order.warehouse,
        order.responsible,
        order.items.join(" "),
        statusLabels[order.status],
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [activeStatus, orders, query]);

  const activeOrders = orders.filter((order) => order.status !== "received");
  const expectedThisWeek = orders.filter((order) =>
    ["confirmed", "in_transit", "partial"].includes(order.status)
  );
  const openValue = activeOrders.reduce((total, order) => total + order.value, 0);
  const selectedSupplierActiveOrders = selectedSupplier
    ? getSupplierActiveOrderCount(selectedSupplier.name)
    : 0;

  const filters: Array<{ value: "all" | SupplyStatus; label: string; count: number }> = [
    { value: "all", label: "Всички", count: orders.length },
    { value: "sent", label: "Изпратени", count: orders.filter((order) => order.status === "sent").length },
    { value: "confirmed", label: "Потвърдени", count: orders.filter((order) => order.status === "confirmed").length },
    { value: "in_transit", label: "В доставка", count: orders.filter((order) => order.status === "in_transit").length },
    { value: "received", label: "Получени", count: orders.filter((order) => order.status === "received").length },
  ];

  function updateForm(key: keyof SupplyFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSupplierForm(key: keyof SupplierFormState, value: string) {
    setSupplierForm((current) => ({ ...current, [key]: value }));
  }

  function openNewRequestForm() {
    setForm(createEmptySupplyForm(locations[1]?.name ?? locations[0]?.name ?? "Склад 2"));
    setFormOpen(true);
  }

  function openNewSupplierForm() {
    setSupplierForm(createEmptySupplierForm());
    setSupplierFormOpen(true);
  }

  function openMinimumStockRequestForm() {
    const requestLines = lowStockItems.map((item) => {
      const needed = Math.max(item.minimumQuantity - item.currentQuantity, 1);
      return `${item.name} ${needed} ${item.unit}`;
    });

    setForm({
      ...createEmptySupplyForm(locations[1]?.name ?? locations[0]?.name ?? "Склад 2"),
      itemsText: requestLines.length
        ? requestLines.join("\n")
        : "Пожарогасител 6 кг ABC 6 бр.\nПломби 200 бр.\nКонтролни стикери 200 бр.",
      note: "Автоматично подготвена заявка от артикули под минимална наличност.",
    });
    setFormOpen(true);
  }

  function openSupplierRequestForm(supplier: Supplier) {
    const supplierActiveOrders = getSupplierActiveOrderCount(supplier.name);

    setForm({
      ...createEmptySupplyForm(locations[1]?.name ?? locations[0]?.name ?? "Склад 2"),
      supplier: supplier.name,
      contact: supplier.phone,
      responsible: supplierActiveOrders ? "Офис" : "Склад",
      note: `Контакт: ${supplier.contactPerson}. Условия: ${supplier.paymentTerms}, доставка ${supplier.deliveryTime}.`,
    });
    setFormOpen(true);
  }

  function getSupplierActiveOrderCount(supplierName: string) {
    return orders.filter(
      (order) => order.supplier === supplierName && order.status !== "received"
    ).length;
  }

  function openSupplierDetails(supplier: Supplier, editMode = false) {
    setSelectedSupplier(supplier);
    setSupplierEditMode(editMode);
  }

  function advanceOrderStatus(orderId: string) {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) return order;
        const status = nextStatus[order.status] ?? order.status;
        return { ...order, status };
      })
    );
  }

  function receiveOrder(orderId: string) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status: "received" } : order
      )
    );
  }

  function handleSupplierChange(name: string) {
    const supplier = supplierList.find((item) => item.name === name);
    setForm((current) => ({
      ...current,
      supplier: name,
      contact: supplier?.phone ?? current.contact,
    }));
  }

  function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedValue = Number(form.value.replace(",", "."));
    const nextNumber = `PO-${new Date().getFullYear()}-${String(orders.length + 37).padStart(4, "0")}`;
    const requestItems = form.itemsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    const nextOrder: SupplyOrder = {
      id: `po-${Date.now()}`,
      number: nextNumber,
      supplier: form.supplier.trim() || supplierList[0]?.name || "Доставчик",
      contact: form.contact.trim(),
      items: requestItems.length ? requestItems : ["Артикули по складова заявка"],
      warehouse: form.warehouse || locations[0]?.name || "Склад 1",
      requestedAt: todayKey(),
      expectedAt: form.expectedAt || addDaysToToday(5),
      value: Number.isFinite(parsedValue) ? parsedValue : 0,
      status: "draft",
      responsible: form.responsible.trim() || "Склад",
    };

    setOrders((current) => [nextOrder, ...current]);
    setActiveStatus("all");
    setFormOpen(false);
  }

  function handleCreateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSupplier: Supplier = {
      name: supplierForm.name.trim() || "Нов доставчик",
      category: supplierForm.category.trim() || "Пожарно оборудване",
      contactPerson: supplierForm.contactPerson.trim() || "Лице за контакт",
      phone: supplierForm.phone.trim() || "+359 ",
      email: supplierForm.email.trim() || "office@example.bg",
      paymentTerms: supplierForm.paymentTerms.trim() || "14 дни",
      deliveryTime: supplierForm.deliveryTime.trim() || "3-5 работни дни",
      activeOrders: 0,
      lastDelivery: supplierForm.lastDelivery || todayKey(),
    };

    setSupplierList((current) => [nextSupplier, ...current]);
    setSupplierFormOpen(false);
    setSelectedSupplier(nextSupplier);
    setSupplierEditMode(false);
  }

  return (
    <AppShell
      title="Доставки"
      description="Заявки към доставчици, очаквани приемания и снабдяване на двата склада"
      showSearch={false}
      headerAction={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={openMinimumStockRequestForm}>
            <ClipboardList size={16} />
            Заявка от минимум
          </Button>
          <Button type="button" onClick={openNewRequestForm}>
            <Plus size={16} />
            Нова заявка
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Активни заявки"
            value={String(activeOrders.length)}
            detail="изпратени, потвърдени и в доставка"
            icon={<ShoppingCart size={21} />}
            tone="orange"
          />
          <StatCard
            label="Очаквани доставки"
            value={String(expectedThisWeek.length)}
            detail="за приемане към складовете"
            icon={<Truck size={21} />}
            tone="blue"
          />
          <StatCard
            label="Под минимум"
            value={String(lowStockItems.length)}
            detail="артикули за презареждане"
            icon={<AlertTriangle size={21} />}
            tone="red"
          />
          <StatCard
            label="Стойност"
            value={formatMoney(openValue)}
            detail="отворени заявки към доставчици"
            icon={<PackageCheck size={21} />}
            tone="emerald"
          />
        </div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card className="min-w-0 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-lg font-black text-slate-950">Заявки и доставки</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  Приемане към {warehouseNames || "складовете"}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={loadSupplyData}
                disabled={loadState === "loading"}
              >
                {loadState === "loading" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Обнови
              </Button>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(420px,0.9fr)_minmax(500px,1.1fr)] xl:items-start">
              <div className="relative min-w-0">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Търсене по заявка, доставчик, артикул или склад..."
                  className="pl-11"
                />
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveStatus(filter.value)}
                    className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-xs font-black transition ${
                      activeStatus === filter.value
                        ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate">{filter.label}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs">
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {loadState === "error" ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                Заредени са примерни заявки. При активен склад модулът чете реалните артикули, наличности и минимални количества.
              </div>
            ) : null}

              <div className="mt-5 grid gap-3">
                {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAdvanceStatus={advanceOrderStatus}
                  onReceive={receiveOrder}
                />
              ))}
              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
                  Няма заявки по избрания филтър.
                </div>
              ) : null}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-950">Артикули под минимум</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    Автоматична основа за заявка към доставчик
                  </div>
                </div>
                <PackageOpen className="text-orange-500" size={22} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-1">
                {lowStockItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-black text-slate-900">{item.name}</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {item.category || "Без категория"} · {item.sku || "без SKU"}
                        </div>
                      </div>
                      <Badge variant="danger">
                        {item.currentQuantity}/{item.minimumQuantity} {item.unit}
                      </Badge>
                    </div>
                  </div>
                ))}
                {lowStockItems.length === 0 ? (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                    Няма артикули под минимална наличност.
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-black text-slate-950">Доставчици</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    Одобрени партньори за пожарен контрол
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={openNewSupplierForm}>
                    <Plus size={15} />
                    Нов доставчик
                  </Button>
                  <Building2 className="hidden text-orange-500 sm:block" size={22} />
                </div>
              </div>

              <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {supplierList.map((supplier) => {
                  const supplierActiveOrders = getSupplierActiveOrderCount(supplier.name);

                  return (
                    <div
                      key={supplier.name}
                      role="button"
                      tabIndex={0}
                      onClick={() => openSupplierDetails(supplier)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openSupplierDetails(supplier);
                        }
                      }}
                      className="grid w-full cursor-pointer gap-3 px-4 py-4 text-left transition hover:bg-orange-50/50 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <div className="break-words text-sm font-black text-slate-950">
                            {supplier.name}
                          </div>
                          <Badge variant={supplierActiveOrders ? "orange" : "neutral"}>
                            {supplierActiveOrders
                              ? `${supplierActiveOrders} активна`
                              : "няма активни"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs font-bold text-slate-500">
                          {supplier.category}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <UserRound size={14} />
                            {supplier.contactPerson}
                          </span>
                          <span>{supplier.deliveryTime}</span>
                        </div>
                      </div>
                      <div
                        className="flex justify-end gap-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Редактирай"
                          aria-label="Редактирай"
                          onClick={() => openSupplierDetails(supplier, true)}
                        >
                          <PenLine size={15} />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openSupplierRequestForm(supplier)}
                        >
                          <Plus size={15} />
                          Заявка
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <CheckCircle2 size={21} />
                </div>
                <div>
                  <div className="font-black text-slate-950">Процес на приемане</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    Потвърдена доставка → приемане в склад → складово движение
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm font-bold text-slate-600">
                {["Проверка на доставчик и заявка", "Приемане по склад и количество", "Автоматично обновяване на складовата наличност"].map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-orange-600 ring-1 ring-slate-200">
                      {index + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {supplierFormOpen ? (
        <ModalShell
          title="Нов доставчик"
          subtitle="Партньор за доставки на пожарно оборудване, консумативи или сервизни материали"
          onClose={() => setSupplierFormOpen(false)}
        >
          <form className="space-y-5" onSubmit={handleCreateSupplier}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Име на фирма">
                <Input
                  value={supplierForm.name}
                  onChange={(event) => updateSupplierForm("name", event.target.value)}
                  placeholder="Напр. Файър Сейфти Трейд ООД"
                />
              </Field>
              <Field label="Категория">
                <Input
                  value={supplierForm.category}
                  onChange={(event) => updateSupplierForm("category", event.target.value)}
                />
              </Field>
              <Field label="Лице за контакт">
                <Input
                  value={supplierForm.contactPerson}
                  onChange={(event) =>
                    updateSupplierForm("contactPerson", event.target.value)
                  }
                  placeholder="Име и фамилия"
                />
              </Field>
              <Field label="Телефон">
                <Input
                  value={supplierForm.phone}
                  onChange={(event) => updateSupplierForm("phone", event.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={supplierForm.email}
                  onChange={(event) => updateSupplierForm("email", event.target.value)}
                  placeholder="orders@example.bg"
                />
              </Field>
              <Field label="Срок за доставка">
                <Input
                  value={supplierForm.deliveryTime}
                  onChange={(event) =>
                    updateSupplierForm("deliveryTime", event.target.value)
                  }
                />
              </Field>
              <Field label="Условия за плащане">
                <Input
                  value={supplierForm.paymentTerms}
                  onChange={(event) =>
                    updateSupplierForm("paymentTerms", event.target.value)
                  }
                />
              </Field>
              <Field label="Последна доставка">
                <input
                  type="date"
                  value={supplierForm.lastDelivery}
                  onChange={(event) =>
                    updateSupplierForm("lastDelivery", event.target.value)
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSupplierFormOpen(false)}
              >
                Отказ
              </Button>
              <Button type="submit">
                <CheckCircle2 size={16} />
                Добави доставчик
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {selectedSupplier ? (
        <ModalShell
          title={supplierEditMode ? "Редакция на доставчик" : selectedSupplier.name}
          subtitle={
            supplierEditMode
              ? "Контактни данни и условия за снабдяване"
              : `${selectedSupplier.category} · последна доставка ${selectedSupplier.lastDelivery}`
          }
          onClose={() => {
            setSelectedSupplier(null);
            setSupplierEditMode(false);
          }}
        >
          {supplierEditMode ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                setSupplierEditMode(false);
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Доставчик">
                  <Input defaultValue={selectedSupplier.name} />
                </Field>
                <Field label="Категория">
                  <Input defaultValue={selectedSupplier.category} />
                </Field>
                <Field label="Лице за контакт">
                  <Input defaultValue={selectedSupplier.contactPerson} />
                </Field>
                <Field label="Телефон">
                  <Input defaultValue={selectedSupplier.phone} />
                </Field>
                <Field label="Email">
                  <Input defaultValue={selectedSupplier.email} />
                </Field>
                <Field label="Срок за доставка">
                  <Input defaultValue={selectedSupplier.deliveryTime} />
                </Field>
                <Field label="Условия за плащане">
                  <Input defaultValue={selectedSupplier.paymentTerms} />
                </Field>
                <Field label="Последна доставка">
                  <Input defaultValue={selectedSupplier.lastDelivery} />
                </Field>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSupplierEditMode(false)}
                >
                  Отказ
                </Button>
                <Button type="submit">
                  <CheckCircle2 size={16} />
                  Запази
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Лице за контакт
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm font-black text-slate-900">
                    <UserRound size={16} className="text-orange-500" />
                    {selectedSupplier.contactPerson}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Активни заявки
                  </div>
                  <div className="mt-2">
                    <Badge variant={selectedSupplierActiveOrders ? "orange" : "neutral"}>
                      {selectedSupplierActiveOrders
                        ? `${selectedSupplierActiveOrders} активна`
                        : "няма активни"}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Срок за доставка
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    {selectedSupplier.deliveryTime}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-400">
                    Условия за плащане
                  </div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    {selectedSupplier.paymentTerms}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <a
                  href={`tel:${selectedSupplier.phone.replace(/\s/g, "")}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  <Phone size={17} />
                  Обади се
                </a>
                <a
                  href={`mailto:${selectedSupplier.email}?subject=${encodeURIComponent(
                    "Заявка за доставка FireControl"
                  )}`}
                  className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  <Mail size={17} className="shrink-0" />
                  <span className="truncate">{selectedSupplier.email}</span>
                </a>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSupplierEditMode(true)}
                >
                  <PenLine size={16} />
                  Редактирай
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    openSupplierRequestForm(selectedSupplier);
                    setSelectedSupplier(null);
                    setSupplierEditMode(false);
                  }}
                >
                  <Plus size={16} />
                  Нова заявка
                </Button>
              </div>
            </div>
          )}
        </ModalShell>
      ) : null}

      {formOpen ? (
        <ModalShell
          title="Нова заявка към доставчик"
          subtitle="Заявка за материали към склад преди сервизни посещения"
          onClose={() => setFormOpen(false)}
        >
          <form className="space-y-5" onSubmit={handleCreateRequest}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Доставчик">
                <select
                  value={form.supplier}
                  onChange={(event) => handleSupplierChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                >
                  {supplierList.map((supplier) => (
                    <option key={supplier.name} value={supplier.name}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Телефон / контакт">
                <Input
                  value={form.contact}
                  onChange={(event) => updateForm("contact", event.target.value)}
                />
              </Field>
              <Field label="Приемане към склад">
                <select
                  value={form.warehouse}
                  onChange={(event) => updateForm("warehouse", event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.name}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Очаквана дата">
                <input
                  type="date"
                  value={form.expectedAt}
                  onChange={(event) => updateForm("expectedAt", event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
              </Field>
              <Field label="Стойност без ДДС">
                <Input
                  value={form.value}
                  onChange={(event) => updateForm("value", event.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Отговорник">
                <Input
                  value={form.responsible}
                  onChange={(event) => updateForm("responsible", event.target.value)}
                />
              </Field>
            </div>

            <Field label="Артикули">
              <textarea
                value={form.itemsText}
                onChange={(event) => updateForm("itemsText", event.target.value)}
                rows={5}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                placeholder="Всеки артикул на нов ред"
              />
            </Field>

            <Field label="Бележка">
              <textarea
                value={form.note}
                onChange={(event) => updateForm("note", event.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                placeholder="Например: за годишни проверки през следващата седмица"
              />
            </Field>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Отказ
              </Button>
              <Button type="submit">
                <Send size={16} />
                Създай заявка
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </AppShell>
  );
}
