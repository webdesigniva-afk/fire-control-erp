"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  FileText,
  FolderOpen,
  Loader2,
  PenLine,
  Plus,
  Save,
  Trash2,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  type CompanySettings,
  type ProtocolSettings,
  type ServiceCenterSetting,
  type TechnicianSetting,
  defaultCompanySettings,
  defaultProtocolSettings,
  defaultServiceCenters,
  defaultTechnicians,
  readCompanySettings,
  readCompanySettingsFromSupabase,
  readProtocolSettings,
  readProtocolSettingsFromSupabase,
  readServiceCenters,
  readServiceCentersFromSupabase,
  readTechnicians,
  readTechniciansFromSupabase,
  writeCompanySettingsToSupabase,
  writeProtocolSettingsToSupabase,
  writeServiceCentersToSupabase,
  writeTechniciansToSupabase,
} from "../../lib/settings";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "error";
type SectionId = "technicians" | "service-centers" | "services" | "protocols" | "documents";
type CatalogKey =
  | "objectTypes"
  | "extinguisherBrands"
  | "extinguisherModels"
  | "extinguisherCategories"
  | "extinguishingAgentTypes"
  | "extinguishingAgentTradeNames"
  | "extinguisherChargeMasses"
  | "extinguisherServiceTypes"
  | "serviceSystemStatuses";

type ServiceSetting = {
  id: string;
  name: string;
  parentId: string;
  usageCount: number;
  archivedAt: string;
};

const sections: Array<{ id: SectionId; label: string; icon: typeof UsersRound }> = [
  { id: "technicians", label: "Техници", icon: UsersRound },
  { id: "service-centers", label: "Сервизи", icon: UserRound },
  { id: "services", label: "Услуги", icon: Wrench },
  { id: "protocols", label: "Протоколи", icon: FolderOpen },
  { id: "documents", label: "Документи", icon: FileText },
];

const catalogGroups: Array<{ key: CatalogKey; title: string; placeholder: string }> = [
  { key: "objectTypes", title: "Типове обекти", placeholder: "Напр. Аптека" },
  { key: "extinguisherBrands", title: "Марки", placeholder: "Напр. Gloria" },
  { key: "extinguisherModels", title: "Модели", placeholder: "Напр. ABC 6 kg" },
  { key: "extinguisherCategories", title: "Категории", placeholder: "Напр. Прахов" },
  { key: "extinguishingAgentTypes", title: "Пожарогасителни вещества", placeholder: "Напр. CO2" },
  { key: "extinguishingAgentTradeNames", title: "Търговски имена", placeholder: "Напр. ABC 40" },
  { key: "extinguisherChargeMasses", title: "Вместимост / маса", placeholder: "Напр. 6" },
  { key: "extinguisherServiceTypes", title: "Видове обслужване", placeholder: "Напр. презареждане" },
  { key: "serviceSystemStatuses", title: "Статуси", placeholder: "Напр. Изрядна" },
];

const emptyTechnician: TechnicianSetting = {
  id: "",
  name: "",
  role: "Сервизен техник",
  phone: "",
  email: "",
  active: true,
};

const emptyServiceCenter: ServiceCenterSetting = {
  id: "",
  name: "",
  manager: "",
  phone: "",
  email: "",
  address: "",
  active: true,
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function assertSupabaseResult(
  result: { error: { message?: string } | null },
  fallbackMessage: string
) {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage);
  }
}

function serviceAndChildIds(service: ServiceSetting, services: ServiceSetting[]) {
  return [
    service.id,
    ...services
      .filter((item) => item.parentId === service.id)
      .map((item) => item.id),
  ];
}

function serviceAndChildNames(service: ServiceSetting, services: ServiceSetting[]) {
  return [
    service.name,
    ...services
      .filter((item) => item.parentId === service.id)
      .map((item) => item.name),
  ];
}

