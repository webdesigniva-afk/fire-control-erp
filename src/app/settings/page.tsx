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
  Wrench,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  DeleteConfirmDialog,
  type DeleteConfirmDialogState,
} from "../../components/ui/delete-confirm-dialog";
import { Input } from "../../components/ui/input";
import {
  type CompanySettings,
  type ProtocolSettings,
  type ServiceCenterSetting,
  defaultCompanySettings,
  defaultProtocolSettings,
  defaultServiceCenters,
  readCompanySettings,
  readCompanySettingsFromSupabase,
  readProtocolSettings,
  readProtocolSettingsFromSupabase,
  readServiceCenters,
  readServiceCentersFromSupabase,
  writeCompanySettingsToSupabase,
  writeProtocolSettingsToSupabase,
  writeServiceCentersToSupabase,
} from "../../lib/settings";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;
type LoadState = "loading" | "ready" | "error";
type SectionId = "service-centers" | "services" | "protocols" | "documents";
type CatalogKey =
  | "objectTypes"
  | "extinguisherBrands"
  | "extinguisherModels"
  | "extinguisherCategories"
  | "extinguishingAgentTypes"
  | "extinguishingAgentTradeNames"
  | "extinguisherChargeMasses"
  | "extinguisherServiceTypes"
  | "fireAlarmPanelBrands"
  | "fireAlarmPanelModels"
  | "emergencyLightingTypes"
  | "fireHydrantTypes"
  | "fireHydrantDiameters"
  | "evacuationPlanTypes"
  | "serviceSystemStatuses";

type ServiceSetting = {
  id: string;
  name: string;
  parentId: string;
  usageCount: number;
  archivedAt: string;
};

type TeamMemberOption = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

