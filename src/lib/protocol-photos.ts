import { createSupabaseBrowserClient } from "./supabase/client";

export const protocolPhotosBucket = "protocol-photos";

export type ProtocolPhotoRecord = {
  id: string;
  protocolId: string;
  protocolNumber: string;
  objectId: string;
  uploadedBy: string;
  fileUrl: string;
  storagePath: string;
  description: string;
  createdAt: string;
  protocolType?: string;
  technician?: string;
};

type DataRecord = Record<string, unknown>;

function textValue(record: DataRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

export function mapProtocolPhoto(row: DataRecord): ProtocolPhotoRecord {
  const storagePath = textValue(row, ["storage_path"]);
  const explicitUrl = textValue(row, ["file_url"]);
  const protocolPayload = (row["protocols"] ?? {}) as DataRecord;
  const publicUrl = storagePath
    ? createSupabaseBrowserClient().storage
        .from(protocolPhotosBucket)
        .getPublicUrl(storagePath).data.publicUrl
    : "";

  return {
    id: textValue(row, ["id"]),
    protocolId: textValue(row, ["protocol_id"]),
    protocolNumber:
      textValue(row, ["protocol_number"]) ||
      textValue(protocolPayload, ["protocol_number", "number"]),
    objectId: textValue(row, ["object_id"]),
    uploadedBy: textValue(row, ["uploaded_by"]),
    fileUrl: explicitUrl || publicUrl,
    storagePath,
    description: textValue(row, ["description"]),
    createdAt: textValue(row, ["created_at"]),
    protocolType: textValue(protocolPayload, ["protocol_type", "type"]),
    technician: textValue(protocolPayload, ["technician"]),
  };
}

export async function readProtocolPhotosByNumber(protocolNumber: string) {
  if (!protocolNumber) return [];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("protocol_photos")
    .select("*")
    .eq("protocol_number", protocolNumber)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data as DataRecord[]) ?? []).map(mapProtocolPhoto);
}

export async function readProtocolPhotosForObject(opts: {
  objectId: string;
  objectCode: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const ids = [opts.objectId, opts.objectCode].filter(Boolean);

  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("protocol_photos")
    .select("*")
    .in("object_id", ids)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = ((data as DataRecord[]) ?? []).map(mapProtocolPhoto);
  const protocolNumbers = Array.from(
    new Set(rows.map((photo) => photo.protocolNumber).filter(Boolean))
  );

  if (!protocolNumbers.length) return rows;

  const { data: protocolRows } = await supabase
    .from("protocols")
    .select("protocol_number, number, protocol_type, type, technician")
    .in("protocol_number", protocolNumbers);

  const protocolByNumber = new Map<string, DataRecord>();
  for (const protocol of (protocolRows as DataRecord[]) ?? []) {
    const number = textValue(protocol, ["protocol_number", "number"]);
    if (number) protocolByNumber.set(number, protocol);
  }

  return rows.map((photo) => {
    const protocol = protocolByNumber.get(photo.protocolNumber);
    return protocol
      ? {
          ...photo,
          protocolType: textValue(protocol, ["protocol_type", "type"]),
          technician: textValue(protocol, ["technician"]),
        }
      : photo;
  });
}

export async function deleteProtocolPhoto(photo: ProtocolPhotoRecord) {
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase
    .from("protocol_photos")
    .delete()
    .eq("id", photo.id);

  if (error) throw new Error(error.message);

  if (photo.storagePath) {
    await supabase.storage.from(protocolPhotosBucket).remove([photo.storagePath]);
  }
}