function serviceUsageCount(service: ServiceSetting, services: ServiceSetting[]) {
  return services
    .filter((item) => item.id === service.id || item.parentId === service.id)
    .reduce((total, item) => total + item.usageCount, 0);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black uppercase text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500">
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("technicians");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [technicians, setTechnicians] = useState<TechnicianSetting[]>(defaultTechnicians);
  const [newTechnician, setNewTechnician] = useState<TechnicianSetting>(emptyTechnician);
  const [editingTechnicianId, setEditingTechnicianId] = useState("");

  const [serviceCenters, setServiceCenters] = useState<ServiceCenterSetting[]>(defaultServiceCenters);
  const [newServiceCenter, setNewServiceCenter] = useState<ServiceCenterSetting>(emptyServiceCenter);
  const [editingServiceCenterId, setEditingServiceCenterId] = useState("");

  const [services, setServices] = useState<ServiceSetting[]>([]);
  const [newServiceName, setNewServiceName] = useState("");
  const [newSubServiceNames, setNewSubServiceNames] = useState<Record<string, string>>({});
  const [editingServiceId, setEditingServiceId] = useState("");
  const [editingServiceName, setEditingServiceName] = useState("");

  const [protocols, setProtocols] = useState<ProtocolSettings>(defaultProtocolSettings);
  const [newCatalogValues, setNewCatalogValues] = useState<Record<string, string>>({});
  const [editingCatalogKey, setEditingCatalogKey] = useState("");
  const [editingCatalogIndex, setEditingCatalogIndex] = useState<number | null>(null);
  const [editingCatalogValue, setEditingCatalogValue] = useState("");

  const [company, setCompany] = useState<CompanySettings>(defaultCompanySettings);

  const activeTechnicians = useMemo(
    () => technicians.filter((technician) => technician.active && !technician.archivedAt),
    [technicians]
  );
  const activeServiceCenters = useMemo(
    () => serviceCenters.filter((service) => service.active && !service.archivedAt),
    [serviceCenters]
  );
  const activeServices = useMemo(
    () => services.filter((service) => !service.archivedAt),
    [services]
  );
  const activeServiceGroups = useMemo(
    () =>
      activeServices
        .filter((service) => !service.parentId)
        .map((service) => ({
          service,
          children: activeServices.filter((child) => child.parentId === service.id),
        })),
    [activeServices]
  );

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      setLoadState("loading");
      setErrorMessage("");

      setTechnicians(readTechnicians());
      setServiceCenters(readServiceCenters());
      setProtocols(readProtocolSettings());
      setCompany(readCompanySettings());

      try {
        const [dbTechnicians, dbServiceCenters, dbProtocols, dbCompany] =
          await Promise.all([
            readTechniciansFromSupabase(),
            readServiceCentersFromSupabase(),
            readProtocolSettingsFromSupabase(),
            readCompanySettingsFromSupabase(),
          ]);

        if (!mounted) return;

        setTechnicians(dbTechnicians);
        setServiceCenters(dbServiceCenters);
        setProtocols(dbProtocols);
        setCompany(dbCompany);
        await loadServices();
        setLoadState("ready");
      } catch (error) {
        if (!mounted) return;
        await loadServices();
        setLoadState("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Настройките от базата не можаха да се заредят."
        );
      }
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  // loadServices is defined as a page action below; this effect is the initial load only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message: string) {
    setToast(message);
    setErrorMessage("");
    window.setTimeout(() => setToast(""), 2800);
  }

  async function loadServices() {
    const supabase = createSupabaseBrowserClient();
    const [servicesResult, linksResult] = await Promise.all([
      supabase.from("services").select("*").order("name", { ascending: true }),
      supabase.from("location_services").select("service_id"),
    ]);

    if (servicesResult.error) {
      setErrorMessage(servicesResult.error.message || "Грешка при зареждане на услуги.");
      return;
    }

    const existingRows = ((servicesResult.data as DataRecord[]) ?? []);
    const usage = new Map<string, number>();
    if (!linksResult.error) {
      for (const row of (linksResult.data as DataRecord[]) ?? []) {
        const id = textValue(row, ["service_id"]);
        usage.set(id, (usage.get(id) ?? 0) + 1);
      }
    }

    setServices(
      existingRows.map((row) => {
        const id = textValue(row, ["id"]);
        return {
          id,
          name: textValue(row, ["name", "title"]),
          parentId: textValue(row, ["parent_id", "parentId"]),
          usageCount: usage.get(id) ?? 0,
          archivedAt: textValue(row, ["archived_at", "archivedAt"]),
        };
      })
    );
  }

  async function persistTechnicians(next: TechnicianSetting[], message: string) {
    setSaving(true);
    try {
      await writeTechniciansToSupabase(next);
      setTechnicians(next);
      showToast(message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис в базата.");
    } finally {
      setSaving(false);
    }
  }

  async function addTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newTechnician.name.trim();
    if (!name) return;

    await persistTechnicians(
      [
        ...technicians,
        {
          ...emptyTechnician,
          id: createId("tech"),
          name,
          role: newTechnician.role.trim() || "Сервизен техник",
          phone: newTechnician.phone.trim(),
        },
      ],
      "Техникът е добавен."
    );
    setNewTechnician(emptyTechnician);
  }

  async function saveTechnician(technician: TechnicianSetting) {
    await persistTechnicians(
      technicians.map((item) =>
        item.id === technician.id
          ? {
              ...item,
              name: technician.name.trim(),
              role: technician.role.trim() || "Сервизен техник",
              phone: technician.phone.trim(),
            }
          : item
      ),
      "Техникът е обновен."
    );
    setEditingTechnicianId("");
  }

  async function archiveTechnician(id: string) {
    await persistTechnicians(
      technicians.map((item) =>
        item.id === id
          ? { ...item, active: false, archivedAt: item.archivedAt || new Date().toISOString() }
          : item
      ),
      "Техникът е архивиран."
    );
  }

  async function deleteTechnician(id: string) {
    const confirmed = window.confirm("Сигурни ли сте, че искате да изтриете този техник?");
    if (!confirmed) return;

    await persistTechnicians(
      technicians.filter((item) => item.id !== id),
      "Техникът е изтрит."
    );
  }

  async function persistServiceCenters(next: ServiceCenterSetting[], message: string) {
    setSaving(true);
    try {
      await writeServiceCentersToSupabase(next);
      setServiceCenters(next);
      showToast(message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис в базата.");
    } finally {
      setSaving(false);
    }
  }

  async function addServiceCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newServiceCenter.name.trim();
    if (!name) return;

    await persistServiceCenters(
      [
        ...serviceCenters,
        {
          ...emptyServiceCenter,
          id: createId("service-center"),
          name,
          manager: newServiceCenter.manager.trim(),
          phone: newServiceCenter.phone.trim(),
        },
      ],
      "Сервизът е добавен."
    );
    setNewServiceCenter(emptyServiceCenter);
  }

  async function saveServiceCenter(serviceCenter: ServiceCenterSetting) {
    await persistServiceCenters(
      serviceCenters.map((item) =>
        item.id === serviceCenter.id
          ? {
              ...item,
              name: serviceCenter.name.trim(),
              manager: serviceCenter.manager.trim(),
              phone: serviceCenter.phone.trim(),
            }
          : item
      ),
      "Сервизът е обновен."
    );
    setEditingServiceCenterId("");
  }

  async function archiveServiceCenter(id: string) {
    await persistServiceCenters(
      serviceCenters.map((item) =>
        item.id === id
          ? { ...item, active: false, archivedAt: item.archivedAt || new Date().toISOString() }
          : item
      ),
      "Сервизът е архивиран."
    );
  }

  async function deleteServiceCenter(id: string) {
    const confirmed = window.confirm("Сигурни ли сте, че искате да изтриете този сервиз?");
    if (!confirmed) return;

    await persistServiceCenters(
      serviceCenters.filter((item) => item.id !== id),
      "Сервизът е изтрит."
    );
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newServiceName.trim();
    if (!name) return;

    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("services").insert({ name, parent_id: null });
      if (error) throw new Error(error.message);
      setNewServiceName("");
      await loadServices();
      showToast("Услугата е добавена.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис на услугата.");
    } finally {
      setSaving(false);
    }
  }

  async function addSubService(parentService: ServiceSetting) {
    const name = (newSubServiceNames[parentService.id] || "").trim();
    if (!name) return;

    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("services")
        .insert({ name, parent_id: parentService.id });
      if (error) throw new Error(error.message);

      setNewSubServiceNames((current) => ({ ...current, [parentService.id]: "" }));
      await loadServices();
      showToast("Подуслугата е добавена.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис на подуслугата.");
    } finally {
      setSaving(false);
    }
  }

  async function saveService(service: ServiceSetting) {
    const name = editingServiceName.trim();
    if (!name) return;

    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const updateServiceResult = await supabase
        .from("services")
        .update({ name })
        .eq("id", service.id);
      assertSupabaseResult(updateServiceResult, "Грешка при обновяване на услугата.");

      if (service.name !== name) {
        const updateSalesServicesResult = await supabase
          .from("sales_opportunity_services")
          .update({ service_name: name })
          .eq("service_name", service.name);
        assertSupabaseResult(
          updateSalesServicesResult,
          "Грешка при обновяване на услугата в офертите."
        );
      }

      setEditingServiceId("");
      setEditingServiceName("");
      await loadServices();
      showToast("Услугата е обновена.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при обновяване на услугата.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveService(service: ServiceSetting) {
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("services")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", service.id);
      if (error) throw new Error(error.message);
      await loadServices();
      showToast("Услугата е архивирана.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `${error.message} Провери дали е пусната миграцията за архивиране на услуги.`
          : "Грешка при архивиране на услугата."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(service: ServiceSetting) {
    const confirmed = window.confirm("Сигурни ли сте, че искате да изтриете тази услуга?");
    if (!confirmed) return;

    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const serviceIds = serviceAndChildIds(service, services);
      const serviceNames = serviceAndChildNames(service, services);
      const deleteLocationLinksResult = await supabase
        .from("location_services")
        .delete()
        .in("service_id", serviceIds);
      assertSupabaseResult(
        deleteLocationLinksResult,
        "Грешка при изтриване на връзките към обекти."
      );

      const deleteSalesLinksResult = await supabase
        .from("sales_opportunity_services")
        .delete()
        .in("service_name", serviceNames);
      assertSupabaseResult(
        deleteSalesLinksResult,
        "Грешка при изтриване на услугата от офертите."
      );

      const { error } = await supabase
        .from("services")
        .delete()
        .in("id", serviceIds);

      if (error) throw new Error(error.message);

      await loadServices();
      showToast("Услугата е изтрита.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при изтриване на услугата.");
    } finally {
      setSaving(false);
    }
  }

  async function persistProtocols(next: ProtocolSettings, message: string) {
    setSaving(true);
    try {
      await writeProtocolSettingsToSupabase(next);
      setProtocols(next);
      showToast(message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис в базата.");
    } finally {
      setSaving(false);
    }
  }

  async function addCatalogValue(key: CatalogKey) {
    const value = (newCatalogValues[key] || "").trim();
    if (!value) return;

    const current = protocols[key] ?? [];
    const next = {
      ...protocols,
      [key]: uniqueValues([...current, value]),
    };
    await persistProtocols(next, "Стойността е добавена.");
    setNewCatalogValues((values) => ({ ...values, [key]: "" }));
  }

  async function saveCatalogValue(key: CatalogKey) {
    if (editingCatalogIndex === null) return;
    const value = editingCatalogValue.trim();
    if (!value) return;

    const nextValues = [...(protocols[key] ?? [])];
    nextValues[editingCatalogIndex] = value;
    await persistProtocols(
      { ...protocols, [key]: uniqueValues(nextValues) },
      "Стойността е обновена."
    );
    setEditingCatalogKey("");
    setEditingCatalogIndex(null);
    setEditingCatalogValue("");
  }

  async function archiveCatalogValue(key: CatalogKey, value: string) {
    const activeValues = (protocols[key] ?? []).filter((item) => item !== value);
    const archivedCatalogValues = {
      ...(protocols.archivedCatalogValues ?? {}),
      [key]: uniqueValues([...(protocols.archivedCatalogValues?.[key] ?? []), value]),
    };

    await persistProtocols(
      { ...protocols, [key]: activeValues, archivedCatalogValues },
      "Стойността е архивирана."
    );
  }

  async function deleteCatalogValue(key: CatalogKey, value: string) {
    const confirmed = window.confirm("Сигурни ли сте, че искате да изтриете тази стойност?");
    if (!confirmed) return;

    await persistProtocols(
      {
        ...protocols,
        [key]: (protocols[key] ?? []).filter((item) => item !== value),
      },
      "Стойността е изтрита."
    );
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await writeCompanySettingsToSupabase(company);
      showToast("Данните за документи са запазени.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при запис в базата.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Настройки" description="Кратки оперативни списъци за ежедневна работа">
      {toast ? (
        <Card className="mb-4 border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          {toast}
        </Card>
      ) : null}
      {errorMessage ? (
        <Card className="mb-4 border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {errorMessage}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_1fr]">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card className="p-3">
            <div className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black transition ${
                      active
                        ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <Icon size={17} />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>

        <div>
          {loadState === "loading" ? (
            <Card className="flex items-center gap-3 p-6 text-sm font-bold text-slate-500">
              <Loader2 className="animate-spin" size={18} />
              Зареждане на настройки...
            </Card>
          ) : null}

          {loadState !== "loading" && activeSection === "technicians" ? (
            <Card className="p-5">
              <SectionHeader title="Техници" description="Хората, които се избират при протоколи и сервизни посещения." />
              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {activeTechnicians.length ? (
                  activeTechnicians.map((technician) => {
                    const editing = editingTechnicianId === technician.id;
                    return (
                      <PersonCard
                        key={technician.id}
                        title={technician.name}
                        subtitle={technician.role}
                        phone={technician.phone}
                        editing={editing}
                        onEdit={() => setEditingTechnicianId(technician.id)}
                        onDelete={() => deleteTechnician(technician.id)}
                      >
                        <EditableTechnician
                          technician={technician}
                          onChange={(next) =>
                            setTechnicians((items) => items.map((item) => item.id === next.id ? next : item))
                          }
                          onSave={() => saveTechnician(technician)}
                        />
                      </PersonCard>
                    );
                  })
                ) : (
                  <EmptyState>Няма активни техници.</EmptyState>
                )}
              </div>
              <form onSubmit={addTechnician} className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <Field label="Име">
                    <Input value={newTechnician.name} onChange={(event) => setNewTechnician((item) => ({ ...item, name: event.target.value }))} placeholder="Иван Петров" />
                  </Field>
                  <Field label="Роля">
                    <Input value={newTechnician.role} onChange={(event) => setNewTechnician((item) => ({ ...item, role: event.target.value }))} placeholder="Сервизен техник" />
                  </Field>
                  <Field label="Телефон">
                    <Input value={newTechnician.phone} onChange={(event) => setNewTechnician((item) => ({ ...item, phone: event.target.value }))} placeholder="+359..." />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={saving}><Plus size={16} />Добави техник</Button>
                </div>
              </form>
            </Card>
          ) : null}

          {loadState !== "loading" && activeSection === "service-centers" ? (
            <Card className="p-5">
              <SectionHeader title="Сервизи" description="Сервизи A, B и C за избор при създаване на протоколи." />
              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {activeServiceCenters.length ? (
                  activeServiceCenters.map((serviceCenter) => {
                    const editing = editingServiceCenterId === serviceCenter.id;
                    return (
                      <PersonCard
                        key={serviceCenter.id}
                        title={serviceCenter.name}
                        subtitle={serviceCenter.manager || "Без отговорник"}
                        phone={serviceCenter.phone}
                        editing={editing}
                        onEdit={() => setEditingServiceCenterId(serviceCenter.id)}
                        onDelete={() => deleteServiceCenter(serviceCenter.id)}
                      >
                        <EditableServiceCenter
                          serviceCenter={serviceCenter}
                          onChange={(next) =>
                            setServiceCenters((items) => items.map((item) => item.id === next.id ? next : item))
                          }
                          onSave={() => saveServiceCenter(serviceCenter)}
                        />
                      </PersonCard>
                    );
                  })
                ) : (
                  <EmptyState>Няма активни сервизи.</EmptyState>
                )}
              </div>
              <form onSubmit={addServiceCenter} className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <Field label="Име">
                    <Input value={newServiceCenter.name} onChange={(event) => setNewServiceCenter((item) => ({ ...item, name: event.target.value }))} placeholder="A" />
                  </Field>
                  <Field label="Отговорник">
                    <Input value={newServiceCenter.manager} onChange={(event) => setNewServiceCenter((item) => ({ ...item, manager: event.target.value }))} placeholder="Иван Петров" />
                  </Field>
                  <Field label="Телефон">
                    <Input value={newServiceCenter.phone} onChange={(event) => setNewServiceCenter((item) => ({ ...item, phone: event.target.value }))} placeholder="+359..." />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={saving}><Plus size={16} />Добави сервиз</Button>
                </div>
              </form>
            </Card>
          ) : null}

          {loadState !== "loading" && activeSection === "services" ? (
            <Card className="p-5">
              <SectionHeader title="Услуги" description="Кратък списък с услугите, които фирмата предлага." />
              <div className="mt-5 space-y-3">
                {activeServiceGroups.length ? activeServiceGroups.map(({ service, children }) => {
                  const editing = editingServiceId === service.id;
                  return (
                    <div key={service.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      {editing ? (
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Input value={editingServiceName} onChange={(event) => setEditingServiceName(event.target.value)} />
                          <Button type="button" onClick={() => saveService(service)} disabled={saving}><Save size={15} />Запази</Button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-black text-slate-900">{service.name}</div>
                            <div className="mt-1 text-xs font-bold text-slate-400">{service.usageCount} обекта</div>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => { setEditingServiceId(service.id); setEditingServiceName(service.name); }}><PenLine size={14} />Редактирай</Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => deleteService(service)} aria-label="Изтрий"><Trash2 size={16} /></Button>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                        {children.length ? children.map((child) => {
                          const childEditing = editingServiceId === child.id;
                          return (
                            <div key={child.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              {childEditing ? (
                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <Input value={editingServiceName} onChange={(event) => setEditingServiceName(event.target.value)} />
                                  <Button type="button" size="sm" onClick={() => saveService(child)} disabled={saving}><Save size={14} />Запази</Button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="text-sm font-black text-slate-800">{child.name}</div>
                                    <div className="mt-1 text-xs font-bold text-slate-400">{child.usageCount} обекта</div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditingServiceId(child.id); setEditingServiceName(child.name); }}><PenLine size={14} />Редактирай</Button>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => deleteService(child)} aria-label="Изтрий"><Trash2 size={16} /></Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-400">
                            Няма подуслуги.
                          </div>
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={newSubServiceNames[service.id] || ""}
                            onChange={(event) =>
                              setNewSubServiceNames((current) => ({
                                ...current,
                                [service.id]: event.target.value,
                              }))
                            }
                            placeholder="Нова подуслуга"
                          />
                          <Button type="button" variant="outline" onClick={() => addSubService(service)} disabled={saving}>
                            <Plus size={15} />Добави подуслуга
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }) : <EmptyState>Няма активни услуги.</EmptyState>}
              </div>
              <form onSubmit={addService} className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row">
                <Input value={newServiceName} onChange={(event) => setNewServiceName(event.target.value)} placeholder="Абонаментно обслужване" />
                <Button type="submit" disabled={saving}><Plus size={16} />Добави услуга</Button>
              </form>
            </Card>
          ) : null}

          {loadState !== "loading" && activeSection === "protocols" ? (
            <Card className="p-5">
              <SectionHeader
                title="Протоколи"
                description="Тези стойности се използват в падащите менюта при попълване на протоколи."
              />
              <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {catalogGroups.map((group) => (
                  <div key={group.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-black text-slate-900">{group.title}</h3>
                      <Badge variant="neutral">{protocols[group.key]?.length ?? 0}</Badge>
                    </div>
                    <div className="space-y-2">
                      {(protocols[group.key] ?? []).length ? (
                        (protocols[group.key] ?? []).map((value, index) => {
                          const editing = editingCatalogKey === group.key && editingCatalogIndex === index;
                          return (
                            <div key={`${group.key}-${value}`} className="rounded-xl border border-slate-200 bg-white p-2">
                              {editing ? (
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <Input value={editingCatalogValue} onChange={(event) => setEditingCatalogValue(event.target.value)} />
                                  <Button type="button" size="sm" onClick={() => saveCatalogValue(group.key)}><Save size={14} />Запази</Button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <span className="text-sm font-bold text-slate-800">{value}</span>
                                  <div className="flex gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditingCatalogKey(group.key); setEditingCatalogIndex(index); setEditingCatalogValue(value); }}><PenLine size={14} />Редактирай</Button>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => deleteCatalogValue(group.key, value)} aria-label="Изтрий"><Trash2 size={16} /></Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <EmptyState>Няма активни стойности.</EmptyState>
                      )}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Input value={newCatalogValues[group.key] || ""} onChange={(event) => setNewCatalogValues((values) => ({ ...values, [group.key]: event.target.value }))} placeholder={group.placeholder} />
                      <Button type="button" variant="secondary" onClick={() => addCatalogValue(group.key)} disabled={saving}><Plus size={15} />+ Добави ново</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {loadState !== "loading" && activeSection === "documents" ? (
            <Card className="p-5">
              <SectionHeader
                title="Документи"
                description="Тези данни се използват при генериране и печат на протоколи и документи."
              />
              <form onSubmit={saveCompany} className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="Име на фирма">
                  <Input value={company.companyName} onChange={(event) => setCompany((item) => ({ ...item, companyName: event.target.value }))} />
                </Field>
                <Field label="ЕИК">
                  <Input value={company.bulstat} onChange={(event) => setCompany((item) => ({ ...item, bulstat: event.target.value }))} />
                </Field>
                <Field label="Адрес">
                  <Input value={company.address} onChange={(event) => setCompany((item) => ({ ...item, address: event.target.value }))} />
                </Field>
                <Field label="Телефон">
                  <Input value={company.phone} onChange={(event) => setCompany((item) => ({ ...item, phone: event.target.value }))} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={company.email} onChange={(event) => setCompany((item) => ({ ...item, email: event.target.value }))} />
                </Field>
                <div className="flex items-end justify-end">
                  <Button type="submit" disabled={saving}><Save size={16} />Запази</Button>
                </div>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">{description}</p>
    </div>
  );
}

function PersonCard({
  title,
  subtitle,
  phone,
  editing,
  children,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  phone: string;
  editing: boolean;
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (editing) {
    return <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">{children}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-slate-900">{title}</div>
          <div className="mt-1 text-sm font-bold text-slate-500">{subtitle}</div>
          <div className="mt-2 text-sm font-bold text-slate-700">{phone || "Без телефон"}</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}><PenLine size={14} />Редактирай</Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Изтрий"><Trash2 size={16} /></Button>
      </div>
    </div>
  );
}

function EditableTechnician({
  technician,
  onChange,
  onSave,
}: {
  technician: TechnicianSetting;
  onChange: (technician: TechnicianSetting) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <Field label="Име"><Input value={technician.name} onChange={(event) => onChange({ ...technician, name: event.target.value })} /></Field>
      <Field label="Роля"><Input value={technician.role} onChange={(event) => onChange({ ...technician, role: event.target.value })} /></Field>
      <Field label="Телефон"><Input value={technician.phone} onChange={(event) => onChange({ ...technician, phone: event.target.value })} /></Field>
      <div className="flex justify-end"><Button type="button" onClick={onSave}><Save size={15} />Запази</Button></div>
    </div>
  );
}

function EditableServiceCenter({
  serviceCenter,
  onChange,
  onSave,
}: {
  serviceCenter: ServiceCenterSetting;
  onChange: (serviceCenter: ServiceCenterSetting) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <Field label="Име"><Input value={serviceCenter.name} onChange={(event) => onChange({ ...serviceCenter, name: event.target.value })} /></Field>
      <Field label="Отговорник"><Input value={serviceCenter.manager} onChange={(event) => onChange({ ...serviceCenter, manager: event.target.value })} /></Field>
      <Field label="Телефон"><Input value={serviceCenter.phone} onChange={(event) => onChange({ ...serviceCenter, phone: event.target.value })} /></Field>
      <div className="flex justify-end"><Button type="button" onClick={onSave}><Save size={15} />Запази</Button></div>
    </div>
  );
}