const sections: Array<{ id: SectionId; label: string; icon: typeof UserRound }> = [
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
  { key: "fireAlarmPanelBrands", title: "Марки пожароизвестителни централи", placeholder: "Напр. Teletek" },
  { key: "fireAlarmPanelModels", title: "Модели пожароизвестителни централи", placeholder: "Напр. IRIS 8" },
  { key: "emergencyLightingTypes", title: "Тип аварийно осветление", placeholder: "Напр. Табела Изход" },
  { key: "fireHydrantTypes", title: "Тип пожарен кран", placeholder: "Напр. Вътрешен пожарен кран" },
  { key: "fireHydrantDiameters", title: "Диаметър пожарен кран", placeholder: "Напр. DN52" },
  { key: "evacuationPlanTypes", title: "Тип евакуационен план", placeholder: "Напр. План на етаж" },
  { key: "serviceSystemStatuses", title: "Статуси", placeholder: "Напр. Изрядна" },
];

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
  const [activeSection, setActiveSection] = useState<SectionId>("service-centers");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteDialog, setDeleteDialog] =
    useState<DeleteConfirmDialogState | null>(null);

  const [serviceCenters, setServiceCenters] = useState<ServiceCenterSetting[]>(defaultServiceCenters);
  const [newServiceCenter, setNewServiceCenter] = useState<ServiceCenterSetting>(emptyServiceCenter);
  const [editingServiceCenterId, setEditingServiceCenterId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);

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

      setServiceCenters(readServiceCenters());
      setProtocols(readProtocolSettings());
      setCompany(readCompanySettings());

      try {
        const [dbServiceCenters, dbProtocols, dbCompany, dbTeamMembers] =
          await Promise.all([
            readServiceCentersFromSupabase(),
            readProtocolSettingsFromSupabase(),
            readCompanySettingsFromSupabase(),
            readTeamMemberOptions(),
          ]);

        if (!mounted) return;

        setServiceCenters(dbServiceCenters);
        setProtocols(dbProtocols);
        setCompany(dbCompany);
        setTeamMembers(dbTeamMembers);
        await loadServices();
        setLoadState("ready");
      } catch (error) {
        if (!mounted) return;
        await loadServices();
        setTeamMembers(await readTeamMemberOptions().catch(() => []));
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

  async function readTeamMemberOptions() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("team_members")
      .select("id,name,phone,email")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    return ((data as DataRecord[] | null) ?? [])
      .map((row) => ({
        id: textValue(row, ["id"]),
        name: textValue(row, ["name"]),
        phone: textValue(row, ["phone"]),
        email: textValue(row, ["email"]),
      }))
      .filter((member) => member.id && member.name);
  }

  function applyServiceCenterManager(
    serviceCenter: ServiceCenterSetting,
    memberId: string
  ): ServiceCenterSetting {
    const member = teamMembers.find((item) => item.id === memberId);
    if (!member) {
      return { ...serviceCenter, manager: "", phone: "", email: "" };
    }

    return {
      ...serviceCenter,
      manager: member.name,
      phone: member.phone,
      email: member.email,
    };
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
          email: newServiceCenter.email.trim(),
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
              email: serviceCenter.email.trim(),
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

  async function confirmDeleteServiceCenter(id: string) {
    await persistServiceCenters(
      serviceCenters.filter((item) => item.id !== id),
      "Сервизът е изтрит."
    );
    setDeleteDialog(null);
  }

  function deleteServiceCenter(id: string) {
    const serviceCenter = serviceCenters.find((item) => item.id === id);
    setDeleteDialog({
      title: "Изтриване на сервиз",
      itemLabel: serviceCenter?.name ? `сервиза ${serviceCenter.name}` : "този сервиз",
      onConfirm: () => confirmDeleteServiceCenter(id),
    });
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

  async function confirmDeleteService(service: ServiceSetting) {
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
      setDeleteDialog(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Грешка при изтриване на услугата.");
    } finally {
      setSaving(false);
    }
  }
  function deleteService(service: ServiceSetting) {
    setDeleteDialog({
      title: "Изтриване на услуга",
      itemLabel: `услугата ${service.name}`,
      details: "Ще бъдат изтрити и връзките към обекти и оферти.",
      onConfirm: () => confirmDeleteService(service),
    });
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

  async function confirmDeleteCatalogValue(key: CatalogKey, value: string) {
    await persistProtocols(
      {
        ...protocols,
        [key]: (protocols[key] ?? []).filter((item) => item !== value),
      },
      "Стойността е изтрита."
    );
    setDeleteDialog(null);
  }

  function deleteCatalogValue(key: CatalogKey, value: string) {
    setDeleteDialog({
      title: "Изтриване на стойност",
      itemLabel: `стойността ${value}`,
      onConfirm: () => confirmDeleteCatalogValue(key, value),
    });
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
                        email={serviceCenter.email}
                        editing={editing}
                        onEdit={() => setEditingServiceCenterId(serviceCenter.id)}
                        onDelete={() => deleteServiceCenter(serviceCenter.id)}
                      >
                        <EditableServiceCenter
                          serviceCenter={serviceCenter}
                          teamMembers={teamMembers}
                          onChange={(next) =>
                            setServiceCenters((items) => items.map((item) => item.id === next.id ? next : item))
                          }
                          onSelectManager={(memberId) =>
                            setServiceCenters((items) =>
                              items.map((item) =>
                                item.id === serviceCenter.id
                                  ? applyServiceCenterManager(item, memberId)
                                  : item
                              )
                            )
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
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <Field label="Име">
                    <Input value={newServiceCenter.name} onChange={(event) => setNewServiceCenter((item) => ({ ...item, name: event.target.value }))} placeholder="Сервиз A" />
                  </Field>
                  <Field label="Отговорник">
                    <select
                      value={teamMembers.find((member) => member.name === newServiceCenter.manager)?.id ?? ""}
                      onChange={(event) =>
                        setNewServiceCenter((item) =>
                          applyServiceCenterManager(item, event.target.value)
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    >
                      <option value="">Избери от екипа</option>
                      {teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {newServiceCenter.manager ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600">
                    {newServiceCenter.phone || "Без телефон"} · {newServiceCenter.email || "Без email"}
                  </div>
                ) : null}
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
                      <Button type="button" variant="secondary" onClick={() => addCatalogValue(group.key)} disabled={saving}><Plus size={15} />Добави ново</Button>
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
      <DeleteConfirmDialog
        dialog={deleteDialog}
        busy={saving}
        onCancel={() => {
          if (!saving) setDeleteDialog(null);
        }}
      />
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
  email,
  editing,
  children,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  phone: string;
  email: string;
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
          <div className="mt-1 text-sm font-bold text-slate-500">{email || "Без email"}</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}><PenLine size={14} />Редактирай</Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Изтрий"><Trash2 size={16} /></Button>
      </div>
    </div>
  );
}

function EditableServiceCenter({
  serviceCenter,
  teamMembers,
  onChange,
  onSelectManager,
  onSave,
}: {
  serviceCenter: ServiceCenterSetting;
  teamMembers: TeamMemberOption[];
  onChange: (serviceCenter: ServiceCenterSetting) => void;
  onSelectManager: (memberId: string) => void;
  onSave: () => void;
}) {
  const selectedManagerId =
    teamMembers.find((member) => member.name === serviceCenter.manager)?.id ?? "";

  return (
    <div className="grid grid-cols-1 gap-3">
      <Field label="Име"><Input value={serviceCenter.name} onChange={(event) => onChange({ ...serviceCenter, name: event.target.value })} /></Field>
      <Field label="Отговорник">
        <select
          value={selectedManagerId}
          onChange={(event) => onSelectManager(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
        >
          <option value="">Избери от екипа</option>
          {teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </Field>
      {serviceCenter.manager ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600">
          {serviceCenter.phone || "Без телефон"} · {serviceCenter.email || "Без email"}
        </div>
      ) : null}
      <div className="flex justify-end"><Button type="button" onClick={onSave}><Save size={15} />Запази</Button></div>
    </div>
  );
}




