import type { createSupabaseBrowserClient } from "./supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;
type DataRecord = Record<string, unknown>;

export type ServiceOption = {
  id: string;
  name: string;
  parentId: string;
  unitPrice: number;
};

export type ServiceOptionGroup = {
  service: ServiceOption;
  children: ServiceOption[];
};

export const defaultServiceNames = [
  "Абонаментно обслужване",
  "Пожарогасители",
  "Пожароизвестяване",
  "Аварийно осветление",
] as const;

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
  if (!record) return 0;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

function mapServiceOption(service: DataRecord): ServiceOption {
  return {
    id: textValue(service, ["id"]),
    name: textValue(service, ["name", "title"]).trim(),
    parentId: textValue(service, ["parent_id", "parentId"]),
    unitPrice: numberValue(service, ["unit_price", "unitPrice"]),
  };
}

function groupServiceOptions(services: ServiceOption[]) {
  const childrenByParentId = new Map<string, ServiceOption[]>();

  for (const service of services) {
    if (!service.parentId) continue;
    childrenByParentId.set(service.parentId, [
      ...(childrenByParentId.get(service.parentId) ?? []),
      service,
    ]);
  }

  return services
    .filter((service) => !service.parentId)
    .map((service) => ({
      service,
      children: childrenByParentId.get(service.id) ?? [],
    }));
}

export function serviceOptionName(group: ServiceOptionGroup, service: ServiceOption) {
  return group.children.length > 0
    ? `${group.service.name} / ${service.name}`
    : service.name;
}

export async function ensureDefaultServices(supabase: SupabaseBrowserClient) {
  const servicesResult = await supabase
    .from("services")
    .select("*")
    .order("name", { ascending: true });

  if (servicesResult.error) return servicesResult;

  return supabase
    .from("services")
    .select("*")
    .order("name", { ascending: true });
}

export async function readActiveServiceNamesFromSupabase(
  supabase: SupabaseBrowserClient
) {
  const groups = await readActiveServiceGroupsFromSupabase(supabase);

  return groups.flatMap((group) =>
    group.children.length > 0
      ? group.children.map((service) => serviceOptionName(group, service))
      : [group.service.name]
  );
}

export async function readActiveServiceGroupsFromSupabase(
  supabase: SupabaseBrowserClient
) {
  const result = await supabase
    .from("services")
    .select("*")
    .order("name", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  const services = ((result.data as DataRecord[]) ?? [])
    .filter((service) => !textValue(service, ["archived_at", "archivedAt"]))
    .map(mapServiceOption)
    .filter((service) => service.id && service.name);

  return groupServiceOptions(services);
}
