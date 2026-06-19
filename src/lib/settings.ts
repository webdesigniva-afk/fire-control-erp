import { createSupabaseBrowserClient } from "./supabase/client";

export type TechnicianSetting = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  active: boolean;
  archivedAt?: string;
};

export type ServiceCenterSetting = {
  id: string;
  name: string;
  /** Kept only for backward compatibility with older saved settings. */
  code?: string;
  manager: string;
  phone: string;
  email: string;
  address: string;
  active: boolean;
  archivedAt?: string;
};

export type CompanySettings = {
  companyName: string;
  bulstat: string;
  address: string;
  phone: string;
  email: string;
  manager: string;
  logoUrl?: string;
};

export type ProtocolSettings = {
  protocolPrefix: string;
  defaultTechnician: string;
  defaultSystemStatus: string;
  nextVisitDays: string;
  objectTypes: string[];
  extinguisherBrands: string[];
  extinguisherModels: string[];
  extinguisherCategories: string[];
  extinguisherChargeMasses: string[];
  extinguishingAgentTypes: string[];
  extinguishingAgentTradeNames: string[];
  extinguisherServiceTypes: string[];
  fireAlarmPanelBrands: string[];
  fireAlarmPanelModels: string[];
  emergencyLightingTypes: string[];
  fireHydrantTypes: string[];
  fireHydrantDiameters: string[];
  evacuationPlanTypes: string[];
  serviceSystemStatuses: string[];
  archivedCatalogValues?: Record<string, string[]>;
};

export const techniciansStorageKey = "firecontrol:settings:technicians";
export const serviceCentersStorageKey = "firecontrol:settings:service-centers";
export const companySettingsStorageKey = "firecontrol:settings:company";
export const protocolSettingsStorageKey = "firecontrol:settings:protocols";
export const settingsUpdatedEvent = "firecontrol:settings-updated";

export const fallbackTechnicianNames = [
  "Иван Петров",
  "Георги Димитров",
  "Николай Стоянов",
];

export const defaultTechnicians: TechnicianSetting[] =
  fallbackTechnicianNames.map((name, index) => ({
    id: `tech-${index + 1}`,
    name,
    role: "Сервизен техник",
    phone: "",
    email: "",
    active: true,
  }));

export const defaultServiceCenters: ServiceCenterSetting[] = [
  {
    id: "service-center-1",
    name: "A",
    manager: "",
    phone: "",
    email: "",
    address: "",
    active: true,
  },
];

export const defaultCompanySettings: CompanySettings = {
  companyName: "FIREControl",
  bulstat: "",
  address: "",
  phone: "",
  email: "",
  manager: "",
  logoUrl: "",
};

export const defaultProtocolSettings: ProtocolSettings = {
  protocolPrefix: "PR",
  defaultTechnician: fallbackTechnicianNames[0],
  defaultSystemStatus: "Изрядна",
  nextVisitDays: "30",
  objectTypes: [
    "Магазин",
    "Склад",
    "Офис",
    "Производствен обект",
    "Жилищна сграда",
    "Хотел",
    "Ресторант",
    "Училище",
    "Болница",
    "Административна сграда",
    "Индустриален обект",
  ],
  extinguisherBrands: ["FlammStop", "Gloria", "Bavaria"],
  extinguisherModels: ["ABC 6 kg", "CO2 5 kg", "Пяна 6 l"],
  extinguisherCategories: ["Прахов", "Въглероден диоксид", "Пенен", "Воден"],
  extinguisherChargeMasses: ["2", "5", "6", "9", "12"],
  extinguishingAgentTypes: ["прах", "CO2", "пяна", "вода"],
  extinguishingAgentTradeNames: ["ABC 40", "AFFF"],
  extinguisherServiceTypes: [
    "техническо обслужване",
    "презареждане",
    "хидростатично изпитване на устойчивост на налягане",
  ],
  fireAlarmPanelBrands: [
    "Teletek",
    "Honeywell",
    "Bosch",
    "Siemens",
    "Друг производител",
  ],
  fireAlarmPanelModels: ["IRIS 8", "SIMPO", "Cerberus PRO"],
  emergencyLightingTypes: [
    "Аварийно осветително тяло",
    "Табела Изход",
    "Паник осветление",
    "Прожектор",
    "Друго",
  ],
  fireHydrantTypes: [
    "Вътрешен пожарен кран",
    "Външен пожарен хидрант",
    "Сух щранг",
    "Друго",
  ],
  fireHydrantDiameters: [
    "DN25",
    "DN52",
    "DN65",
    "DN80",
    "DN100",
    "DN150",
    "Неизвестен",
  ],
  evacuationPlanTypes: [
    "Общ план",
    "План на етаж",
    "План за евакуация при пожар",
    "План за аварийни ситуации",
    "Друг",
  ],
  serviceSystemStatuses: ["Изрядна", "С отклонения", "Неизправна"],
  archivedCatalogValues: {},
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function readCompanySettings() {
  return readJson(companySettingsStorageKey, defaultCompanySettings);
}

export function writeCompanySettings(settings: CompanySettings) {
  window.localStorage.setItem(companySettingsStorageKey, JSON.stringify(settings));
  window.dispatchEvent(new Event(settingsUpdatedEvent));
}

async function readSettingFromSupabase<T>(key: string, fallback: T): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return fallback;
  const value = (data as { value?: unknown }).value;
  if (Array.isArray(fallback)) {
    return (Array.isArray(value) ? value : fallback) as T;
  }
  return { ...fallback, ...(value as Partial<T>) } as T;
}

