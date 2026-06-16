/**
 * protocols-sync.ts
 *
 * Reads protocols saved in localStorage by the protocol form and inserts
 * their metadata into the Supabase `protocols` table.
 *
 * Safe to call repeatedly. Only records not already in Supabase are synced.
 */

import { createSupabaseBrowserClient } from "./supabase/client";
import { readDeletedProtocolNumbers } from "./protocols-delete";

const PROTOCOLS_LS_KEY = "firecontrol:protocols";

type LsProtocol = {
  number: string;
  status?: string;
  protocolType?: string;
  objectCode?: string;
  date?: string;
  client?: string;
  objectName?: string;
  technician?: string;
};

const TYPE_TO_KEY: Record<string, string> = {
  "Протокол за поддръжка на ПИС": "service",
  "Абонаментно обслужване / профилактичен преглед": "subscription",
  "Пожарогасители": "extinguisher",
  "Сервизен протокол": "service",
};

function parseProtocolNumber(num: string) {
  const match = num.match(/^S([A-Z])(\d{2})-\d{4}-(\d+)$/);

  if (!match) {
    return {
      serviceCode: "A",
      yearShort: new Date().getFullYear().toString().slice(2),
      sequence: 0,
    };
  }

  return {
    serviceCode: match[1],
    yearShort: match[2],
    sequence: Number.parseInt(match[3], 10),
  };
}

export type SyncResult = {
  checked: number;
  synced: number;
  errors: string[];
};

async function readExistingProtocolNumbers(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  numbers: string[]
) {
  const canonical = await supabase
    .from("protocols")
    .select("protocol_number")
    .in("protocol_number", numbers);

  if (!canonical.error) {
    return new Set(
      (canonical.data ?? []).map((row) =>
        String((row as Record<string, unknown>)["protocol_number"])
      )
    );
  }

  const legacy = await supabase
    .from("protocols")
    .select("number")
    .in("number", numbers);

  if (legacy.error) {
    throw new Error(legacy.error.message);
  }

  return new Set(
    (legacy.data ?? []).map((row) =>
      String((row as Record<string, unknown>)["number"])
    )
  );
}

export async function syncProtocolsToSupabase(): Promise<SyncResult> {
  if (typeof window === "undefined") {
    return { checked: 0, synced: 0, errors: [] };
  }

  let all: LsProtocol[] = [];
  try {
    const raw = localStorage.getItem(PROTOCOLS_LS_KEY);
    if (!raw) return { checked: 0, synced: 0, errors: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { checked: 0, synced: 0, errors: [] };
    const deletedNumbers = readDeletedProtocolNumbers();
    all = parsed.filter(
      (p) =>
        typeof p.number === "string" &&
        p.number &&
        !deletedNumbers.has(p.number)
    );
  } catch {
    return { checked: 0, synced: 0, errors: [] };
  }

  if (all.length === 0) return { checked: 0, synced: 0, errors: [] };

  const supabase = createSupabaseBrowserClient();
  const numbers = all.map((p) => p.number);

  let inDb: Set<string>;
  try {
    inDb = await readExistingProtocolNumbers(supabase, numbers);
  } catch (error) {
    return {
      checked: all.length,
      synced: 0,
      errors: [
        `lookup: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    };
  }

  const toSync = all.filter((p) => !inDb.has(p.number));
  if (toSync.length === 0) {
    return { checked: all.length, synced: 0, errors: [] };
  }

  const qrCodes = [
    ...new Set(toSync.map((p) => p.objectCode).filter(Boolean)),
  ] as string[];

  const locationByQr = new Map<string, string>();
  if (qrCodes.length > 0) {
    const { data: locs } = await supabase
      .from("locations")
      .select("id, qr_code")
      .in("qr_code", qrCodes);

    for (const loc of locs ?? []) {
      const row = loc as Record<string, unknown>;
      locationByQr.set(String(row["qr_code"]), String(row["id"]));
    }
  }

  let synced = 0;
  const errors: string[] = [];

  for (const p of toSync) {
    const { serviceCode, yearShort, sequence } = parseProtocolNumber(p.number);
    const locationId =
      (p.objectCode && locationByQr.get(p.objectCode)) || null;
    const typeValue = TYPE_TO_KEY[p.protocolType ?? ""] ?? "service";
    const dateValue = p.date || new Date().toISOString().slice(0, 10);
    const statusValue = p.status === "completed" ? "completed" : "draft";

    const canonicalPayload = {
      protocol_number: p.number,
      protocol_type: typeValue,
      protocol_date: dateValue,
      protocol_sequence: sequence,
      service_code: serviceCode,
      year_short: yearShort,
      location_id: locationId,
      object_code: p.objectCode || "",
      client_name: p.client || "",
      object_name: p.objectName || "",
      technician: p.technician || "",
      status: statusValue,
      protocol_payload: p,
    };

    let { error } = await supabase.from("protocols").insert(canonicalPayload);

    if (error) {
      const legacy = await supabase.from("protocols").insert({
        number: p.number,
        type: typeValue,
        status: statusValue,
        location_id: locationId,
        protocol_payload: p,
      });
      error = legacy.error;
    }

    if (error) {
      errors.push(`${p.number}: ${error.message}`);
    } else {
      synced++;
    }
  }

  return { checked: all.length, synced, errors };
}
