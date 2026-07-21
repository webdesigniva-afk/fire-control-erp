"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRightLeft,
  Boxes,
  ClipboardList,
  History,
  Loader2,
  PackageMinus,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  createWarehouseMovement,
  readWarehouseItems,
  readWarehouseLocations,
  readWarehouseMovements,
  readWarehouseStock,
  saveWarehouseItem,
  stockQuantity,
  totalStock,
  type WarehouseItem,
  type WarehouseLocation,
  type WarehouseMovement,
  type WarehouseMovementType,
  type WarehouseStock,
} from "../../lib/warehouse";

type LoadState = "loading" | "ready" | "error";
type ModalMode =
  | "item"
  | "inbound"
  | "outbound"
  | "transfer"
  | "adjustment"
  | "history"
  | null;

const emptyItemForm = {
  name: "",
  category: "",
  sku: "",
  unit: "бр.",
  minimumQuantity: "0",
  notes: "",
};

const emptyMovementForm = {
  itemId: "",
  fromLocationId: "",
  toLocationId: "",
  quantity: "1",
  adjustmentDirection: "increase",
  note: "",
  performedBy: "",
};

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
}

function movementTypeLabel(type: WarehouseMovementType) {
  if (type === "inbound") return "Зареждане";
  if (type === "outbound") return "Изписване";
  if (type === "transfer") return "Трансфер";
  return "Корекция";
}