async function writeSettingToSupabase<T>(key: string, value: T) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) throw new Error(error.message);
}

export async function readCompanySettingsFromSupabase() {
  return readSettingFromSupabase(companySettingsStorageKey, defaultCompanySettings);
}

export async function writeCompanySettingsToSupabase(settings: CompanySettings) {
  await writeSettingToSupabase(companySettingsStorageKey, settings);
  writeCompanySettings(settings);
}

export function readProtocolSettings() {
  return readJson(protocolSettingsStorageKey, defaultProtocolSettings);
}

export function writeProtocolSettings(settings: ProtocolSettings) {
  window.localStorage.setItem(
    protocolSettingsStorageKey,
    JSON.stringify(settings)
  );
  window.dispatchEvent(new Event(settingsUpdatedEvent));
}

export async function readProtocolSettingsFromSupabase() {
  return readSettingFromSupabase(protocolSettingsStorageKey, defaultProtocolSettings);
}

export async function writeProtocolSettingsToSupabase(settings: ProtocolSettings) {
  await writeSettingToSupabase(protocolSettingsStorageKey, settings);
  writeProtocolSettings(settings);
}

export function readTechnicians() {
  return readArray<TechnicianSetting>(
    techniciansStorageKey,
    defaultTechnicians
  ).filter((technician) => technician.name.trim());
}

export function readServiceCenters() {
  return readArray<ServiceCenterSetting>(
    serviceCentersStorageKey,
    defaultServiceCenters
  ).filter((serviceCenter) => serviceCenter.name.trim());
}

export function writeServiceCenters(serviceCenters: ServiceCenterSetting[]) {
  window.localStorage.setItem(
    serviceCentersStorageKey,
    JSON.stringify(serviceCenters)
  );
  window.dispatchEvent(new Event(settingsUpdatedEvent));
}

export async function readServiceCentersFromSupabase() {
  return readSettingFromSupabase(serviceCentersStorageKey, defaultServiceCenters);
}

export async function writeServiceCentersToSupabase(
  serviceCenters: ServiceCenterSetting[]
) {
  await writeSettingToSupabase(serviceCentersStorageKey, serviceCenters);
  writeServiceCenters(serviceCenters);
}

export function writeTechnicians(technicians: TechnicianSetting[]) {
  window.localStorage.setItem(
    techniciansStorageKey,
    JSON.stringify(technicians)
  );
  window.dispatchEvent(new Event(settingsUpdatedEvent));
}

export async function readTechniciansFromSupabase() {
  return readSettingFromSupabase(techniciansStorageKey, defaultTechnicians);
}

export async function writeTechniciansToSupabase(
  technicians: TechnicianSetting[]
) {
  await writeSettingToSupabase(techniciansStorageKey, technicians);
  writeTechnicians(technicians);
}

export function resolveServiceCenterCode(center: Pick<ServiceCenterSetting, "name" | "code">) {
  const visibleName = center.name.trim().toUpperCase();
  if (/^[A-ZА-Я]$/.test(visibleName)) return visibleName;
  return center.code?.trim().toUpperCase().slice(0, 1) || "A";
}

// Looks up the protocol numbering letter for a location's assigned service
// center by matching the location's `service` text against stored settings.
// Falls back to "A" when no match is found.
export function resolveServiceCode(serviceText: string): string {
  if (!serviceText.trim()) return "A";
  const centers = readServiceCenters();
  const lower = serviceText.toLowerCase();
  const match = centers.find((c) => lower.includes(c.name.toLowerCase()));
  return match ? resolveServiceCenterCode(match) : "A";
}

export function readActiveTechnicianNames() {
  const names = readTechnicians()
    .filter((technician) => technician.active && !technician.archivedAt)
    .map((technician) => technician.name.trim())
    .filter(Boolean);

  return names.length ? names : fallbackTechnicianNames;
}
