import { createSupabaseBrowserClient } from "./supabase/client";

export const protocolsStorageKey = "firecontrol:protocols";
export const deletedProtocolsStorageKey = "firecontrol:protocols:deleted";
export const deletedDemoProtocolsStorageKey = "firecontrol:protocols:deleted-demo";
export const protocolsUpdatedEvent = "firecontrol:protocols-updated";

function readStringArray(key: string) {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeStringSet(key: string, values: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
}

export function readDeletedProtocolNumbers() {
  return new Set([
    ...readStringArray(deletedProtocolsStorageKey),
    ...readStringArray(deletedDemoProtocolsStorageKey),
  ]);
}

export function markProtocolDeletedLocally(protocolNumber: string) {
  if (typeof window === "undefined") return;

  const deletedProtocols = new Set(readStringArray(deletedProtocolsStorageKey));
  deletedProtocols.add(protocolNumber);
  writeStringSet(deletedProtocolsStorageKey, deletedProtocols);

  const deletedDemoProtocols = new Set(readStringArray(deletedDemoProtocolsStorageKey));
  deletedDemoProtocols.add(protocolNumber);
  writeStringSet(deletedDemoProtocolsStorageKey, deletedDemoProtocols);
}

export function removeLocalProtocolRecord(protocolNumber: string) {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(protocolsStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const filtered = parsed.filter(
      (item) =>
        !item ||
        typeof item !== "object" ||
        String((item as Record<string, unknown>)["number"]) !== protocolNumber
    );
    window.localStorage.setItem(protocolsStorageKey, JSON.stringify(filtered));
  } catch {
    // Local legacy cleanup should not block the database delete.
  }
}

export async function deleteProtocolEverywhere(protocolNumber: string) {
  const supabase = createSupabaseBrowserClient();
  const protocolRowsResult = await supabase
    .from("protocols")
    .select("id,protocol_number,number")
    .or(`protocol_number.eq.${protocolNumber},number.eq.${protocolNumber}`);
  const protocolIds =
    ((protocolRowsResult.data as Record<string, unknown>[] | null) ?? [])
      .map((row) => String(row["id"] ?? ""))
      .filter(Boolean);
  const sourceIds = Array.from(new Set([protocolNumber, ...protocolIds]));

  const results = await Promise.all([
    supabase
      .from("service_tasks")
      .delete()
      .eq("source_protocol_number", protocolNumber),
    ...sourceIds.map((sourceId) =>
      supabase.from("service_tasks").delete().eq("source_protocol_id", sourceId)
    ),
    supabase
      .from("service_tasks")
      .delete()
      .ilike("source_label", `%${protocolNumber}%`),
    supabase.from("protocols").delete().eq("protocol_number", protocolNumber),
    supabase.from("protocols").delete().eq("number", protocolNumber),
  ]);

  const blockingError = results.find((result) => {
    const message = result.error?.message ?? "";
    return result.error && !message.includes("schema cache");
  })?.error;

  if (blockingError) {
    throw new Error(blockingError.message);
  }

  removeLocalProtocolRecord(protocolNumber);
  markProtocolDeletedLocally(protocolNumber);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(protocolsUpdatedEvent));
    window.dispatchEvent(new Event("firecontrol:tasks-updated"));
  }
}