function movementTypeVariant(type: WarehouseMovementType) {
  if (type === "inbound") return "success";
  if (type === "outbound") return "danger";
  if (type === "transfer") return "info";
  return "warning";
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
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
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
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

export default function WarehousePage() {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [movements, setMovements] = useState<WarehouseMovement[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const categories = useMemo(
    () =>
      Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort(
        (first, second) => first.localeCompare(second)
      ),
    [items]
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (
        locationFilter &&
        stockQuantity(stock, item.id, locationFilter) <= 0
      ) {
        return false;
      }
      if (!query) return true;
      return [item.name, item.category, item.sku, item.notes]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryFilter, items, locationFilter, search, stock]);

  const lowStockCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.minimumQuantity > 0 &&
          totalStock(stock, item.id) <= item.minimumQuantity
      ).length,
    [items, stock]
  );

  async function loadWarehouse() {
    setLoadState("loading");
    setErrorMessage("");

    try {
      const [nextLocations, nextItems, nextStock, nextMovements] =
        await Promise.all([
          readWarehouseLocations(),
          readWarehouseItems(),
          readWarehouseStock(),
          readWarehouseMovements(),
        ]);

      setLocations(nextLocations);
      setItems(nextItems);
      setStock(nextStock);
      setMovements(nextMovements);
      setLoadState("ready");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `${error.message} Провери дали е пусната sql/warehouse_module.sql.`
          : "Грешка при зареждане на склада."
      );
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadWarehouse();
  }, []);

  function openNewItem() {
    setSelectedItemId("");
    setItemForm(emptyItemForm);
    setModalMode("item");
    setMessage("");
    setErrorMessage("");
  }

  function openMovement(
    mode: Exclude<ModalMode, "item" | "history" | null>,
    item?: WarehouseItem
  ) {
    const firstLocation = locations[0]?.id || "";
    setSelectedItemId(item?.id || "");
    setMovementForm({
      ...emptyMovementForm,
      itemId: item?.id || "",
      fromLocationId: firstLocation,
      toLocationId: locations[1]?.id || firstLocation,
    });
    setModalMode(mode);
    setMessage("");
    setErrorMessage("");
  }

  async function openHistory(item: WarehouseItem) {
    setSelectedItemId(item.id);
    setModalMode("history");
    setErrorMessage("");
    try {
      setMovements(await readWarehouseMovements(item.id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Грешка при зареждане на историята."
      );
    }
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = itemForm.name.trim();
    if (!name) return;

    setSaving(true);
    setErrorMessage("");

    try {
      await saveWarehouseItem({
        name,
        category: itemForm.category,
        sku: itemForm.sku,
        unit: itemForm.unit,
        minimumQuantity: Number(itemForm.minimumQuantity) || 0,
        notes: itemForm.notes,
      });
      setModalMode(null);
      setMessage("Артикулът е записан.");
      await loadWarehouse();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Артикулът не беше записан."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalMode || modalMode === "item" || modalMode === "history") return;

    const quantity = Number(movementForm.quantity);
    if (!movementForm.itemId || !Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage("Изберете артикул и валидно количество.");
      return;
    }

    if (modalMode === "adjustment" && !movementForm.note.trim()) {
      setErrorMessage("Корекцията изисква бележка с причина.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createWarehouseMovement({
        itemId: movementForm.itemId,
        movementType: modalMode,
        quantity,
        fromLocationId:
          modalMode === "outbound" ||
          modalMode === "transfer" ||
          (modalMode === "adjustment" &&
            movementForm.adjustmentDirection === "decrease")
            ? movementForm.fromLocationId
            : undefined,
        toLocationId:
          modalMode === "inbound" ||
          modalMode === "transfer" ||
          (modalMode === "adjustment" &&
            movementForm.adjustmentDirection === "increase")
            ? movementForm.toLocationId
            : undefined,
        performedBy: movementForm.performedBy,
        note: movementForm.note,
      });

      setModalMode(null);
      setMessage("Движението е записано.");
      await loadWarehouse();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Движението не беше записано."
      );
    } finally {
      setSaving(false);
    }
  }

  const movementTitle =
    modalMode === "inbound"
      ? "Зареждане"
      : modalMode === "outbound"
        ? "Изписване"
        : modalMode === "transfer"
          ? "Трансфер"
          : modalMode === "adjustment"
            ? "Корекция"
          : "";

  return (
    <AppShell
      title="Склад"
      description="Наличности, движения и използвани артикули по обекти"
    >
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
              <div className="text-xs font-black uppercase text-slate-400">
                Артикули
              </div>
              <div className="mt-1 text-2xl font-black text-slate-950">
                {items.length}
              </div>
            </div>
            <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
              <div className="text-xs font-black uppercase text-slate-400">
                Локации
              </div>
              <div className="mt-1 text-2xl font-black text-slate-950">
                {locations.length}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs font-black uppercase text-slate-400">
                Ниска наличност
              </div>
              <div className="mt-1 text-2xl font-black text-red-600">
                {lowStockCount}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Търсене по артикул, категория или код..."
                className="pl-11"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100 xl:w-56"
            >
              <option value="">Всички категории</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100 xl:w-56"
            >
              <option value="">Всички локации</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={openNewItem}>
                <Plus size={17} />
                Нов артикул
              </Button>
              <Button type="button" variant="outline" onClick={loadWarehouse}>
                <RefreshCw size={17} />
                Обнови
              </Button>
            </div>
          </div>
        </Card>

        {message ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            {message}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Категория</th>
                  {locations.map((location) => (
                    <th key={location.id} className="px-4 py-3 text-right">
                      {location.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Общо</th>
                  <th className="px-4 py-3 text-right">Минимум</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadState === "loading" ? (
                  <tr>
                    <td
                      colSpan={locations.length + 6}
                      className="px-4 py-10 text-center font-bold text-slate-400"
                    >
                      <Loader2 className="mx-auto mb-2 animate-spin" size={20} />
                      Зареждане...
                    </td>
                  </tr>
                ) : null}

                {loadState !== "loading" && filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={locations.length + 6}
                      className="px-4 py-10 text-center font-bold text-slate-400"
                    >
                      Няма намерени артикули.
                    </td>
                  </tr>
                ) : null}

                {filteredItems.map((item) => {
                  const total = totalStock(stock, item.id);
                  const isLow =
                    item.minimumQuantity > 0 && total <= item.minimumQuantity;

                  return (
                    <tr key={item.id} className="transition hover:bg-orange-50/30">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                            <Boxes size={18} />
                          </div>
                          <div>
                            <div className="font-black text-slate-950">
                              {item.name}
                            </div>
                            {item.sku ? (
                              <div className="mt-1 font-mono text-xs font-bold text-slate-400">
                                {item.sku}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="neutral">{item.category || "Друго"}</Badge>
                      </td>
                      {locations.map((location) => (
                        <td
                          key={location.id}
                          className="px-4 py-4 text-right font-black text-slate-800"
                        >
                          {formatQuantity(stockQuantity(stock, item.id, location.id))}
                        </td>
                      ))}
                      <td className="px-4 py-4 text-right font-black text-slate-950">
                        {formatQuantity(total)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-slate-500">
                        {formatQuantity(item.minimumQuantity)}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={isLow ? "danger" : "success"}>
                          {isLow ? "Ниска наличност" : "ОК"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Зареждане"
                            onClick={() => openMovement("inbound", item)}
                          >
                            <PackagePlus size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Трансфер"
                            onClick={() => openMovement("transfer", item)}
                          >
                            <ArrowRightLeft size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Изписване"
                            onClick={() => openMovement("outbound", item)}
                          >
                            <PackageMinus size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="История"
                            onClick={() => openHistory(item)}
                          >
                            <History size={16} />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Корекция"
                            onClick={() => openMovement("adjustment", item)}
                          >
                            <ClipboardList size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {modalMode === "item" ? (
        <ModalShell title="Нов артикул" onClose={() => setModalMode(null)}>
          <form onSubmit={handleSaveItem} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Име">
                <Input
                  required
                  value={itemForm.name}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Категория">
                <Input
                  value={itemForm.category}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Пожарогасители"
                />
              </Field>
              <Field label="Код / SKU">
                <Input
                  value={itemForm.sku}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      sku: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Мерна единица">
                <Input
                  value={itemForm.unit}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Минимална наличност">
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={itemForm.minimumQuantity}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      minimumQuantity: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Бележка">
                <Input
                  value={itemForm.notes}
                  onChange={(event) =>
                    setItemForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setModalMode(null)}>
                Отказ
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Запази
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modalMode === "inbound" ||
      modalMode === "outbound" ||
      modalMode === "transfer" ||
      modalMode === "adjustment" ? (
        <ModalShell title={movementTitle} onClose={() => setModalMode(null)}>
          <form onSubmit={handleSaveMovement} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Артикул">
                <select
                  required
                  value={movementForm.itemId}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      itemId: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  <option value="">Избери артикул</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>

              {modalMode === "inbound" ||
              (modalMode === "adjustment" &&
                movementForm.adjustmentDirection === "increase") ? (
                <Field label="Локация">
                  <select
                    required
                    value={movementForm.toLocationId}
                    onChange={(event) =>
                      setMovementForm((current) => ({
                        ...current,
                        toLocationId: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {modalMode === "outbound" ||
              modalMode === "transfer" ||
              (modalMode === "adjustment" &&
                movementForm.adjustmentDirection === "decrease") ? (
                <Field label="От локация">
                  <select
                    required
                    value={movementForm.fromLocationId}
                    onChange={(event) =>
                      setMovementForm((current) => ({
                        ...current,
                        fromLocationId: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {modalMode === "transfer" ? (
                <Field label="Към локация">
                  <select
                    required
                    value={movementForm.toLocationId}
                    onChange={(event) =>
                      setMovementForm((current) => ({
                        ...current,
                        toLocationId: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {modalMode === "adjustment" ? (
                <Field label="Посока">
                  <select
                    value={movementForm.adjustmentDirection}
                    onChange={(event) =>
                      setMovementForm((current) => ({
                        ...current,
                        adjustmentDirection: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    <option value="increase">Увеличение</option>
                    <option value="decrease">Намаление</option>
                  </select>
                </Field>
              ) : null}

              <Field label="Количество">
                <Input
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={movementForm.quantity}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Кой отчита">
                <Input
                  value={movementForm.performedBy}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      performedBy: event.target.value,
                    }))
                  }
                  placeholder="Име"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Бележка">
                  <Input
                    value={movementForm.note}
                    onChange={(event) =>
                      setMovementForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
            </div>

            {movementForm.itemId && movementForm.fromLocationId ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
                Текуща наличност:{" "}
                <span className="font-black text-slate-950">
                  {formatQuantity(
                    stockQuantity(
                      stock,
                      movementForm.itemId,
                      movementForm.fromLocationId
                    )
                  )}
                </span>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setModalMode(null)}>
                Отказ
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
                Запиши движение
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modalMode === "history" && selectedItem ? (
        <ModalShell
          title={`История: ${selectedItem.name}`}
          onClose={() => setModalMode(null)}
        >
          <div className="space-y-3">
            {movements.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-400">
                Няма движения за този артикул.
              </div>
            ) : null}
            {movements.map((movement) => {
              const from = locations.find(
                (location) => location.id === movement.fromLocationId
              );
              const to = locations.find(
                (location) => location.id === movement.toLocationId
              );

              return (
                <div
                  key={movement.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Badge variant={movementTypeVariant(movement.movementType)}>
                        {movementTypeLabel(movement.movementType)}
                      </Badge>
                      <div className="mt-3 text-lg font-black text-slate-950">
                        {formatQuantity(movement.quantity)} {selectedItem.unit}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-500">
                        {[from?.name, to?.name].filter(Boolean).join(" -> ") ||
                          "Без локация"}
                      </div>
                    </div>
                    <div className="text-right text-xs font-bold text-slate-400">
                      {movement.createdAt
                        ? new Intl.DateTimeFormat("bg-BG", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(movement.createdAt))
                        : ""}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600 sm:grid-cols-2">
                    <div>Обект: {movement.objectName || "Няма"}</div>
                    <div>Протокол: {movement.protocolNumber || "Няма"}</div>
                    <div>Отчел: {movement.performedBy || "Няма"}</div>
                    <div>Бележка: {movement.note || "Няма"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </ModalShell>
      ) : null}
    </AppShell>
  );
}
