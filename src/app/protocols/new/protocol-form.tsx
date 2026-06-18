"use client";

import {
  useId,
  useMemo,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  ChevronDown,
  CheckCheck,
  CheckCircle2,
  CheckSquare2,
  Eye,
  FilePenLine,
  ImagePlus,
  Loader2,
  MapPin,
  Printer,
  Tags,
  X,
  PenLine,
  RotateCcw,
  Save,
  Square,
} from "lucide-react";
import { AppShell } from "../../../components/app-shell";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  defaultProtocolSettings,
  defaultCompanySettings,
  readCompanySettings,
  readProtocolSettings,
  readServiceCenters,
  resolveServiceCenterCode,
  settingsUpdatedEvent,
  type CompanySettings,
  type ProtocolSettings,
} from "../../../lib/settings";
import {
  readActiveTechnicianNamesFromTeamMembers,
} from "../../../lib/team-members";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import {
  mapProtocolPhoto,
  protocolPhotosBucket,
  readProtocolPhotosByNumber,
  type ProtocolPhotoRecord,
} from "../../../lib/protocol-photos";
import { syncProtocolsToSupabase } from "../../../lib/protocols-sync";
import {
  clearPlannedSubscriptionTasksForObject,
  completePlannedEquipmentTasks,
  recurrenceMonthsFromPeriodicity,
  upsertDefectTask,
  upsertServiceTask,
} from "../../../lib/tasks";

const PROTOCOLS_STORAGE_KEY = "firecontrol:protocols";
const PROTOCOLS_UPDATED_EVENT = "firecontrol:protocols-updated";
const TEAM_SESSION_STORAGE_KEY = "firecontrol:team-session";
const STICKER_PRINT_QUEUE_STORAGE_KEY = "firecontrol:sticker-print-queue";

type TeamSession = {
  id?: string;
  name?: string;
  signature_url?: string;
};

type StoredProtocolStatus = "draft" | "completed";

type StoredProtocol = {
  number: string;
  status: StoredProtocolStatus;
  protocolType: ProtocolType | "Сервизен протокол" | "";
  objectCode?: string;
  date: string;
  client: string;
  objectName: string;
  address: string;
  region?: string;
  phone?: string;
  technician: string;
  contractReference: string;
  clientRepresentative: string;
  personnelFunctions: Record<"A" | "B" | "C", boolean>;
  subscriptionChecks: Record<string, SubscriptionCheckValue>;
  subscriptionCheckNotes?: Record<string, string>;
  serviceQuality: ServiceQualityValue;
  photos?: ProtocolPhoto[];
  notes: string;
  serviceDefects?: string;
  serviceDeviations?: string;
  serviceSystemStatus?: string;
  nextVisitDate?: string;
  technicianSignatureDataUrl: string;
  clientSignatureDataUrl: string;
  extinguisherRows: ExtinguisherProtocolRow[];
  selectedEquipmentIds?: string[];
  checks: Record<string, CheckValue>;
  savedAt: number;
  completedAt?: number;
};

const fallbackDraftProtocols: StoredProtocol[] = [
  {
    number: "PR-2026-0416",
    status: "draft",
    protocolType: "Протокол за поддръжка на ПИС",
    objectCode: "",
    date: "2026-04-10",
    client: "Хотел Централ ООД",
    objectName: "Хотел Централ",
    address: "",
    region: "",
    phone: "",
    technician: "Николай Стоянов",
    contractReference: "",
    clientRepresentative: "",
    personnelFunctions: { A: true, B: false, C: false },
    subscriptionChecks: {},
    serviceQuality: "happy",
    notes: "",
    serviceDefects: "",
    serviceDeviations: "",
    serviceSystemStatus: "Изрядна",
    nextVisitDate: "",
    technicianSignatureDataUrl: "",
    clientSignatureDataUrl: "",
    extinguisherRows: [],
    selectedEquipmentIds: [],
    checks: {},
    savedAt: Date.now(),
  },
];

function loadStoredProtocols(): StoredProtocol[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(PROTOCOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredProtocol[]) : [];
  } catch {
    return [];
  }
}

function persistProtocol(record: StoredProtocol) {
  if (typeof window === "undefined") return;

  const compactRecord: StoredProtocol = {
    ...record,
    photos: [],
    technicianSignatureDataUrl: "",
    clientSignatureDataUrl: "",
  };

  try {
    const existing = loadStoredProtocols();
    const filtered = existing.filter((item) => item.number !== record.number);
    filtered.unshift(compactRecord);
    localStorage.setItem(
      PROTOCOLS_STORAGE_KEY,
      JSON.stringify(filtered.slice(0, 100))
    );
    window.dispatchEvent(new Event(PROTOCOLS_UPDATED_EVENT));
  } catch {
    try {
      localStorage.setItem(PROTOCOLS_STORAGE_KEY, JSON.stringify([compactRecord]));
      window.dispatchEvent(new Event(PROTOCOLS_UPDATED_EVENT));
    } catch {
      // Supabase is the source of truth. If browser storage is full, do not
      // block protocol completion because of a local list cache.
    }
  }
}

// Protocol type → DB string
function protocolDbType(protocolType: string) {
  return PROTOCOL_TYPE_KEY[protocolType] ?? "service";
}

function isMissingProtocolPayloadColumn(message: string) {
  return (
    message.includes("protocol_payload") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  );
}

async function saveProtocolRecordToSupabase(
  record: StoredProtocol,
  locationId: string | null
) {
  const supabase = createSupabaseBrowserClient();
  const typeValue = protocolDbType(record.protocolType);
  const commonPayload = {
    location_id: locationId,
    status: record.status,
    protocol_payload: record,
    updated_at: new Date().toISOString(),
  };
  const canonicalPayload = {
    ...commonPayload,
    protocol_number: record.number,
    protocol_type: typeValue,
    protocol_date: record.date || null,
    object_code: record.objectCode || "",
    client_name: record.client || "",
    object_name: record.objectName || "",
    technician: record.technician || "",
  };
  const legacyPayload = {
    ...commonPayload,
    number: record.number,
    type: typeValue,
  };

  const canonicalUpdate = await supabase
    .from("protocols")
    .update(canonicalPayload)
    .eq("protocol_number", record.number)
    .select("id");

  if (!canonicalUpdate.error && (canonicalUpdate.data?.length ?? 0) > 0) {
    return;
  }

  const legacyUpdate = await supabase
    .from("protocols")
    .update(legacyPayload)
    .eq("number", record.number)
    .select("id");

  if (!legacyUpdate.error && (legacyUpdate.data?.length ?? 0) > 0) {
    return;
  }

  const insert = await supabase.from("protocols").insert(canonicalPayload);
  const legacyInsert = insert.error
    ? await supabase.from("protocols").insert(legacyPayload)
    : insert;
  const error =
    legacyInsert.error ?? insert.error ?? canonicalUpdate.error ?? legacyUpdate.error;

  if (error) {
    if (isMissingProtocolPayloadColumn(error.message)) {
      throw new Error(
        "Supabase таблицата protocols няма колоната protocol_payload. Пусни sql/protocols_ensure_columns.sql в Supabase SQL editor и опитай отново."
      );
    }

    throw new Error(error.message);
  }
}

const PROTOCOL_TYPE_KEY: Record<string, string> = {
  "Абонаментно обслужване / профилактичен преглед": "subscription",
  "Пожарогасители": "extinguisher",
  "Протокол за поддръжка на ПИС": "service",
  "Сервизен протокол": "service",
};

/**
 * Atomically claims the next sequence number, computes the formatted protocol
 * number (SA26-0805-4001), inserts a structured record into the `protocols`
 * table, and returns the formatted string.
 *
 * Format: S{serviceCode}{yearShort}-{DD}{MM}-{sequence}
 */
async function claimProtocolNumber(opts: {
  serviceCode: string;
  serviceId: string;
  protocolDate: string;       // YYYY-MM-DD
  protocolType: string;
  locationId: string;
  objectCode: string;
  clientName: string;
  objectName: string;
  technician: string;
  status: "draft" | "completed";
}): Promise<string> {
  const supabase = createSupabaseBrowserClient();

  // 1. Atomically increment counter and get our sequence number
  const { data: seqData, error: seqError } = await supabase.rpc("get_next_protocol_seq");
  if (seqError || seqData === null) {
    throw new Error(`Грешка при генериране на номер: ${seqError?.message ?? "no data"}`);
  }
  const seq = Number(seqData);

  // 2. Build formatted number: S{code}{YY}-{DD}{MM}-{seq}
  const d = opts.protocolDate ? new Date(`${opts.protocolDate}T00:00:00`) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  const code = (opts.serviceCode || "A").toUpperCase();
  const formatted = `S${code}${yy}-${dd}${mm}-${seq}`;

  // 3. Insert structured record into protocols table
  // Try full insert first; if columns are missing (migration not yet run),
  // fall back to the minimal base-schema columns that always exist.
  const typeValue     = PROTOCOL_TYPE_KEY[opts.protocolType] ?? "service";
  const dateValue     = opts.protocolDate || new Date().toISOString().slice(0, 10);

  const { error: fullError } = await supabase.from("protocols").insert({
    protocol_number:   formatted,
    protocol_type:     typeValue,
    protocol_date:     dateValue,
    protocol_sequence: seq,
    service_code:      code,
    service_id:        opts.serviceId || null,
    year_short:        yy,
    location_id:       opts.locationId || null,
    object_code:       opts.objectCode,
    client_name:       opts.clientName,
    object_name:       opts.objectName,
    technician:        opts.technician,
    status:            opts.status,
  });

  let insertError = fullError;

  if (fullError) {
    // Full insert failed (likely missing columns — run protocols_ensure_columns.sql
    // to get all metadata columns).  Fall back to the 4 columns that always exist.
    const { error: minimalError } = await supabase.from("protocols").insert({
      number:      formatted,
      type:        typeValue,
      status:      opts.status,
      location_id: opts.locationId || null,
    });
    insertError = minimalError;
  }

  if (insertError) {
    throw new Error(`Грешка при запис на протокола: ${insertError.message}`);
  }

  return formatted;
}

/**
 * Updates the status of an existing protocol record in Supabase.
 */
async function updateProtocolStatus(
  protocolNumber: string,
  status: "draft" | "completed"
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("protocols")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("protocol_number", protocolNumber);

  if (error) {
    throw new Error(error.message);
  }
}

async function getProtocolDatabaseId(protocolNumber: string) {
  const supabase = createSupabaseBrowserClient();

  const canonical = await supabase
    .from("protocols")
    .select("id")
    .eq("protocol_number", protocolNumber)
    .maybeSingle();

  if (!canonical.error && canonical.data) {
    return String((canonical.data as DataRecord)["id"] ?? "");
  }

  const legacy = await supabase
    .from("protocols")
    .select("id")
    .eq("number", protocolNumber)
    .maybeSingle();

  if (legacy.error) throw new Error(legacy.error.message);
  return legacy.data ? String((legacy.data as DataRecord)["id"] ?? "") : "";
}

function stickerDatabaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (
    message.includes("claim_fire_extinguisher_sticker_number") ||
    message.includes("protocol_fire_extinguisher_rows") ||
    message.includes("sticker_number") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Sticker database fields are missing. Run sql/database_first_storage.sql in Supabase SQL editor and try again.";
  }

  return message || "Sticker save failed.";
}

function completionErrorMessage(error: unknown) {
  const detail =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Неизвестна грешка.";

  return `Неуспешно завършване: ${detail}`;
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Invalid image data"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed"));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    image.src = url;
  });
}

async function compressImageFile(file: File) {
  const maxDimension = 1800;
  const quality = 0.78;
  const image = await loadImageElement(file);
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const shouldCompress =
    file.size > 850 * 1024 || scale < 1 || file.type !== "image/jpeg";

  if (!shouldCompress) {
    return {
      file,
      dataUrl: await blobToDataUrl(file),
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      file,
      dataUrl: await blobToDataUrl(file),
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  if (!blob || blob.size >= file.size) {
    return {
      file,
      dataUrl: await blobToDataUrl(file),
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  const compressedFile = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + ".jpg",
    {
      type: "image/jpeg",
      lastModified: Date.now(),
    }
  );

  return {
    file: compressedFile,
    dataUrl: await blobToDataUrl(blob),
    originalSize: file.size,
    compressedSize: compressedFile.size,
  };
}

function extensionFromPhoto(photo: ProtocolPhoto) {
  const fromName = photo.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();

  const mime = photo.file?.type || photo.dataUrl.match(/data:(.*?);base64/)?.[1];
  if (mime?.includes("png")) return "png";
  if (mime?.includes("webp")) return "webp";
  return "jpg";
}

function safeStorageSegment(value: string, fallback: string) {
  const latinized = value.replace(/[Аа]/g, "A").replace(/[Вв]/g, "B").replace(/[Сс]/g, "C");
  const safe = latinized
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || fallback;
}

function protocolPhotoFromRecord(photo: ProtocolPhotoRecord): ProtocolPhoto {
  return {
    id: photo.id,
    name: photo.storagePath.split("/").pop() || "Снимка",
    dataUrl: photo.fileUrl,
    fileUrl: photo.fileUrl,
    storagePath: photo.storagePath,
    description: photo.description,
    createdAt: photo.createdAt,
  };
}

function compactProtocolPhotos(photos: ProtocolPhoto[]): ProtocolPhoto[] {
  return photos
    .filter((photo) => photo.fileUrl || photo.storagePath)
    .map((photo) => ({
      id: photo.id,
      name: photo.name,
      dataUrl: photo.fileUrl || "",
      fileUrl: photo.fileUrl,
      storagePath: photo.storagePath,
      description: photo.description,
      createdAt: photo.createdAt,
    }));
}

function protocolPhotoStorageError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("bucket not found") ||
    normalized.includes("not found")
  ) {
    return (
      "Supabase Storage bucket 'protocol-photos' не е създаден. " +
      "Пусни обновения sql/database_first_storage.sql в Supabase SQL editor и опитай отново."
    );
  }

  return message;
}

type ProtocolType =
  | "Абонаментно обслужване / профилактичен преглед"
  | "Пожарогасители"
  | "Протокол за поддръжка на ПИС";

type CheckValue = "Изпълнено" | "Неизпълнено" | "Неприложимо";
type SubscriptionCheckValue = "добро" | "лошо" | "непопълнено";
type ServiceQualityValue = "happy" | "neutral" | "sad" | "";
type QrObject = {
  code: string;
  name: string;
  address: string;
};

type ObjectOption = {
  code: string;
  locationId: string;
  name: string;
  address: string;
  client: string;
  clientId: string;
  contact: string;
  phone: string;
  region: string;
};

type Equipment = {
  id: string;
  name: string;
  serial: string;
  brand: string;
  model: string;
  capacity: string;
  location: string;
  extinguisherCategory: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  stickerNumber: string;
  category: "extinguisher" | "system";
};

type ExtinguisherProtocolRow = {
  id: string;
  equipmentId: string;
  rowNumber: string;
  brand: string;
  model: string;
  serialNumber: string;
  location: string;
  identificationMarking: string;
  category: string;
  chargeMassKg: string;
  extinguishingAgentType: string;
  extinguishingAgentTradeName: string;
  serviceType: string;
  resultStatus: string;
  problemNote: string;
  serviceDate: string;
  nextServiceDate: string;
  servicePersonName: string;
  servicePersonSignatureDataUrl: string;
  stickerNumber: string;
};

type ServiceCenterOption = {
  id: string;
  name: string;
  code: string;
};

type ProtocolPhoto = {
  id: string;
  name: string;
  dataUrl: string;
  file?: File;
  fileUrl?: string;
  storagePath?: string;
  description?: string;
  createdAt?: string;
  originalSize?: number;
  compressedSize?: number;
};

type ProtocolFormProps = {
  draftNumber?: string;
  qrObject?: QrObject;
  initialObjectCode?: string;
};

type ExtinguisherDropdowns = Pick<
  ProtocolSettings,
  | "extinguisherBrands"
  | "extinguisherModels"
  | "extinguisherCategories"
  | "extinguisherChargeMasses"
  | "extinguishingAgentTypes"
  | "extinguishingAgentTradeNames"
  | "extinguisherServiceTypes"
  | "serviceSystemStatuses"
>;

const protocolTypes: ProtocolType[] = [
  "Абонаментно обслужване / профилактичен преглед",
  "Пожарогасители",
  "Протокол за поддръжка на ПИС",
];

const printTypeByProtocol: Record<ProtocolType, string> = {
  "Абонаментно обслужване / профилактичен преглед": "subscription-service",
  Пожарогасители: "extinguisher-handover",
  "Протокол за поддръжка на ПИС": "service-maintenance",
};

const legacyTechnicianOptions = [
  "Иван Петров",
  "Георги Димитров",
  "Николай Стоянов",
];

const checklistByType: Record<ProtocolType, string[]> = {
  "Абонаментно обслужване / профилактичен преглед": [
    "Проверка на централа и индикации",
    "Проверка на ръчни пожароизвестители",
    "Проверка на автоматични датчици",
    "Проверка на звукова и светлинна сигнализация",
    "Проверка на резервно захранване",
  ],
  Пожарогасители: [],
  "Протокол за поддръжка на ПИС": [
    "1.1 Проверка за безопасен достъп до съоръженията за управление и индикация",
    "1.2 Проверка дали етикетите и индикациите могат да бъдат лесно разчетени",
    "1.3 Проверка дали фоновият шум позволява звуковата индикация да бъде чута",
    "1.4 Проверка на архива и паспорта на системата",
    "1.5 Проверка на функционалността на резервното електрозахранване",
    "1.6 Замерване на захранващите стойности",
    "1.7 Проверка на функциите за следене за аларма, повреда и изключване",
    "1.8 Проверка за осигурен достъп до всички ръчни пожароизвестителни бутони",
    "1.9 Проверка на пожароизвестители",
  ],
};

const subscriptionChecklistRows = [
  {
    number: "1.",
    label: "Външен оглед на възлите на ПГИ",
    details: [
      "Проверка контролни уреди за налягане в КСК",
      "Проверка връзки",
      "Визуална проверка спринклерни глави",
      "Проверка уредите за електронен контрол",
      "Проверка крепежните елементи на системата",
    ],
    periodicity: "ежемесечно",
  },
  {
    number: "2.",
    label:
      "Проверка на блоковете за управление и работа на ПГИ в ръчен и автоматичен режим",
    details: [],
    periodicity: "на три месеца (3/6/9/12)",
  },
  {
    number: "3.",
    label: "Тест изправността и напрежението на линиите за активиране на ПГИ",
    details: [],
    periodicity: "ежемесечно",
  },
  {
    number: "4.",
    label: "Тест работата на ПГИ в режим местно и дистанционно управление",
    details: [],
    periodicity: "ежемесечно",
  },
  {
    number: "5.",
    label:
      "Проверка на изправността на изнесените сигнализатори за тревога / сирени, алармени звънци, блиц лампи и др.",
    details: [],
    periodicity: "годишно (12)",
  },
  {
    number: "6.",
    label: "Тест на ПГИ в „Автономен“ и „Ръчен“ режим на активиране",
    details: [],
    periodicity: "годишно",
  },
  {
    number: "7.",
    label: "Проверка на данните за работа на ПГИ",
    details: [],
    periodicity: "на три месеца",
  },
  {
    number: "8.",
    label: "Хардуерен тест на контролните устройства",
    details: [],
    periodicity: "годишно",
  },
];

const checkOptions: CheckValue[] = [
  "Изпълнено",
  "Неизпълнено",
  "Неприложимо",
];

const extinguisherResultStatusOptions = [
  "Годен за експлоатация",
  "Годен за експлоатация след техническо обслужване",
  "Негоден за експлоатация",
  "Подлежи на ремонт",
  "Подлежи на бракуване",
];

type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

function readTeamSession(): TeamSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(TEAM_SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TeamSession) : null;
  } catch {
    return null;
  }
}

function contractNumberFromSavedDocument(row: DataRecord) {
  const payload = isRecord(row.payload) ? row.payload : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};

  return textValue(row, ["number"]) || textValue(contract, ["number"]);
}

function savedContractMatchesObject(
  row: DataRecord,
  objectKeys: Set<string>,
  convertedContractIds: Set<string>
) {
  const documentId = textValue(row, ["id"]);
  if (documentId && convertedContractIds.has(documentId)) return true;

  const payload = isRecord(row.payload) ? row.payload : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const keys = [
    payload.locationId,
    payload.locationQrCode,
    payload.convertedObjectId,
    contract.object,
    row.object,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return keys.some((key) => objectKeys.has(key));
}

function mapObjectOption(
  location: DataRecord,
  client: DataRecord | null
): ObjectOption {
  const qrCode = textValue(location, ["qr_code", "code"]);
  const locationId = textValue(location, ["id"]);

  return {
    code: qrCode || locationId,
    locationId,
    name: textValue(location, ["name", "object_name", "title"]) || qrCode,
    address: textValue(location, ["address", "full_address"]),
    client: textValue(client, ["name", "organization", "company_name"]),
    clientId: textValue(location, ["client_id"]),
    contact: textValue(client, [
      "contact_person",
      "contact",
      "representative",
      "person",
    ]),
    phone: textValue(client, ["phone", "telephone", "mobile"]),
    region: textValue(location, ["region", "oblast", "area"]),
  };
}

function mapEquipmentItem(row: DataRecord): Equipment {
  const id = textValue(row, ["id"]);
  const name = textValue(row, ["display_name", "name", "type", "equipment_type", "category"]);
  const type = textValue(row, ["equipment_type", "type"]);
  const classification = textValue(row, ["category"]);

  return {
    id: id || textValue(row, ["serial", "serial_number", "code"]),
    name,
    serial: textValue(row, ["serial", "serial_number", "identifier", "code"]),
    brand: textValue(row, ["brand"]),
    model: textValue(row, ["model"]),
    capacity: textValue(row, ["capacity", "mass", "charge_mass"]),
    location: textValue(row, ["location", "object_location", "place"]),
    extinguisherCategory: textValue(row, ["extinguisher_category", "subtype"]),
    extinguishingAgentType: textValue(row, ["extinguishing_agent_type"]),
    extinguishingAgentTradeName: textValue(row, ["extinguishing_agent_trade_name"]),
    stickerNumber: textValue(row, ["sticker_number"]),
    category:
      name.toLowerCase().includes("пожарогас") ||
      type.toLowerCase().includes("пожарогас") ||
      classification.toLowerCase().includes("extinguisher")
        ? "extinguisher"
        : "system",
  };
}

function extinguisherLabel(item: Equipment) {
  const title = [item.extinguisherCategory || item.name, item.capacity]
    .filter(Boolean)
    .join(" ");
  return [
    title || item.name,
    item.serial ? `SN:${item.serial}` : "",
    item.location,
  ]
    .filter(Boolean)
    .join(" | ");
}

function identificationMarkingFromEquipment(item: Equipment) {
  return [item.brand, item.model, item.serial ? `SN:${item.serial}` : ""]
    .filter(Boolean)
    .join(" ");
}

function addYearsToInputDate(value: string, years: number) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInTargetMonth = new Date(year, month, 0).getDate();
  const nextDay = Math.min(day, daysInTargetMonth);

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(nextDay).padStart(2, "0"),
  ].join("-");
}

function isTechnicalExtinguisherService(serviceType: string) {
  return serviceType
    .trim()
    .toLowerCase()
    .includes("\u0442\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u043e \u043e\u0431\u0441\u043b\u0443\u0436\u0432\u0430\u043d\u0435");
}

function nextServiceDateForTechnicalService(
  serviceType: string,
  serviceDate: string
) {
  if (!serviceDate || !isTechnicalExtinguisherService(serviceType)) return "";
  return addYearsToInputDate(serviceDate, 1);
}

function extinguisherRowsFromEquipment(
  equipment: Equipment[],
  serviceDate: string,
  technician: string
): ExtinguisherProtocolRow[] {
  const extinguishers = equipment.filter((item) => item.category === "extinguisher");

  return extinguishers.map((item, index) => ({
    id: item.id || `ext-${index + 1}`,
    equipmentId: item.id,
    rowNumber: String(index + 1),
    brand: item.brand,
    model: item.model,
    serialNumber: item.serial,
    location: item.location,
    identificationMarking: identificationMarkingFromEquipment(item),
    category: item.extinguisherCategory,
    chargeMassKg: item.capacity,
    extinguishingAgentType: item.extinguishingAgentType,
    extinguishingAgentTradeName: item.extinguishingAgentTradeName,
    serviceType: "техническо обслужване",
    resultStatus: "",
    problemNote: "",
    serviceDate,
    nextServiceDate: nextServiceDateForTechnicalService(
      "техническо обслужване",
      serviceDate
    ),
    servicePersonName: technician,
    servicePersonSignatureDataUrl: "",
    stickerNumber: item.stickerNumber,
  }));
}

function buildExtinguisherType(row: ExtinguisherProtocolRow) {
  return [
    row.category,
    row.extinguishingAgentType,
    row.chargeMassKg ? `${row.chargeMassKg} kg` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function extinguisherResultNeedsAttention(value: string) {
  const result = value.toLowerCase();
  return (
    result.includes("проблем") ||
    result.includes("problem") ||
    result.includes("негоден") ||
    result.includes("ремонт") ||
    result.includes("бракуване")
  );
}

function extinguisherFollowUpTaskContent(
  resultStatus: string,
  extinguisherTitle: string,
  problemNote: string
) {
  const result = resultStatus.toLowerCase();
  const note = problemNote.trim();
  const descriptionParts = [resultStatus, note].filter(Boolean);

  if (result.includes("ремонт")) {
    return {
      title: `Сервизна задача: ремонт - ${extinguisherTitle}`,
      description: descriptionParts.join("\n") || `Пожарогасителят подлежи на ремонт: ${extinguisherTitle}`,
    };
  }

  if (result.includes("бракуване")) {
    return {
      title: `Бракуване + предложение за подмяна: ${extinguisherTitle}`,
      description:
        [...descriptionParts, "Да се подготви предложение за подмяна."].join("\n") ||
        `Пожарогасителят подлежи на бракуване и подмяна: ${extinguisherTitle}`,
    };
  }

  if (result.includes("негоден")) {
    return {
      title: `Изисква решение: ${extinguisherTitle}`,
      description: descriptionParts.join("\n") || `Пожарогасителят е негоден за експлоатация: ${extinguisherTitle}`,
    };
  }

  return {
    title: `Проблем: ${extinguisherTitle}`,
    description: descriptionParts.join("\n") || extinguisherTitle,
  };
}

async function saveFireExtinguisherStickerRow({
  row,
  stickerNumber,
  protocolNumber,
  protocolId,
  objectId,
  objectName,
  companySettings,
}: {
  row: ExtinguisherProtocolRow;
  stickerNumber: string;
  protocolNumber: string;
  protocolId: string;
  objectId: string;
  objectName: string;
  companySettings: CompanySettings;
}) {
  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const numericSticker = Number(stickerNumber);
  const equipmentId = row.equipmentId || null;

  const equipmentUpdate = equipmentId
    ? await supabase
        .from("equipment")
        .update({
          sticker_number: numericSticker,
          sticker_generated_at: now,
          updated_at: now,
        })
        .eq("id", equipmentId)
    : { error: null };

  if (equipmentUpdate.error) {
    throw new Error(equipmentUpdate.error.message);
  }

  const rowPayload = {
    sticker_number: numericSticker,
    protocol_number: protocolNumber,
    protocol_id: protocolId || null,
    protocol_row_id: row.id,
    row_number: row.rowNumber,
    equipment_id: equipmentId,
    object_id: objectId,
    object_name: objectName,
    object_location: row.location,
    technician: row.servicePersonName,
    service_date: row.serviceDate || null,
    next_service_date: row.nextServiceDate || null,
    extinguisher_type: buildExtinguisherType(row),
    category: row.category,
    extinguishing_agent:
      row.extinguishingAgentTradeName || row.extinguishingAgentType,
    capacity_mass: row.chargeMassKg,
    brand: row.brand,
    model: row.model,
    serial_number: row.serialNumber,
    company_settings: companySettings,
    updated_at: now,
  };

  await saveProtocolFireExtinguisherRow(rowPayload);

  if (equipmentId) {
    const historyPayload = {
      equipment_id: equipmentId,
      object_id: objectId,
      protocol_id: protocolId || null,
      protocol_number: protocolNumber,
      sticker_number: numericSticker,
      service_type: row.serviceType,
      service_date: row.serviceDate || null,
      next_service_date: row.nextServiceDate || null,
      technician_id: "",
      technician: row.servicePersonName,
    };

    await saveFireExtinguisherServiceHistory(historyPayload);
  }
}

async function saveProtocolFireExtinguisherRow(rowPayload: {
  sticker_number: number;
  protocol_number: string;
  protocol_id: string | null;
  protocol_row_id: string;
  row_number: string;
  equipment_id: string | null;
  object_id: string;
  object_name: string;
  object_location: string;
  technician: string;
  service_date: string | null;
  next_service_date: string | null;
  extinguisher_type: string;
  category: string;
  extinguishing_agent: string;
  capacity_mass: string;
  brand: string;
  model: string;
  serial_number: string;
  company_settings: CompanySettings;
  updated_at: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const existingResult = await supabase
    .from("protocol_fire_extinguisher_rows")
    .select("id")
    .eq("sticker_number", rowPayload.sticker_number)
    .limit(1);

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const existingId = existingResult.data?.[0]?.id;
  if (existingId) {
    const updateResult = await supabase
      .from("protocol_fire_extinguisher_rows")
      .update(rowPayload)
      .eq("id", existingId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return;
  }

  const insertResult = await supabase
    .from("protocol_fire_extinguisher_rows")
    .insert(rowPayload);

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
}

async function saveFireExtinguisherServiceHistory(historyPayload: {
  equipment_id: string;
  object_id: string;
  protocol_id: string | null;
  protocol_number: string;
  sticker_number: number | null;
  service_type: string;
  service_date: string | null;
  next_service_date: string | null;
  technician_id: string;
  technician: string;
}) {
  const supabase = createSupabaseBrowserClient();

  if (historyPayload.service_date) {
    const existingResult = await supabase
      .from("fire_extinguisher_service_history")
      .select("id")
      .eq("equipment_id", historyPayload.equipment_id)
      .eq("protocol_number", historyPayload.protocol_number)
      .eq("service_date", historyPayload.service_date)
      .limit(1);

    if (existingResult.error) {
      throw new Error(existingResult.error.message);
    }

    const existingId = existingResult.data?.[0]?.id;
    if (existingId) {
      const updateResult = await supabase
        .from("fire_extinguisher_service_history")
        .update(historyPayload)
        .eq("id", existingId);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }

      return;
    }
  }

  const insertResult = await supabase
    .from("fire_extinguisher_service_history")
    .insert(historyPayload);

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
}

function inputDateFromLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return inputDateFromLocalDate(new Date());
}

function formatProtocolNumberPreview(
  serviceCode: string,
  protocolDate: string,
  sequence: number
) {
  const date = protocolDate ? new Date(`${protocolDate}T00:00:00`) : new Date();
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(2);
  const code = (serviceCode || "A").toUpperCase().slice(0, 1);

  return `S${code}${yy}-${dd}${mm}-${sequence}`;
}

function personnelFunctionsFromServiceCode(serviceCode: string) {
  const functionName = (serviceCode || "A").toUpperCase().slice(0, 1);

  return {
    A: functionName === "A",
    B: functionName === "B",
    C: functionName === "C",
  };
}

function addDaysToInputDate(value: string, days: number) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return inputDateFromLocalDate(date);
}

function addMonthsToInputDate(value: string, months: number) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);

  if (date.getDate() < day) {
    date.setDate(0);
  }

  return inputDateFromLocalDate(date);
}

function subscriptionTaskText(row: (typeof subscriptionChecklistRows)[number]) {
  return [row.label, ...row.details.map((detail) => `- ${detail}`)].join("\n");
}

function subscriptionDefectRows(
  checks: Record<string, SubscriptionCheckValue>,
  notes: Record<string, string>
) {
  return subscriptionChecklistRows
    .filter((row) => checks[row.number] === "лошо")
    .map((row) => ({
      row,
      comment: (notes[row.number] || "").trim(),
    }));
}

function emptySubscriptionChecks() {
  return Object.fromEntries(
    subscriptionChecklistRows.map((row) => [row.number, "непопълнено" as SubscriptionCheckValue])
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-xs font-black uppercase text-slate-400">
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  defaultValue,
  disabled = false,
  onChange,
  children,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
      >
        {children}
      </select>
    </div>
  );
}

function TextInputField({
  label,
  value,
  type = "text",
  readOnly = false,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
      />
    </div>
  );
}

function SignatureCapture({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  function getPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function prepareContext() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#000000";

    return { canvas, context };
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    onChange(canvas.toDataURL("image/png"));
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event);
    const prepared = prepareContext();
    if (!point || !prepared) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    prepared.context.beginPath();
    prepared.context.moveTo(point.x, point.y);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    const point = getPoint(event);
    const prepared = prepareContext();
    if (!point || !prepared) return;

    prepared.context.lineTo(point.x, point.y);
    prepared.context.stroke();
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;

    isDrawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    saveSignature();
  }

  function clearSignature() {
    const prepared = prepareContext();
    if (!prepared) return;

    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    onChange("");
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
          <PenLine size={18} />
          {title}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={clearSignature}
          className="h-9 px-3"
        >
          <RotateCcw size={16} />
          Изчисти
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        className="mt-4 h-32 w-full touch-none rounded-2xl border border-slate-200 bg-white"
      />
      <div className="mt-2 text-xs font-bold text-slate-400">
        {value ? "Подписът е добавен" : "Подпишете в полето"}
      </div>
    </div>
  );
}

function ProgressIndicator() {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Badge variant="orange">Чернова</Badge>
      <Badge variant="neutral">Готов за печат</Badge>
      <Badge variant="neutral">Подписан</Badge>
    </div>
  );
}

function statusVariant(status: string) {
  if (status === "Изряден" || status === "Изрядна") return "success";
  if (status === "Предстои") return "warning";
  return "danger";
}

function optionClasses(option: CheckValue, selected: boolean) {
  if (option === "Изпълнено") {
    return selected
      ? "border-orange-300 bg-orange-50 text-orange-700 shadow-sm"
      : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50";
  }

  if (option === "Неизпълнено") {
    return selected
      ? "border-red-300 bg-red-50 text-red-700 shadow-sm"
      : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50";
  }

  return selected
    ? "border-slate-300 bg-slate-100 text-slate-700 shadow-sm"
    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";
}

function ChecklistSection({
  items,
  checks,
  setChecks,
}: {
  items: string[];
  checks: Record<string, CheckValue>;
  setChecks: Dispatch<SetStateAction<Record<string, CheckValue>>>;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const completedCount = items.filter(
    (item) => checks[item] === "Изпълнено"
  ).length;

  function markAllCompleted() {
    setChecks((current) => {
      const next = { ...current };

      for (const item of items) {
        if (!next[item]) {
          next[item] = "Изпълнено";
        }
      }

      return next;
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="group flex min-w-0 items-start gap-3 text-left"
          aria-expanded={isOpen}
        >
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <ChevronDown
              size={18}
              className={`transition ${isOpen ? "rotate-0" : "-rotate-90"}`}
            />
          </span>
          <span>
            <span className="block text-lg font-black">
              Сервизно техническо обслужване
            </span>
            <span className="mt-1 block text-sm leading-6 text-slate-500">
              Официален чеклист по EN 16763 за контролни точки при сервизно
              техническо обслужване.
            </span>
          </span>
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Badge variant="neutral">
            {completedCount}/{items.length} изпълнени
          </Badge>
          <Button
            type="button"
            variant="secondary"
            onClick={markAllCompleted}
            className="w-full sm:w-auto"
          >
            Маркирай всички като изпълнени
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-5 space-y-3">
          {items.map((item, index) => {
            const [number, ...textParts] = item.split(" ");
            const hasOfficialNumber = /^\d+(\.\d+)?$/.test(number);
            const displayNumber = hasOfficialNumber ? number : index + 1;
            const text = hasOfficialNumber ? textParts.join(" ") : item;

            return (
              <div
                key={item}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-orange-600 shadow-sm">
                      {displayNumber}
                    </div>
                    <div className="pt-1 text-sm font-bold leading-6 text-slate-800">
                      {text}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {checkOptions.map((option) => {
                      const selected = checks[item] === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setChecks((current) => ({
                              ...current,
                              [item]: option,
                            }))
                          }
                          className={`h-11 rounded-xl border px-4 text-sm font-black transition ${optionClasses(
                            option,
                            selected
                          )}`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SubscriptionServiceSection({
  contractReference,
  setContractReference,
  clientRepresentative,
  setClientRepresentative,
  serviceCode,
  subscriptionChecks,
  setSubscriptionChecks,
  subscriptionCheckNotes,
  setSubscriptionCheckNotes,
  serviceQuality,
  setServiceQuality,
  technicianSignatureDataUrl,
  setTechnicianSignatureDataUrl,
  clientSignatureDataUrl,
  setClientSignatureDataUrl,
  notes,
  setNotes,
}: {
  contractReference: string;
  setContractReference: Dispatch<SetStateAction<string>>;
  clientRepresentative: string;
  setClientRepresentative: Dispatch<SetStateAction<string>>;
  serviceCode: string;
  subscriptionChecks: Record<string, SubscriptionCheckValue>;
  setSubscriptionChecks: Dispatch<SetStateAction<Record<string, SubscriptionCheckValue>>>;
  subscriptionCheckNotes: Record<string, string>;
  setSubscriptionCheckNotes: Dispatch<SetStateAction<Record<string, string>>>;
  serviceQuality: ServiceQualityValue;
  setServiceQuality: Dispatch<SetStateAction<ServiceQualityValue>>;
  technicianSignatureDataUrl: string;
  setTechnicianSignatureDataUrl: Dispatch<SetStateAction<string>>;
  clientSignatureDataUrl: string;
  setClientSignatureDataUrl: Dispatch<SetStateAction<string>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">
            Данни за абонаментно обслужване
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Тези полета се попълват в протокола и после се използват директно
            при печат.
          </p>
        </div>
        <Badge variant="orange">БДС EN 12845</Badge>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextInputField
          label="Договор / основание"
          value={contractReference}
          onChange={setContractReference}
        />
        <TextInputField
          label="Представител на клиента"
          value={clientRepresentative}
          onChange={setClientRepresentative}
        />
      </div>

      <div className="hidden">
        Функцията за печат се определя автоматично от избрания сервиз:
        <span className="ml-2 font-black text-orange-700">
          Функция {(serviceCode || "A").toUpperCase().slice(0, 1)}
        </span>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-black text-slate-800">
          1. Извършен профилактичен преглед и контролни измервания на апаратура:
        </h3>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full table-fixed border-collapse text-[12px] leading-[1.25] text-slate-800">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[50%]" />
              <col className="w-[19%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th
                  rowSpan={2}
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-center align-middle font-black"
                >
                  №
                </th>
                <th
                  rowSpan={2}
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-center align-middle font-black"
                >
                  Наименование на работите
                </th>
                <th
                  rowSpan={2}
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-center align-middle font-black"
                >
                  Периодичност
                </th>
                <th
                  colSpan={2}
                  className="border-b border-slate-200 px-2 py-1.5 text-center align-middle font-black"
                >
                  Състояние
                </th>
              </tr>
              <tr>
                <th className="border-b border-r border-slate-200 px-2 py-1.5 text-center align-middle font-bold normal-case text-slate-600">
                  добро
                </th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-center align-middle font-bold normal-case text-slate-600">
                  лошо
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-orange-50/70">
                <td
                  colSpan={5}
                  className="border-b border-slate-200 px-3 py-1.5 text-left align-middle text-xs font-black text-orange-700"
                >
                  АПГИ – спринклерна инсталация
                </td>
              </tr>
              {subscriptionChecklistRows.map((row, rowIndex) => {
                const state = subscriptionChecks[row.number];
                const isLastRow =
                  rowIndex === subscriptionChecklistRows.length - 1;
                const rowBorder = isLastRow ? "" : "border-b border-slate-200";

                function setRowState(nextState: SubscriptionCheckValue) {
                  setSubscriptionChecks((current) => ({
                    ...current,
                    [row.number]: nextState,
                  }));
                }

                function toggleState(target: "добро" | "лошо") {
                  setRowState(state === target ? "непопълнено" : target);
                }

                return (
                  <tr key={row.number}>
                    <td
                      className={`border-r border-slate-200 px-2 py-1.5 text-center align-top font-bold text-slate-700 ${rowBorder}`}
                    >
                      {row.number}
                    </td>
                    <td
                      className={`border-r border-slate-200 px-2 py-1.5 align-top ${rowBorder}`}
                    >
                      <div className="font-bold text-slate-800">
                        {row.label}
                      </div>
                      {row.details.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-slate-600">
                          {row.details.map((detail) => (
                            <li key={detail}>- {detail}</li>
                          ))}
                        </ul>
                      )}
                      {state === "лошо" && (
                        <textarea
                          value={subscriptionCheckNotes[row.number] ?? ""}
                          onChange={(event) =>
                            setSubscriptionCheckNotes((current) => ({
                              ...current,
                              [row.number]: event.target.value,
                            }))
                          }
                          placeholder="Дефект / коментар"
                          className="mt-2 min-h-10 w-full resize-y rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-xs font-medium text-slate-800 placeholder:text-red-300 focus:border-red-200 focus:outline-none focus:ring-2 focus:ring-red-100"
                        />
                      )}
                    </td>
                    <td
                      className={`border-r border-slate-200 px-2 py-1.5 text-center align-middle text-slate-700 ${rowBorder}`}
                    >
                      {row.periodicity}
                    </td>
                    <td
                      className={`border-r border-slate-200 p-1 text-center align-middle ${rowBorder}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleState("добро")}
                        aria-pressed={state === "добро"}
                        aria-label={`Маркирай ред ${row.number} като добро`}
                        className={`flex h-8 w-full items-center justify-center rounded-lg border text-xs font-black transition ${
                          state === "добро"
                            ? "border-emerald-400 bg-emerald-100 text-emerald-800 shadow-sm ring-2 ring-emerald-100"
                            : "border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                      >
                        добро
                      </button>
                    </td>
                    <td
                      className={`p-1 text-center align-middle ${rowBorder}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleState("лошо")}
                        aria-pressed={state === "лошо"}
                        aria-label={`Маркирай ред ${row.number} като лошо`}
                        className={`flex h-8 w-full items-center justify-center rounded-lg border text-xs font-black transition ${
                          state === "лошо"
                            ? "border-red-400 bg-red-100 text-red-800 shadow-sm ring-2 ring-red-100"
                            : "border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        }`}
                      >
                        лошо
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Натиснете отново върху отметка „добро“ или „лошо“, за да я премахнете
          (състояние „непопълнено“).
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="hidden lg:block" />
        <ServiceQualityPicker
          value={serviceQuality}
          onChange={setServiceQuality}
        />
        <SignatureCapture
          title="Подпис на техник"
          value={technicianSignatureDataUrl}
          onChange={setTechnicianSignatureDataUrl}
        />
        <SignatureCapture
          title="Подпис на клиент"
          value={clientSignatureDataUrl}
          onChange={setClientSignatureDataUrl}
        />
      </div>

      <div className="mt-5">
        <TextAreaField label="Бележки" value={notes} onChange={setNotes} />
      </div>
    </Card>
  );
}

function ServiceQualityPicker({
  value,
  onChange,
}: {
  value: ServiceQualityValue;
  onChange: Dispatch<SetStateAction<ServiceQualityValue>>;
}) {
  const options: Array<{
    value: Exclude<ServiceQualityValue, "">;
    label: string;
    selectedClasses: string;
    hoverClasses: string;
  }> = [
    {
      value: "happy",
      label: "Удовлетворен",
      selectedClasses:
        "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm",
      hoverClasses:
        "hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600",
    },
    {
      value: "neutral",
      label: "Неутрален",
      selectedClasses:
        "border-amber-300 bg-amber-50 text-amber-700 shadow-sm",
      hoverClasses:
        "hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600",
    },
    {
      value: "sad",
      label: "Неудовлетворен",
      selectedClasses: "border-red-300 bg-red-50 text-red-700 shadow-sm",
      hoverClasses:
        "hover:border-red-200 hover:bg-red-50 hover:text-red-600",
    },
  ];

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>Качество на услугата</FieldLabel>
        <span className="text-xs font-bold text-slate-400">
          Изберете една оценка
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onChange((current) =>
                  current === option.value ? "" : option.value
                )
              }
              aria-pressed={selected}
              aria-label={option.label}
              className={`flex h-12 items-center justify-center gap-2 rounded-xl border bg-white px-2 text-slate-500 transition ${
                selected
                  ? option.selectedClasses
                  : `border-slate-200 ${option.hoverClasses}`
              }`}
            >
              {selected ? <CheckSquare2 size={17} /> : <Square size={17} />}
              <span className="text-[11px] font-black uppercase tracking-wide">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EquipmentSection({
  equipment,
  selectedEquipmentIds,
  setSelectedEquipmentIds,
  protocolType,
}: {
  equipment: Equipment[];
  selectedEquipmentIds: string[];
  setSelectedEquipmentIds: Dispatch<SetStateAction<string[]>>;
  protocolType: ProtocolType | "";
}) {
  const visibleEquipment =
    protocolType === "Пожарогасители"
      ? equipment.filter((item) => item.category === "extinguisher")
      : equipment;
  const visibleEquipmentIds = visibleEquipment.map((item) => item.id);
  const allVisibleSelected =
    visibleEquipmentIds.length > 0 &&
    visibleEquipmentIds.every((id) => selectedEquipmentIds.includes(id));

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">Оборудване в обекта</h2>
          <p className="mt-1 text-sm text-slate-500">
            Изберете активите, които да бъдат включени в протокола.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {visibleEquipmentIds.length > 1 ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setSelectedEquipmentIds((current) =>
                    Array.from(new Set([...current, ...visibleEquipmentIds]))
                  )
                }
                disabled={allVisibleSelected}
              >
                {"\u0418\u0437\u0431\u0435\u0440\u0438 \u0432\u0441\u0438\u0447\u043a\u0438"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSelectedEquipmentIds((current) =>
                    current.filter((id) => !visibleEquipmentIds.includes(id))
                  )
                }
                disabled={!selectedEquipmentIds.some((id) =>
                  visibleEquipmentIds.includes(id)
                )}
              >
                {"\u0418\u0437\u0447\u0438\u0441\u0442\u0438"}
              </Button>
            </>
          ) : null}
          <Badge variant="orange">
            {visibleEquipment.length} {"\u043f\u043e\u0437\u0438\u0446\u0438\u0438"}
          </Badge>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {protocolType === "Пожарогасители" ? (
          <SelectField
            label="Пожарогасител от оборудването"
            value=""
            onChange={(value) => {
              if (!value) return;
              setSelectedEquipmentIds((current) =>
                current.includes(value) ? current : [...current, value]
              );
            }}
          >
            <option value="">Избери пожарогасител</option>
            {visibleEquipment
              .filter((item) => !selectedEquipmentIds.includes(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {extinguisherLabel(item)}
                </option>
              ))}
          </SelectField>
        ) : null}
        {visibleEquipment.map((item) => {
          const selected = selectedEquipmentIds.includes(item.id);

          return (
            <label
              key={item.id}
              className={`block cursor-pointer rounded-2xl border p-4 transition ${
                selected
                  ? "border-orange-200 bg-orange-50"
                  : "border-slate-100 bg-slate-50 hover:border-orange-200"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-black text-slate-800">{item.name}</div>
                  <div className="mt-1 font-mono text-sm font-bold text-slate-500">
                    {protocolType === "Пожарогасители"
                      ? extinguisherLabel(item)
                      : item.serial}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        setSelectedEquipmentIds((current) =>
                          selected
                            ? current.filter((id) => id !== item.id)
                            : [...current, item.id]
                        )
                      }
                      className="h-5 w-5 accent-orange-500"
                    />
                    Включи в протокола
                  </span>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

function ExtinguisherProtocolSection({
  clientOrganization,
  setClientOrganization,
  objectName,
  setObjectName,
  address,
  setAddress,
  region,
  setRegion,
  phone,
  setPhone,
  clientRepresentative,
  setClientRepresentative,
  setTechnician,
  protocolDate,
  setProtocolDate,
  rows,
  setRows,
  dropdowns,
  technician,
  protocolNumber,
  objectId,
  companySettings,
  equipment,
  selectedEquipmentIds,
  setSelectedEquipmentIds,
}: {
  clientOrganization: string;
  setClientOrganization: Dispatch<SetStateAction<string>>;
  objectName: string;
  setObjectName: Dispatch<SetStateAction<string>>;
  address: string;
  setAddress: Dispatch<SetStateAction<string>>;
  region: string;
  setRegion: Dispatch<SetStateAction<string>>;
  phone: string;
  setPhone: Dispatch<SetStateAction<string>>;
  clientRepresentative: string;
  setClientRepresentative: Dispatch<SetStateAction<string>>;
  protocolDate: string;
  setProtocolDate: Dispatch<SetStateAction<string>>;
  rows: ExtinguisherProtocolRow[];
  setRows: Dispatch<SetStateAction<ExtinguisherProtocolRow[]>>;
  dropdowns: ExtinguisherDropdowns;
  technician: string;
  setTechnician: Dispatch<SetStateAction<string>>;
  protocolNumber: string;
  objectId: string;
  companySettings: CompanySettings;
  equipment: Equipment[];
  selectedEquipmentIds: string[];
  setSelectedEquipmentIds: Dispatch<SetStateAction<string[]>>;
}) {
  const [generatingStickerRowId, setGeneratingStickerRowId] = useState("");
  const [stickerError, setStickerError] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [bulkServiceType, setBulkServiceType] = useState(
    dropdowns.extinguisherServiceTypes[0] || ""
  );
  const [bulkResultStatus, setBulkResultStatus] = useState(
    extinguisherResultStatusOptions[0] || ""
  );
  const [bulkAppliedAction, setBulkAppliedAction] = useState<
    "serviceType" | "resultStatus" | ""
  >("");
  const availableExtinguishers = equipment.filter(
    (item) =>
      item.category === "extinguisher" && !selectedEquipmentIds.includes(item.id)
  );
  const selectedRowIdSet = useMemo(
    () => new Set(selectedRowIds),
    [selectedRowIds]
  );
  const selectedRows = rows.filter((row) => selectedRowIdSet.has(row.id));
  const selectedRowsNeedingStickers = selectedRows.filter(
    (row) => row.equipmentId && !row.stickerNumber
  );
  const rowsWithStickers = rows.filter((row) => row.stickerNumber);
  const selectableRowsCount = rows.length;
  const allRowsSelected =
    selectableRowsCount > 0 && selectedRows.length === selectableRowsCount;

  useEffect(() => {
    setSelectedRowIds((current) =>
      current.filter((rowId) => rows.some((row) => row.id === rowId))
    );
  }, [rows]);

  useEffect(() => {
    if (!bulkAppliedAction) return;

    const timer = window.setTimeout(() => setBulkAppliedAction(""), 1400);
    return () => window.clearTimeout(timer);
  }, [bulkAppliedAction]);

  function selectAllExtinguishers() {
    const extinguisherIds = equipment
      .filter((item) => item.category === "extinguisher")
      .map((item) => item.id);

    setSelectedEquipmentIds((current) =>
      Array.from(new Set([...current, ...extinguisherIds]))
    );
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]
    );
  }

  function toggleAllRowsSelection() {
    setSelectedRowIds(allRowsSelected ? [] : rows.map((row) => row.id));
  }

  function rowWithBulkValue(
    row: ExtinguisherProtocolRow,
    key: "serviceType" | "resultStatus",
    value: string
  ) {
    const previousAutoNextServiceDate = nextServiceDateForTechnicalService(
      row.serviceType,
      row.serviceDate
    );
    const nextRow = { ...row, [key]: value };

    if (key === "serviceType") {
      const nextAutoServiceDate = nextServiceDateForTechnicalService(
        nextRow.serviceType,
        nextRow.serviceDate
      );

      if (nextAutoServiceDate) {
        if (
          !row.nextServiceDate ||
          row.nextServiceDate === previousAutoNextServiceDate
        ) {
          nextRow.nextServiceDate = nextAutoServiceDate;
        }
      } else if (
        row.nextServiceDate &&
        row.nextServiceDate === previousAutoNextServiceDate
      ) {
        nextRow.nextServiceDate = "";
      }
    }

    return nextRow;
  }

  function applyBulkValue(
    key: "serviceType" | "resultStatus",
    value: string
  ) {
    if (!selectedRowIds.length || !value) return;

    setRows((current) =>
      current.map((row) =>
        selectedRowIdSet.has(row.id) ? rowWithBulkValue(row, key, value) : row
      )
    );
    setBulkAppliedAction(key);
  }

  function removeProtocolRow(row: ExtinguisherProtocolRow) {
    setSelectedRowIds((current) => current.filter((rowId) => rowId !== row.id));

    if (row.equipmentId) {
      setSelectedEquipmentIds((current) =>
        current.filter((equipmentId) => equipmentId !== row.equipmentId)
      );
      return;
    }

    setRows((current) =>
      current
        .filter((item) => item.id !== row.id)
        .map((item, index) => ({ ...item, rowNumber: String(index + 1) }))
    );
  }

  function updateRow(
    rowId: string,
    key: keyof ExtinguisherProtocolRow,
    value: string
  ) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row;

        const previousAutoNextServiceDate = nextServiceDateForTechnicalService(
          row.serviceType,
          row.serviceDate
        );
        const nextRow = { ...row, [key]: value };

        if (key === "serviceType" || key === "serviceDate") {
          const nextAutoServiceDate = nextServiceDateForTechnicalService(
            nextRow.serviceType,
            nextRow.serviceDate
          );

          if (nextAutoServiceDate) {
            if (
              !row.nextServiceDate ||
              row.nextServiceDate === previousAutoNextServiceDate
            ) {
              nextRow.nextServiceDate = nextAutoServiceDate;
            }
          } else if (
            row.nextServiceDate &&
            row.nextServiceDate === previousAutoNextServiceDate
          ) {
            nextRow.nextServiceDate = "";
          }
        }

        return nextRow;
      })
    );
  }

  function printSticker(stickerNumber: string) {
    window.open(
      `/stickers/fire-extinguishers/${encodeURIComponent(stickerNumber)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openStickerPrintQueue(stickerNumbers: string[]) {
    const uniqueStickerNumbers = Array.from(
      new Set(stickerNumbers.map((number) => number.trim()).filter(Boolean))
    );
    if (!uniqueStickerNumbers.length) return;

    try {
      window.localStorage.setItem(
        STICKER_PRINT_QUEUE_STORAGE_KEY,
        JSON.stringify({
          createdAt: new Date().toISOString(),
          protocolNumber,
          stickers: uniqueStickerNumbers,
          status: "queued",
        })
      );
    } catch {
      // The URL still carries the queue for the print handoff page.
    }

    window.open(
      `/stickers/fire-extinguishers/queue?ids=${encodeURIComponent(
        uniqueStickerNumbers.join(",")
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function handlePrintSticker(row: ExtinguisherProtocolRow) {
    if (!row.stickerNumber) return;

    setStickerError("");

    try {
      const protocolId = protocolNumber ? await getProtocolDatabaseId(protocolNumber) : "";
      await saveFireExtinguisherStickerRow({
        row,
        stickerNumber: row.stickerNumber,
        protocolNumber,
        protocolId,
        objectId,
        objectName,
        companySettings,
      });
      printSticker(row.stickerNumber);
    } catch (error) {
      setStickerError(stickerDatabaseErrorMessage(error));
    }
  }

  async function handlePrintAllStickers() {
    const printableRows = rows.filter((row) => row.stickerNumber);
    if (!printableRows.length) return;

    setStickerError("");

    try {
      const protocolId = protocolNumber ? await getProtocolDatabaseId(protocolNumber) : "";

      for (const row of printableRows) {
        await saveFireExtinguisherStickerRow({
          row,
          stickerNumber: row.stickerNumber,
          protocolNumber,
          protocolId,
          objectId,
          objectName,
          companySettings,
        });
      }

      openStickerPrintQueue(printableRows.map((row) => row.stickerNumber));
    } catch (error) {
      setStickerError(stickerDatabaseErrorMessage(error));
    }
  }

  async function createStickerForRow(
    row: ExtinguisherProtocolRow,
    protocolId: string
  ) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc(
      "claim_fire_extinguisher_sticker_number"
    );

    if (error || data === null) {
      throw new Error(error?.message || "Sticker number was not returned.");
    }

    const stickerNumber = String(data);
    const nextRow = {
      ...row,
      serviceDate: row.serviceDate || protocolDate,
      nextServiceDate:
        row.nextServiceDate ||
        nextServiceDateForTechnicalService(
          row.serviceType,
          row.serviceDate || protocolDate
        ),
      servicePersonName: row.servicePersonName || technician,
      stickerNumber,
    };

    await saveFireExtinguisherStickerRow({
      row: nextRow,
      stickerNumber,
      protocolNumber,
      protocolId,
      objectId,
      objectName,
      companySettings,
    });

    return nextRow;
  }

  async function generateSticker(row: ExtinguisherProtocolRow) {
    if (row.stickerNumber) {
      printSticker(row.stickerNumber);
      return;
    }

    setStickerError("");
    setGeneratingStickerRowId(row.id);

    try {
      const protocolId = protocolNumber ? await getProtocolDatabaseId(protocolNumber) : "";
      const nextRow = await createStickerForRow(row, protocolId);

      setRows((current) =>
        current.map((item) => (item.id === row.id ? nextRow : item))
      );
    } catch (error) {
      setStickerError(stickerDatabaseErrorMessage(error));
    } finally {
      setGeneratingStickerRowId("");
    }
  }

  async function generateStickersForSelectedRows() {
    const rowsToGenerate = selectedRows.filter(
      (row) => row.equipmentId && !row.stickerNumber
    );

    if (!rowsToGenerate.length) return;

    setStickerError("");
    setGeneratingStickerRowId("bulk");

    try {
      const protocolId = protocolNumber ? await getProtocolDatabaseId(protocolNumber) : "";
      const updatedRows = new Map<string, ExtinguisherProtocolRow>();

      for (const row of rowsToGenerate) {
        const nextRow = await createStickerForRow(row, protocolId);
        updatedRows.set(row.id, nextRow);
      }

      setRows((current) =>
        current.map((row) => updatedRows.get(row.id) ?? row)
      );
    } catch (error) {
      setStickerError(stickerDatabaseErrorMessage(error));
    } finally {
      setGeneratingStickerRowId("");
    }
  }

  function addExtinguisher() {
    setRows((current) => [
      ...current,
      {
        id: `ext-${Date.now()}`,
        equipmentId: "",
        rowNumber: String(current.length + 1),
        brand: "",
        model: "",
        serialNumber: "",
        location: "",
        identificationMarking: "",
        category: "",
        chargeMassKg: "",
        extinguishingAgentType: "",
        extinguishingAgentTradeName: "",
        resultStatus: "",
        problemNote: "",
        serviceType: "техническо обслужване",
        serviceDate: protocolDate,
        nextServiceDate: nextServiceDateForTechnicalService(
          "техническо обслужване",
          protocolDate
        ),
        servicePersonName: technician,
        servicePersonSignatureDataUrl: "",
        stickerNumber: "",
      },
    ]);
  }

  function markAllServiced() {
    setRows((current) =>
      current.map((row, index) => ({
        ...row,
        rowNumber: String(index + 1),
        serviceType: "техническо обслужване",
        serviceDate: protocolDate,
        nextServiceDate:
          row.nextServiceDate ||
          nextServiceDateForTechnicalService(
            "техническо обслужване",
            protocolDate
          ),
        servicePersonName: technician,
      }))
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black">
            Протокол за пожарогасители
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Структурирани данни за официалния протокол за предаване и приемане
            на пожарогасители.
          </p>
        </div>
        <div className="hidden">
          <Button type="button" variant="secondary" onClick={markAllServiced}>
            Маркирай всички като обслужени
          </Button>
          {false ? <Button type="button" onClick={addExtinguisher}>
            Добави пожарогасител
          </Button> : null}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">
                  Добавяне от оборудване
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  Изберете един пожарогасител или добавете всички от обекта.
                </div>
              </div>
              <Badge variant="orange">{rows.length} в протокола</Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto]">
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  setSelectedEquipmentIds((current) =>
                    current.includes(value) ? current : [...current, value]
                  );
                }}
                className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
              >
                <option value="">
                  {equipment.length
                    ? "Избери пожарогасител"
                    : "Няма пожарогасители в оборудването"}
                </option>
                {availableExtinguishers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {extinguisherLabel(item)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={selectAllExtinguishers}
                disabled={availableExtinguishers.length === 0}
              >
                <CheckCheck size={17} />
                Добави всички
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedEquipmentIds([])}
                disabled={selectedEquipmentIds.length === 0}
              >
                <X size={17} />
                Изчисти
              </Button>
            </div>
          </div>
        </div>
      </div>

      {rows.length ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">
                  Масови действия за маркираните
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  Маркирайте редове от списъка и приложете еднакви стойности.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllRowsSelection}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:bg-orange-50 hover:text-orange-700"
                >
                  {allRowsSelected ? (
                    <CheckSquare2 size={16} className="text-orange-600" />
                  ) : (
                    <Square size={16} className="text-slate-400" />
                  )}
                  {allRowsSelected ? "Размаркирай всички" : "Маркирай всички"}
                </button>
                <Badge variant="orange">
                  {selectedRows.length} / {rows.length} маркирани
                </Badge>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1 space-y-2">
              <FieldLabel>Вид обслужване</FieldLabel>
              <div className="flex gap-2">
                <select
                  value={bulkServiceType}
                  onChange={(event) => setBulkServiceType(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  {dropdowns.extinguisherServiceTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyBulkValue("serviceType", bulkServiceType)}
                  disabled={!selectedRows.length || !bulkServiceType}
                  className={
                    bulkAppliedAction === "serviceType"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                      : ""
                  }
                >
                  Задай
                </Button>
              </div>
            </div>

            <div className="min-w-[280px] flex-1 space-y-2">
              <FieldLabel>Състояние</FieldLabel>
              <div className="flex gap-2">
                <select
                  value={bulkResultStatus}
                  onChange={(event) => setBulkResultStatus(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  {extinguisherResultStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyBulkValue("resultStatus", bulkResultStatus)}
                  disabled={!selectedRows.length || !bulkResultStatus}
                  className={
                    bulkAppliedAction === "resultStatus"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                      : ""
                  }
                >
                  Задай
                </Button>
              </div>
            </div>

            <div className="min-w-[220px] space-y-2">
              <FieldLabel>Стикери</FieldLabel>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={generateStickersForSelectedRows}
                disabled={
                  !selectedRowsNeedingStickers.length ||
                  Boolean(generatingStickerRowId)
                }
              >
                {generatingStickerRowId === "bulk" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Tags size={16} />
                )}
                Генерирай ({selectedRowsNeedingStickers.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handlePrintAllStickers}
                disabled={!rowsWithStickers.length}
              >
                <Printer size={16} />
                Принтирай всички ({rowsWithStickers.length})
              </Button>
              <div className="text-xs font-bold text-slate-500">
                Само за маркирани без стикер.
              </div>
            </div>
          </div>
          {bulkAppliedAction ? (
            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              Зададено за {selectedRows.length} маркирани пожарогасителя.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="hidden">
        <Button
          type="button"
          variant="outline"
          onClick={selectAllExtinguishers}
          disabled={availableExtinguishers.length === 0}
        >
          {"\u0414\u043e\u0431\u0430\u0432\u0438 \u0432\u0441\u0438\u0447\u043a\u0438 \u043f\u043e\u0436\u0430\u0440\u043e\u0433\u0430\u0441\u0438\u0442\u0435\u043b\u0438"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSelectedEquipmentIds([])}
          disabled={selectedEquipmentIds.length === 0}
        >
          {"\u0418\u0437\u0447\u0438\u0441\u0442\u0438 \u0438\u0437\u0431\u043e\u0440\u0430"}
        </Button>
        <Badge variant="orange">
          {rows.length} {"\u0438\u0437\u0431\u0440\u0430\u043d\u0438"}
        </Badge>
      </div>

      {rows.length ? (
        <div className="hidden">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <button
                type="button"
                onClick={toggleAllRowsSelection}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                {allRowsSelected ? (
                  <CheckSquare2 size={18} className="text-orange-600" />
                ) : (
                  <Square size={18} className="text-slate-400" />
                )}
                {allRowsSelected ? "Размаркирай всички" : "Маркирай всички"}
              </button>
              <div className="mt-2 text-xs font-bold text-slate-500">
                Маркирани {selectedRows.length} от {rows.length} пожарогасителя
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:max-w-3xl">
              <div className="space-y-2">
                <FieldLabel>Вид обслужване за маркираните</FieldLabel>
                <div className="flex gap-2">
                  <select
                    value={bulkServiceType}
                    onChange={(event) => setBulkServiceType(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    {dropdowns.extinguisherServiceTypes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyBulkValue("serviceType", bulkServiceType)}
                    disabled={!selectedRows.length || !bulkServiceType}
                  >
                    Приложи
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel>Състояние за маркираните</FieldLabel>
                <div className="flex gap-2">
                  <select
                    value={bulkResultStatus}
                    onChange={(event) => setBulkResultStatus(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm transition focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    {extinguisherResultStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => applyBulkValue("resultStatus", bulkResultStatus)}
                    disabled={!selectedRows.length || !bulkResultStatus}
                  >
                    Приложи
                  </Button>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={generateStickersForSelectedRows}
              disabled={
                !selectedRowsNeedingStickers.length ||
                Boolean(generatingStickerRowId)
              }
            >
              {generatingStickerRowId === "bulk" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Tags size={16} />
              )}
              Генерирай стикери ({selectedRowsNeedingStickers.length})
            </Button>
          </div>
        </div>
      ) : null}
      {stickerError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {stickerError}
        </div>
      ) : null}

      <div className="hidden">
        <SelectField
          label="Пожарогасител от оборудването"
          value=""
          onChange={(value) => {
            if (!value) return;
            setSelectedEquipmentIds((current) =>
              current.includes(value) ? current : [...current, value]
            );
          }}
        >
          <option value="">
            {equipment.length
              ? "Избери пожарогасител"
              : "Няма пожарогасители в оборудването"}
          </option>
          {availableExtinguishers.map((item) => (
            <option key={item.id} value={item.id}>
              {extinguisherLabel(item)}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="hidden">
        <TextInputField
          label="Дата"
          type="date"
          value={protocolDate}
          onChange={setProtocolDate}
        />
        <TextInputField
          label="Клиент / организация"
          value={clientOrganization}
          onChange={setClientOrganization}
        />
        <TextInputField label="Обект" value={objectName} onChange={setObjectName} />
        <TextInputField label="Адрес" value={address} onChange={setAddress} />
        <TextInputField label="Област" value={region} onChange={setRegion} />
        <TextInputField label="Телефон" value={phone} onChange={setPhone} />
        <TextInputField
          label="Представител на клиента"
          value={clientRepresentative}
          onChange={setClientRepresentative}
        />
        <TextInputField
          label="Техник / обслужващо лице"
          value={technician}
          onChange={setTechnician}
        />
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleRowSelection(row.id)}
                aria-pressed={selectedRowIdSet.has(row.id)}
                aria-label={`Маркирай пожарогасител ${row.rowNumber}`}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition ${
                  selectedRowIdSet.has(row.id)
                    ? "border-orange-300 bg-orange-50 text-orange-700 ring-4 ring-orange-100"
                    : "border-slate-200 bg-white text-slate-400 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                }`}
              >
                {selectedRowIdSet.has(row.id) ? (
                  <CheckSquare2 size={18} />
                ) : (
                  <Square size={18} />
                )}
              </button>
              <div className="text-sm font-black text-slate-800">
                Пожарогасител № {row.rowNumber}
              </div>
              </div>
              <button
                type="button"
                onClick={() => removeProtocolRow(row)}
                aria-label={`Премахни пожарогасител ${row.rowNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                <Tags size={16} className="text-red-600" />
                {row.stickerNumber ? (
                  <span>{"\u0421\u0442\u0438\u043a\u0435\u0440 \u2116"}{row.stickerNumber}</span>
                ) : (
                  <span>{"\u0421\u0442\u0438\u043a\u0435\u0440: \u043d\u044f\u043c\u0430"}</span>
                )}
              </div>
              {row.stickerNumber ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                    onClick={() => handlePrintSticker(row)}
                >
                  <Printer size={15} />
                  {"\u041f\u0440\u0438\u043d\u0442\u0438\u0440\u0430\u0439 \u0441\u0442\u0438\u043a\u0435\u0440"}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => generateSticker(row)}
                  disabled={generatingStickerRowId === row.id || !row.equipmentId}
                >
                  {generatingStickerRowId === row.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Tags size={15} />
                  )}
                  {"\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0430\u0439 \u0441\u0442\u0438\u043a\u0435\u0440"}
                </Button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <TextInputField
                label="№ по ред"
                value={row.rowNumber}
                onChange={(value) => updateRow(row.id, "rowNumber", value)}
              />
              <div className="lg:col-span-3">
                <TextInputField
                  label="Идентификационна маркировка"
                  value={row.identificationMarking}
                  readOnly
                  onChange={(value) =>
                    updateRow(row.id, "identificationMarking", value)
                  }
                />
              </div>
              <TextInputField
                label="Сериен номер"
                value={row.serialNumber || ""}
                readOnly
                onChange={(value) => updateRow(row.id, "serialNumber", value)}
              />
              <SelectField
                label="Марка"
                value={row.brand}
                disabled
                onChange={(value) => updateRow(row.id, "brand", value)}
              >
                <option value="">Избери марка</option>
                {dropdowns.extinguisherBrands.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Модел"
                value={row.model}
                disabled
                onChange={(value) => updateRow(row.id, "model", value)}
              >
                <option value="">Избери модел</option>
                {dropdowns.extinguisherModels.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Категория"
                value={row.category}
                disabled
                onChange={(value) => updateRow(row.id, "category", value)}
              >
                <option value="">Избери категория</option>
                {dropdowns.extinguisherCategories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Маса на зареждането, kg"
                value={row.chargeMassKg}
                disabled
                onChange={(value) => updateRow(row.id, "chargeMassKg", value)}
              >
                <option value="">Избери маса</option>
                {dropdowns.extinguisherChargeMasses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Вид пожарогасително вещество"
                value={row.extinguishingAgentType}
                disabled
                onChange={(value) =>
                  updateRow(row.id, "extinguishingAgentType", value)
                }
              >
                <option value="">Избери вещество</option>
                {dropdowns.extinguishingAgentTypes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Търговско наименование"
                value={row.extinguishingAgentTradeName}
                disabled
                onChange={(value) =>
                  updateRow(row.id, "extinguishingAgentTradeName", value)
                }
              >
                <option value="">Избери наименование</option>
                {dropdowns.extinguishingAgentTradeNames.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Вид обслужване"
                value={row.serviceType}
                onChange={(value) => updateRow(row.id, "serviceType", value)}
              >
                {dropdowns.extinguisherServiceTypes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <TextInputField
                label="Дата на обслужване"
                type="date"
                value={row.serviceDate}
                onChange={(value) => updateRow(row.id, "serviceDate", value)}
              />
              <TextInputField
                label="Дата на следващо обслужване"
                type="date"
                value={row.nextServiceDate || ""}
                onChange={(value) => updateRow(row.id, "nextServiceDate", value)}
              />
              <SelectField
                label="Резултат / състояние"
                value={row.resultStatus || ""}
                onChange={(value) => updateRow(row.id, "resultStatus", value)}
              >
                <option value="">Избери резултат</option>
                {extinguisherResultStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectField>
              <TextInputField
                label="Име на обслужващото лице"
                value={row.servicePersonName}
                onChange={(value) =>
                  updateRow(row.id, "servicePersonName", value)
                }
              />
              {extinguisherResultNeedsAttention(row.resultStatus || "") ? (
                <div className="space-y-2 lg:col-span-4">
                  <FieldLabel>Бележка при проблем</FieldLabel>
                  <textarea
                    value={row.problemNote || ""}
                    onChange={(event) =>
                      updateRow(row.id, "problemNote", event.target.value)
                    }
                    className="min-h-20 w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TextAreaSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Добавете описание..."
        className="mt-4 min-h-32 w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
      />
    </Card>
  );
}

function PhotosSection({
  photos,
  setPhotos,
  photoDescription,
  setPhotoDescription,
}: {
  photos: ProtocolPhoto[];
  setPhotos: Dispatch<SetStateAction<ProtocolPhoto[]>>;
  photoDescription: string;
  setPhotoDescription: Dispatch<SetStateAction<string>>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) return;

      try {
        const compressed = await compressImageFile(file);
        setPhotos((current) => [
          ...current,
          {
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${current.length}`,
            name: compressed.file.name,
            dataUrl: compressed.dataUrl,
            file: compressed.file,
            description: photoDescription.trim(),
            originalSize: compressed.originalSize,
            compressedSize: compressed.compressedSize,
          },
        ]);
      } catch {
        const dataUrl = await blobToDataUrl(file);
        setPhotos((current) => [
          ...current,
          {
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${current.length}`,
            name: file.name,
            dataUrl,
            file,
            description: photoDescription.trim(),
            originalSize: file.size,
            compressedSize: file.size,
          },
        ]);
      }
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-black">Снимки</h2>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(event.dataTransfer.files);
        }}
        className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
          <ImagePlus size={24} />
        </div>
        <div className="mt-3 text-sm font-black text-slate-800">
          Добавете снимки към протокола
        </div>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Плъзнете файлове тук или изберете снимки от устройството.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={17} />
            Избери снимки
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera size={17} />
            Снимай
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <FieldLabel>Описание на снимките</FieldLabel>
        <Input
          value={photoDescription}
          onChange={(event) => setPhotoDescription(event.target.value)}
          placeholder="Спринклерна система, дефектен датчик..."
          className="w-full"
        />
      </div>
      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.dataUrl}
                alt={photo.name}
                className="aspect-[4/3] w-full object-contain bg-slate-50"
              />
              <button
                type="button"
                onClick={() =>
                  setPhotos((current) =>
                    current.filter((item) => item.id !== photo.id)
                  )
                }
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-red-700"
                aria-label="Премахни снимка"
              >
                <X size={16} />
              </button>
              <div className="truncate px-3 py-2 text-xs font-bold text-slate-500">
                {photo.name}
              </div>
              {photo.originalSize && photo.compressedSize ? (
                <div className="px-3 pb-2 text-[11px] font-bold text-slate-400">
                  {Math.round(photo.compressedSize / 1024)} KB
                  {photo.compressedSize < photo.originalSize
                    ? ` от ${Math.round(photo.originalSize / 1024)} KB`
                    : ""}
                </div>
              ) : null}
              {photo.description ? (
                <div className="px-3 pb-2 text-xs font-medium text-slate-500">
                  {photo.description}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SignaturesSection({
  technicianSignatureDataUrl,
  setTechnicianSignatureDataUrl,
  clientSignatureDataUrl,
  setClientSignatureDataUrl,
}: {
  technicianSignatureDataUrl: string;
  setTechnicianSignatureDataUrl: Dispatch<SetStateAction<string>>;
  clientSignatureDataUrl: string;
  setClientSignatureDataUrl: Dispatch<SetStateAction<string>>;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-black">Подписи</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SignatureCapture
          title="Подпис на техник"
          value={technicianSignatureDataUrl}
          onChange={setTechnicianSignatureDataUrl}
        />
        <SignatureCapture
          title="Подпис на клиент"
          value={clientSignatureDataUrl}
          onChange={setClientSignatureDataUrl}
        />
      </div>
    </Card>
  );
}

export function ProtocolForm({
  draftNumber,
  qrObject,
  initialObjectCode,
}: ProtocolFormProps) {
  const router = useRouter();
  const draftHydratedRef = useRef(false);
  const preserveDraftExtinguisherRowsRef = useRef(false);
  const preserveDraftSelectedEquipmentIdsRef = useRef(false);
  const [saveState, setSaveState] = useState<
    | { status: "idle" }
    | { status: "saving"; mode: "draft" | "complete" }
    | { status: "draft-saved"; number: string; savedAt: number }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [protocolType, setProtocolType] =
    useState<ProtocolType | "">("");
  const [objectOptionsFromDb, setObjectOptionsFromDb] = useState<ObjectOption[]>(
    []
  );
  const [formLoadState, setFormLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [selectedObjectCode, setSelectedObjectCode] = useState(
    initialObjectCode ?? qrObject?.code ?? ""
  );
  const [technicianOptions, setTechnicianOptions] = useState<string[]>([]);
  const [technicianSignatures, setTechnicianSignatures] = useState<Record<string, string>>({});
  const [companySettings, setCompanySettings] = useState(defaultCompanySettings);
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [extinguisherDropdowns, setExtinguisherDropdowns] =
    useState<ExtinguisherDropdowns>({
      extinguisherBrands: defaultProtocolSettings.extinguisherBrands,
      extinguisherModels: defaultProtocolSettings.extinguisherModels,
      extinguisherCategories: defaultProtocolSettings.extinguisherCategories,
      extinguisherChargeMasses:
        defaultProtocolSettings.extinguisherChargeMasses,
      extinguishingAgentTypes: defaultProtocolSettings.extinguishingAgentTypes,
      extinguishingAgentTradeNames:
        defaultProtocolSettings.extinguishingAgentTradeNames,
      extinguisherServiceTypes:
        defaultProtocolSettings.extinguisherServiceTypes,
      serviceSystemStatuses: defaultProtocolSettings.serviceSystemStatuses,
    });
  const [protocolNumber, setProtocolNumber] = useState("");
  const [protocolNumberPreview, setProtocolNumberPreview] = useState("");
  const [serviceCenterOptions, setServiceCenterOptions] = useState<ServiceCenterOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [protocolDate, setProtocolDate] = useState(todayInputValue);
  const [clientOrganization, setClientOrganization] = useState("");
  const [extinguisherObjectName, setExtinguisherObjectName] = useState("");
  const [extinguisherAddress, setExtinguisherAddress] = useState("");
  const [extinguisherRegion, setExtinguisherRegion] = useState("");
  const [extinguisherPhone, setExtinguisherPhone] = useState("");
  const [extinguisherRows, setExtinguisherRows] =
    useState<ExtinguisherProtocolRow[]>([]);
  const [contractReference, setContractReference] = useState("");
  const [clientRepresentative, setClientRepresentative] = useState("");
  const [subscriptionChecks, setSubscriptionChecks] = useState<
    Record<string, SubscriptionCheckValue>
  >(emptySubscriptionChecks);
  const [subscriptionCheckNotes, setSubscriptionCheckNotes] = useState<
    Record<string, string>
  >({});
  const [serviceQuality, setServiceQuality] =
    useState<ServiceQualityValue>("happy");
  const [photos, setPhotos] = useState<ProtocolPhoto[]>([]);
  const [photoDescription, setPhotoDescription] = useState("");
  const [technicianSignatureDataUrl, setTechnicianSignatureDataUrl] =
    useState("");
  const [clientSignatureDataUrl, setClientSignatureDataUrl] = useState("");
  const printPreviewId = useId().replace(/:/g, "");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");
  const [serviceDefects, setServiceDefects] = useState("");
  const [serviceDeviations, setServiceDeviations] = useState("");
  const [serviceSystemStatus, setServiceSystemStatus] = useState("Изрядна");
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [objectEquipment, setObjectEquipment] = useState<Equipment[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>(
    []
  );
  const activeChecklist = protocolType ? checklistByType[protocolType] : [];
  const [checks, setChecks] = useState<Record<string, CheckValue>>({});

  useEffect(() => {
    const savedSignature = technicianSignatures[selectedTechnician];
    if (savedSignature) {
      setTechnicianSignatureDataUrl(savedSignature);
    }
  }, [selectedTechnician, technicianSignatures]);

  useEffect(() => {
    let mounted = true;

    async function refreshTechnicianSettings() {
      let activeTechnicians: string[] = [];
      let activeSignatures: Record<string, string> = {};
      try {
        activeTechnicians = await readActiveTechnicianNamesFromTeamMembers();
        const session = readTeamSession();
        if (session?.id) {
          const response = await fetch(`/api/team-profile?memberId=${encodeURIComponent(session.id)}`);
          if (response.ok) {
            const profile = await response.json();
            const member = isRecord(profile?.member) ? profile.member : {};
            const currentName = textValue(member, ["name"]) || session.name || "";
            const currentSignature = textValue(member, ["signature_url"]) || session.signature_url || "";
            if (currentName && currentSignature) {
              activeSignatures = { [currentName]: currentSignature };
            }
          }
        }
      } catch {
        activeTechnicians = [];
        activeSignatures = {};
      }

      if (!mounted) return;

      const protocolSettings = readProtocolSettings();
      setCompanySettings(readCompanySettings());
      const centers = readServiceCenters()
        .filter((center) => center.active && !center.archivedAt)
        .map((center) => ({
          id: center.id,
          name: center.name,
          code: resolveServiceCenterCode(center),
        }));
      setServiceCenterOptions(centers);
      setSelectedServiceId((current) => {
        if (current && centers.some((center) => center.id === current)) return current;
        return centers[0]?.id ?? "";
      });

      setTechnicianOptions(activeTechnicians);
      setTechnicianSignatures(activeSignatures);
      setSelectedTechnician((current) =>
        current && activeTechnicians.includes(current) ? current : ""
      );
      setExtinguisherDropdowns({
        extinguisherBrands:
          protocolSettings.extinguisherBrands.length > 0
            ? protocolSettings.extinguisherBrands
            : defaultProtocolSettings.extinguisherBrands,
        extinguisherModels:
          protocolSettings.extinguisherModels.length > 0
            ? protocolSettings.extinguisherModels
            : defaultProtocolSettings.extinguisherModels,
        extinguisherCategories:
          protocolSettings.extinguisherCategories.length > 0
            ? protocolSettings.extinguisherCategories
            : defaultProtocolSettings.extinguisherCategories,
        extinguisherChargeMasses:
          protocolSettings.extinguisherChargeMasses.length > 0
            ? protocolSettings.extinguisherChargeMasses
            : defaultProtocolSettings.extinguisherChargeMasses,
        extinguishingAgentTypes:
          protocolSettings.extinguishingAgentTypes.length > 0
            ? protocolSettings.extinguishingAgentTypes
            : defaultProtocolSettings.extinguishingAgentTypes,
        extinguishingAgentTradeNames:
          protocolSettings.extinguishingAgentTradeNames.length > 0
            ? protocolSettings.extinguishingAgentTradeNames
            : defaultProtocolSettings.extinguishingAgentTradeNames,
        extinguisherServiceTypes:
          protocolSettings.extinguisherServiceTypes.length > 0
            ? protocolSettings.extinguisherServiceTypes
            : defaultProtocolSettings.extinguisherServiceTypes,
        serviceSystemStatuses:
          protocolSettings.serviceSystemStatuses.length > 0
            ? protocolSettings.serviceSystemStatuses
            : defaultProtocolSettings.serviceSystemStatuses,
      });
      setSelectedTechnician((current) =>
        current && activeTechnicians.includes(current)
          ? current
          : ""
      );
    }

    void refreshTechnicianSettings();
    window.addEventListener(settingsUpdatedEvent, refreshTechnicianSettings);
    window.addEventListener("storage", refreshTechnicianSettings);

    return () => {
      mounted = false;
      window.removeEventListener(
        settingsUpdatedEvent,
        refreshTechnicianSettings
      );
      window.removeEventListener("storage", refreshTechnicianSettings);
    };
  }, []);

  const serviceCode =
    (serviceCenterOptions.find((center) => center.id === selectedServiceId)?.code ?? "A").toUpperCase();
  const selectedServiceName =
    serviceCenterOptions.find((center) => center.id === selectedServiceId)?.name ??
    "";
  const personnelFunctions = personnelFunctionsFromServiceCode(serviceCode);

  const selectedObjectDetails =
    objectOptionsFromDb.find((object) => object.code === selectedObjectCode) ??
    null;
  const selectedObjectName = selectedObjectDetails?.name ?? "";
  const printObjectName =
    protocolType === "Пожарогасители"
      ? extinguisherObjectName
      : selectedObjectName;
  const printAddress =
    protocolType === "Пожарогасители"
      ? extinguisherAddress
      : selectedObjectDetails?.address ?? "";
  const printClient =
    protocolType === "Пожарогасители"
      ? clientOrganization
      : selectedObjectDetails?.client ?? "";

  useEffect(() => {
    let isMounted = true;

    async function loadContractReferenceForObject() {
      if (!selectedObjectDetails) {
        setContractReference("");
        return;
      }

      const objectKeys = new Set(
        [
          selectedObjectDetails.locationId,
          selectedObjectDetails.code,
          selectedObjectDetails.name,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      );

      if (!objectKeys.size) {
        setContractReference("");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const [documentsResult, opportunitiesResult] = await Promise.all([
          supabase
            .from("saved_documents")
            .select("id, number, object, payload, updated_at")
            .eq("kind", "contract")
            .order("updated_at", { ascending: false }),
          supabase
            .from("sales_opportunities")
            .select("id, converted_object_id"),
        ]);

        if (!isMounted) return;
        if (documentsResult.error) throw new Error(documentsResult.error.message);

        const convertedContractIds = new Set(
          (((opportunitiesResult.data ?? []) as DataRecord[])
            .filter((row) =>
              objectKeys.has(String(row.converted_object_id || "").trim())
            )
            .map((row) => `contract-${String(row.id)}`))
        );

        const matchingContracts = ((documentsResult.data ?? []) as DataRecord[])
          .filter((row) =>
            savedContractMatchesObject(row, objectKeys, convertedContractIds)
          )
          .sort((a, b) => {
            const aPayload = isRecord(a.payload) ? a.payload : {};
            const bPayload = isRecord(b.payload) ? b.payload : {};
            const aAccepted = aPayload.status === "accepted" ? 1 : 0;
            const bAccepted = bPayload.status === "accepted" ? 1 : 0;
            return bAccepted - aAccepted;
          });

        setContractReference(
          contractNumberFromSavedDocument(matchingContracts[0] ?? {}) || ""
        );
      } catch {
        if (isMounted) setContractReference("");
      }
    }

    void loadContractReferenceForObject();

    return () => {
      isMounted = false;
    };
  }, [selectedObjectDetails]);

  useEffect(() => {
    let isMounted = true;

    async function loadProtocolNumberPreview() {
      if (!selectedServiceId || !protocolDate || protocolNumber.trim()) {
        setProtocolNumberPreview("");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("protocol_number_counter")
          .select("next_seq")
          .eq("id", 1)
          .single();

        if (!isMounted) return;

        const nextSeq =
          !error && data && typeof (data as DataRecord)["next_seq"] === "number"
            ? Number((data as DataRecord)["next_seq"])
            : 4001;
        setProtocolNumberPreview(
          formatProtocolNumberPreview(serviceCode, protocolDate, nextSeq)
        );
      } catch {
        if (isMounted) {
          setProtocolNumberPreview(
            formatProtocolNumberPreview(serviceCode, protocolDate, 4001)
          );
        }
      }
    }

    loadProtocolNumberPreview();

    return () => {
      isMounted = false;
    };
  }, [protocolDate, protocolNumber, selectedServiceId, serviceCode]);

  const goodRows = subscriptionChecklistRows
    .filter((row) => subscriptionChecks[row.number] === "добро")
    .map((row) => row.number);
  const badRows = subscriptionChecklistRows
    .filter((row) => subscriptionChecks[row.number] === "лошо")
    .map((row) => row.number);
  const selectedPersonnelFunctions = Object.entries(personnelFunctions)
    .filter(([, selected]) => selected)
    .map(([functionName]) => functionName);
  const printTemplateSlug = protocolType
    ? printTypeByProtocol[protocolType]
    : "subscription-service";
  const printPreviewParams = new URLSearchParams({
    object: selectedObjectDetails?.code ?? selectedObjectCode,
    objectName: printObjectName,
    address: printAddress,
    client: printClient,
    contact: clientRepresentative,
    clientRepresentative,
    technician: selectedTechnician,
    service: selectedServiceName || `Сервиз ${serviceCode}`,
    serviceCode,
    protocolNumber: protocolNumber || protocolNumberPreview,
    date: protocolDate,
    previewId: printPreviewId,
    technicianSignature: selectedTechnician,
    clientSignature: clientRepresentative,
    companyName: companySettings.companyName,
    companyBulstat: companySettings.bulstat,
    companyAddress: companySettings.address,
    companyPhone: companySettings.phone,
    companyEmail: companySettings.email,
  });

  if (printTemplateSlug === "subscription-service") {
    printPreviewParams.set("contractReference", contractReference);
    printPreviewParams.set(
      "personnelFunctions",
      selectedPersonnelFunctions.join(",")
    );
    printPreviewParams.set("goodRows", goodRows.join(","));
    printPreviewParams.set("badRows", badRows.join(","));
    printPreviewParams.set("serviceQuality", serviceQuality);
    printPreviewParams.set("notes", subscriptionNotes);
    badRows.forEach((rowNumber) => {
      const rowNote = subscriptionCheckNotes[rowNumber]?.trim();
      if (rowNote) {
        printPreviewParams.set(`rowNote_${rowNumber}`, rowNote);
      }
    });
  }

  if (printTemplateSlug === "extinguisher-handover") {
    printPreviewParams.set("region", extinguisherRegion);
    printPreviewParams.set("phone", extinguisherPhone);
  }

  const printPreviewHref = `/protocols/print/${printTemplateSlug}?${printPreviewParams.toString()}`;
  const handlePreparePrintPreview = () => {
    try {
      const previewKey = `firecontrol:protocol-preview:${printPreviewId}`;
      const payload = JSON.stringify({
        technicianSignatureDataUrl,
        clientSignatureDataUrl,
        extinguisherRows,
        photos,
        savedAt: Date.now(),
      });

      // localStorage is shared across tabs (sessionStorage is not when the
      // print preview opens via target="_blank" + rel="noreferrer"), so the
      // signatures captured here actually reach the print document.
      try {
        localStorage.setItem(previewKey, payload);

        // Best-effort cleanup of stale preview payloads (>24h) so we don't
        // accumulate large data URLs in localStorage over time.
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (!key || !key.startsWith("firecontrol:protocol-preview:")) {
            continue;
          }
          if (key === previewKey) continue;
          try {
            const raw = localStorage.getItem(key);
            if (!raw) {
              localStorage.removeItem(key);
              continue;
            }
            const parsed = JSON.parse(raw) as { savedAt?: number };
            if (!parsed?.savedAt || parsed.savedAt < cutoff) {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // localStorage may be unavailable (private mode, quota); fall back to
        // sessionStorage so same-tab previews still work.
        sessionStorage.setItem(previewKey, payload);
      }
    } catch {
      // The print preview can still open without embedded signatures.
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadObjects() {
      setFormLoadState("loading");

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: locationRows, error: locationError } = await supabase
          .from("locations")
          .select("*")
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (locationError) {
          setFormLoadState("error");
          return;
        }

        const locations = (locationRows as DataRecord[]) ?? [];
        const clientIds = Array.from(
          new Set(
            locations
              .map((location) => textValue(location, ["client_id"]))
              .filter(Boolean)
          )
        );
        let clients: DataRecord[] = [];

        if (clientIds.length) {
          const { data: clientRows, error: clientError } = await supabase
            .from("clients")
            .select("*")
            .in("id", clientIds);

          if (!isMounted) return;

          if (clientError) {
            setFormLoadState("error");
            return;
          }

          clients = (clientRows as DataRecord[]) ?? [];
        }

        const objects = locations.map((location) => {
          const clientId = textValue(location, ["client_id"]);
          const client =
            clients.find((row) => textValue(row, ["id"]) === clientId) ?? null;

          return mapObjectOption(location, client);
        });

        setObjectOptionsFromDb(objects);
        setSelectedObjectCode((current) => {
          if (current && objects.some((object) => object.code === current)) {
            return current;
          }

          return "";
        });
        setFormLoadState("ready");
      } catch {
        if (isMounted) {
          setFormLoadState("error");
        }
      }
    }

    loadObjects();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!draftNumber || draftHydratedRef.current) return;
    if (formLoadState === "loading") return;

    const storedDraft =
      loadStoredProtocols().find(
        (record) => record.number === draftNumber && record.status === "draft"
      ) ??
      fallbackDraftProtocols.find((record) => record.number === draftNumber);

    if (!storedDraft) {
      setSaveState({
        status: "error",
        message: "Черновата не е намерена или вече е завършена.",
      });
      draftHydratedRef.current = true;
      return;
    }

    const matchingObject = objectOptionsFromDb.find(
      (object) =>
        object.code === storedDraft.objectCode ||
        object.name === storedDraft.objectName ||
        (object.address === storedDraft.address &&
          object.client === storedDraft.client)
    );

    setProtocolType(
      storedDraft.protocolType === "Сервизен протокол"
        ? "Протокол за поддръжка на ПИС"
        : storedDraft.protocolType
    );
    setSelectedObjectCode(matchingObject?.code ?? selectedObjectCode);
    setSelectedTechnician(storedDraft.technician || "");
    setProtocolNumber(storedDraft.number);
    setProtocolDate(storedDraft.date || todayInputValue);
    setClientOrganization(storedDraft.client || "");
    setExtinguisherObjectName(storedDraft.objectName || "");
    setExtinguisherAddress(storedDraft.address || "");
    setExtinguisherRegion(storedDraft.region || matchingObject?.region || "");
    setExtinguisherPhone(storedDraft.phone || matchingObject?.phone || "");
    setContractReference(storedDraft.contractReference || "");
    setClientRepresentative(storedDraft.clientRepresentative || "");
    setSubscriptionChecks(
      storedDraft.subscriptionChecks ?? emptySubscriptionChecks()
    );
    setSubscriptionCheckNotes(storedDraft.subscriptionCheckNotes ?? {});
    setServiceQuality(storedDraft.serviceQuality || "happy");
    setPhotos(storedDraft.photos ?? []);
    setPhotoDescription(storedDraft.photos?.[0]?.description ?? "");
    setTechnicianSignatureDataUrl(storedDraft.technicianSignatureDataUrl || "");
    setClientSignatureDataUrl(storedDraft.clientSignatureDataUrl || "");
    setSubscriptionNotes(storedDraft.notes || "");
    setServiceDefects(storedDraft.serviceDefects || "");
    setServiceDeviations(storedDraft.serviceDeviations || "");
    setServiceSystemStatus(storedDraft.serviceSystemStatus || "Изрядна");
    setNextVisitDate(storedDraft.nextVisitDate || "");
    setChecks(storedDraft.checks ?? {});

    if (storedDraft.extinguisherRows?.length) {
      preserveDraftExtinguisherRowsRef.current = true;
      setExtinguisherRows(storedDraft.extinguisherRows);
    }

    if (storedDraft.selectedEquipmentIds?.length) {
      preserveDraftSelectedEquipmentIdsRef.current = true;
      setSelectedEquipmentIds(storedDraft.selectedEquipmentIds);
    }

    draftHydratedRef.current = true;
  }, [draftNumber, formLoadState, objectOptionsFromDb, selectedObjectCode]);

  useEffect(() => {
    if (!protocolNumber) return;

    let isMounted = true;

    async function loadSavedPhotos() {
      try {
        const savedPhotos = await readProtocolPhotosByNumber(protocolNumber);
        if (!isMounted || !savedPhotos.length) return;
        setPhotos(savedPhotos.map(protocolPhotoFromRecord));
        setPhotoDescription(savedPhotos[0]?.description ?? "");
      } catch {
        // Photo loading should not block protocol editing.
      }
    }

    loadSavedPhotos();

    return () => {
      isMounted = false;
    };
  }, [protocolNumber]);

  useEffect(() => {
    let isMounted = true;

    async function loadEquipmentForObject() {
      if (!selectedObjectDetails?.locationId) {
        setObjectEquipment([]);
        setSelectedEquipmentIds([]);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        let { data: equipmentRows, error } = await supabase
          .from("equipment")
          .select("*")
          .eq("location_id", selectedObjectDetails.locationId)
          .eq("archived", false);

        if (!isMounted) return;

        if (error) {
          const fallbackResult = await supabase
            .from("equipment")
            .select("*")
            .eq("location_id", selectedObjectDetails.locationId);

          if (!isMounted) return;

          equipmentRows = fallbackResult.data;
          error = fallbackResult.error;
        }

        if (error) {
          setObjectEquipment([]);
          return;
        }

        const activeEquipmentRows = ((equipmentRows as DataRecord[]) ?? []).filter(
          (row) => row["archived"] !== true && row["archived"] !== "true"
        );
        const mappedEquipment = activeEquipmentRows.map(mapEquipmentItem);
        setObjectEquipment(mappedEquipment);
        if (!preserveDraftSelectedEquipmentIdsRef.current) {
          setSelectedEquipmentIds(
            protocolType === "Пожарогасители"
              ? []
              : mappedEquipment.map((item) => item.id)
          );
        }

        const mappedExtinguisherRows = extinguisherRowsFromEquipment(
          protocolType === "Пожарогасители" ? [] : mappedEquipment,
          protocolDate,
          selectedTechnician
        );

        if (
          mappedExtinguisherRows.length &&
          !preserveDraftExtinguisherRowsRef.current
        ) {
          setExtinguisherRows(mappedExtinguisherRows);
        }
      } catch {
        if (isMounted) {
          setObjectEquipment([]);
        }
      }
    }

    loadEquipmentForObject();

    return () => {
      isMounted = false;
    };
  }, [protocolDate, protocolType, selectedObjectDetails?.locationId, selectedTechnician]);

  useEffect(() => {
    if (protocolType !== "Пожарогасители") return;
    if (preserveDraftExtinguisherRowsRef.current) return;

    const selectedEquipment = objectEquipment.filter((item) =>
      selectedEquipmentIds.includes(item.id)
    );
    const nextRows = extinguisherRowsFromEquipment(
      selectedEquipment,
      protocolDate,
      selectedTechnician
    );
    setExtinguisherRows((current) =>
      nextRows.map((row) => {
        const existing = current.find((item) => item.equipmentId === row.equipmentId);
        return existing
          ? {
              ...row,
              rowNumber: existing.rowNumber || row.rowNumber,
              serviceType: existing.serviceType || row.serviceType,
              resultStatus: existing.resultStatus || row.resultStatus,
              problemNote: existing.problemNote || row.problemNote,
              serviceDate: existing.serviceDate || row.serviceDate,
              nextServiceDate: existing.nextServiceDate || row.nextServiceDate,
              servicePersonName: existing.servicePersonName || row.servicePersonName,
              location: existing.location || row.location,
              stickerNumber: existing.stickerNumber || row.stickerNumber,
            }
          : row;
      })
    );
  }, [objectEquipment, protocolDate, protocolType, selectedEquipmentIds, selectedTechnician]);

  useEffect(() => {
    if (!selectedObjectDetails) return;
    if (draftNumber && draftHydratedRef.current) return;

    setClientOrganization(selectedObjectDetails.client);
    setExtinguisherObjectName(selectedObjectDetails.name);
    setExtinguisherAddress(selectedObjectDetails.address);
    setExtinguisherRegion(selectedObjectDetails.region);
    setExtinguisherPhone(selectedObjectDetails.phone);
    setClientRepresentative(selectedObjectDetails.contact);
  }, [selectedObjectDetails]);

  const visibleSections = useMemo(
    () => ({
      subscriptionService:
        protocolType === "Абонаментно обслужване / профилактичен преглед",
      checklist: protocolType === "Протокол за поддръжка на ПИС",
      extinguisherTable: protocolType === "Пожарогасители",
      serviceDetails: protocolType === "Протокол за поддръжка на ПИС",
      photos:
        protocolType === "Абонаментно обслужване / профилактичен преглед" ||
        protocolType === "Протокол за поддръжка на ПИС",
      signatures:
        protocolType === "Протокол за поддръжка на ПИС" ||
        protocolType === "Пожарогасители",
    }),
    [protocolType]
  );

  function buildProtocolRecord(
    status: StoredProtocolStatus,
    finalNumber: string
  ): StoredProtocol {
    const now = Date.now();
    return {
      number: finalNumber,
      status,
      protocolType: protocolType || protocolTypes[0],
      objectCode: selectedObjectDetails?.code ?? selectedObjectCode,
      date: protocolDate,
      client: printClient,
      objectName: printObjectName,
      address: printAddress,
      region: extinguisherRegion,
      phone: extinguisherPhone,
      technician: selectedTechnician,
      contractReference,
      clientRepresentative,
      personnelFunctions,
      subscriptionChecks,
      subscriptionCheckNotes,
      serviceQuality,
      photos: compactProtocolPhotos(photos),
      notes: subscriptionNotes,
      serviceDefects,
      serviceDeviations,
      serviceSystemStatus,
      nextVisitDate,
      technicianSignatureDataUrl,
      clientSignatureDataUrl,
      extinguisherRows,
      selectedEquipmentIds,
      checks,
      savedAt: now,
      completedAt: status === "completed" ? now : undefined,
    };
  }

  async function uploadProtocolPhotos(finalNumber: string) {
    const pendingPhotos = photos.filter((photo) => !photo.storagePath);
    if (!pendingPhotos.length) return photos;

    const protocolId = await getProtocolDatabaseId(finalNumber);
    const objectId =
      selectedObjectDetails?.locationId ||
      selectedObjectDetails?.code ||
      selectedObjectCode;
    const supabase = createSupabaseBrowserClient();
    const uploadedPhotos: ProtocolPhoto[] = [];

    for (const photo of pendingPhotos) {
      const extension = extensionFromPhoto(photo);
      const safeObjectId = safeStorageSegment(objectId || "object", "object");
      const safeProtocolNumber = safeStorageSegment(finalNumber, "protocol");
      const safePhotoId = safeStorageSegment(photo.id, `${Date.now()}`);
      const safeName = safeStorageSegment(photo.name, `photo.${extension}`);
      const fileName = safeName.includes(".") ? safeName : `${safeName}.${extension}`;
      const storagePath = `${safeObjectId}/${safeProtocolNumber}/${safePhotoId}-${fileName}`;
      const body = photo.file ?? dataUrlToBlob(photo.dataUrl);

      const { error: uploadError } = await supabase.storage
        .from(protocolPhotosBucket)
        .upload(storagePath, body, {
          contentType: photo.file?.type || body.type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(protocolPhotoStorageError(uploadError.message));
      }

      const fileUrl = supabase.storage
        .from(protocolPhotosBucket)
        .getPublicUrl(storagePath).data.publicUrl;

      const { data, error: insertError } = await supabase
        .from("protocol_photos")
        .insert({
          protocol_id: protocolId || null,
          protocol_number: finalNumber,
          object_id: objectId || "",
          uploaded_by: selectedTechnician,
          file_url: fileUrl,
          storage_path: storagePath,
          description: photo.description || photoDescription.trim(),
        })
        .select("*")
        .single();

      if (insertError || !data) {
        throw new Error(insertError?.message || "Снимката не беше записана");
      }

      uploadedPhotos.push(protocolPhotoFromRecord(mapProtocolPhoto(data as DataRecord)));
    }

    const nextPhotos = [
      ...photos.filter((photo) => photo.storagePath),
      ...uploadedPhotos,
    ];
    setPhotos(nextPhotos);
    return nextPhotos;
  }

  async function handleSaveDraft() {
    if (saveState.status === "saving") return;

    setSaveState({ status: "saving", mode: "draft" });

    try {
      let finalNumber = protocolNumber.trim();

      if (!finalNumber) {
        // First save — claim a number from Supabase
        finalNumber = await claimProtocolNumber({
          serviceCode,
          serviceId: selectedServiceId,
          protocolDate,
          protocolType: protocolType ?? "",
          locationId: selectedObjectDetails?.locationId ?? "",
          objectCode: selectedObjectDetails?.code ?? selectedObjectCode,
          clientName: printClient,
          objectName: printObjectName,
          technician: selectedTechnician,
          status: "draft",
        });
        setProtocolNumber(finalNumber);
      } else {
        // Number already assigned — just update status to draft
        await updateProtocolStatus(finalNumber, "draft");
      }

      let record = buildProtocolRecord("draft", finalNumber);
      await saveProtocolRecordToSupabase(
        record,
        selectedObjectDetails?.locationId ?? null
      );
      const savedPhotos = await uploadProtocolPhotos(finalNumber);
      record = { ...record, photos: compactProtocolPhotos(savedPhotos) };
      await saveProtocolRecordToSupabase(
        record,
        selectedObjectDetails?.locationId ?? null
      );
      persistProtocol(record);
      await syncProtocolsToSupabase();

      setSaveState({
        status: "draft-saved",
        number: finalNumber,
        savedAt: record.savedAt,
      });
    } catch (err) {
      setSaveState({
        status: "error",
        message: err instanceof Error ? err.message : "Неуспешно запазване. Моля опитайте отново.",
      });
    }
  }

  async function handleCompleteProtocol() {
    if (saveState.status === "saving") return;

    setSaveState({ status: "saving", mode: "complete" });

    const errors: string[] = [];

    if (!protocolType) errors.push("Не е избран тип протокол.");
    if (!printObjectName.trim()) errors.push("Не е избран обект.");
    if (!selectedTechnician.trim()) errors.push("Не е избран техник.");
    if (!protocolDate.trim()) errors.push("Не е попълнена дата.");
    if (!technicianSignatureDataUrl) errors.push("Липсва подпис на техник.");
    if (!clientSignatureDataUrl) errors.push("Липсва подпис на клиент.");

    if (printTemplateSlug === "extinguisher-handover") {
      if (!extinguisherRows.length) {
        errors.push("Изберете поне един пожарогасител от оборудването.");
      }
      if (
        extinguisherRows.some(
          (row) =>
            isTechnicalExtinguisherService(row.serviceType) &&
            !row.nextServiceDate?.trim()
        )
      ) {
        errors.push("Попълнете дата на следващо обслужване за всеки пожарогасител.");
      }
    }

    if (errors.length > 0) {
      setSaveState({
        status: "error",
        message: errors.join(" "),
      });
      return;
    }

    try {
      let finalNumber = protocolNumber.trim();

      if (!finalNumber) {
        // First save — claim a number from Supabase
        finalNumber = await claimProtocolNumber({
          serviceCode,
          serviceId: selectedServiceId,
          protocolDate,
          protocolType: protocolType ?? "",
          locationId: selectedObjectDetails?.locationId ?? "",
          objectCode: selectedObjectDetails?.code ?? selectedObjectCode,
          clientName: printClient,
          objectName: printObjectName,
          technician: selectedTechnician,
          status: "completed",
        });
        setProtocolNumber(finalNumber);
      } else {
        // Number already assigned (was a draft) — mark as completed
        await updateProtocolStatus(finalNumber, "completed");
      }

      let record = buildProtocolRecord("completed", finalNumber);

      if (printTemplateSlug === "subscription-service") {
        const plannedSubscriptionTasks = subscriptionChecklistRows
          .map((row) => {
            const state = subscriptionChecks[row.number];
            if (state !== "добро" && state !== "лошо") return null;

            const recurrenceMonths = recurrenceMonthsFromPeriodicity(row.periodicity);
            return recurrenceMonths
              ? {
                  row,
                  recurrenceMonths,
                  description: subscriptionTaskText(row),
                  dueDate: addMonthsToInputDate(protocolDate, recurrenceMonths),
                }
              : null;
          })
          .filter(
            (
              item
            ): item is {
              row: (typeof subscriptionChecklistRows)[number];
              recurrenceMonths: number;
              description: string;
              dueDate: string;
            } => item !== null
          );
        const finalNextVisitDate =
          plannedSubscriptionTasks
            .map((task) => task.dueDate)
            .sort()[0] || "";

        if (selectedObjectDetails?.locationId && finalNextVisitDate) {
          const supabase = createSupabaseBrowserClient();
          const { error } = await supabase
            .from("locations")
            .update({
              last_check: protocolDate,
              next_check: finalNextVisitDate,
              status: "изряден",
            })
            .eq("id", selectedObjectDetails.locationId);

          if (error) {
            throw new Error(error.message);
          }
        }

        const tasksByDate = new Map<string, typeof plannedSubscriptionTasks>();
        for (const plannedTask of plannedSubscriptionTasks) {
          tasksByDate.set(plannedTask.dueDate, [
            ...(tasksByDate.get(plannedTask.dueDate) ?? []),
            plannedTask,
          ]);
        }

        const objectId =
          selectedObjectDetails?.locationId ||
          selectedObjectDetails?.code ||
          selectedObjectCode;
        const protocolId = await getProtocolDatabaseId(finalNumber);
        const defectRows = subscriptionDefectRows(
          subscriptionChecks,
          subscriptionCheckNotes
        );

        for (const defect of defectRows) {
          await upsertDefectTask({
            title: defect.row.label,
            description: defect.comment || defect.row.label,
            activities: [
              {
                row: defect.row.number,
                title: defect.row.label,
                description: defect.comment || defect.row.label,
                recurrenceMonths: 0,
              },
            ],
            objectCode: objectId,
            objectId,
            objectName: printObjectName,
            client: printClient,
            sourceProtocolId: protocolId || finalNumber,
            sourceProtocolNumber: finalNumber,
            sourceProtocolRow: defect.row.number,
            sourceProtocolType: protocolType || undefined,
            sourceLabel: `Протокол №${finalNumber}`,
            recurrenceMonths: undefined,
          });
        }

        if (plannedSubscriptionTasks.length > 0) {
          await clearPlannedSubscriptionTasksForObject([
            objectId,
            selectedObjectDetails?.code || "",
            selectedObjectCode,
            printObjectName,
          ],
          plannedSubscriptionTasks.map((task) => task.recurrenceMonths),
          plannedSubscriptionTasks.map((task) => task.dueDate));
        }

        for (const [dueDate, groupedTasks] of tasksByDate) {
          const activities = groupedTasks.map((plannedTask) => ({
            row: plannedTask.row.number,
            title: plannedTask.row.label,
            description: plannedTask.description,
            recurrenceMonths: plannedTask.recurrenceMonths,
          }));

          await upsertServiceTask({
            title: "Планирано посещение – Абонаментно обслужване",
            description: activities
              .map((activity) => `• ${activity.title}`)
              .join("\n"),
            taskType: "Планирано посещение",
            activities,
            objectCode: objectId,
            objectId,
            objectName: printObjectName,
            client: printClient,
            assignedTo: selectedTechnician,
            dueDate,
            sourceProtocolId: protocolId || finalNumber,
            sourceProtocolNumber: finalNumber,
            sourceProtocolRow: dueDate,
            sourceProtocolType: protocolType || undefined,
            sourceLabel: `Абонаментен протокол №${finalNumber}`,
            recurrenceMonths: undefined,
            status: "planned",
          });
        }
      }

      if (printTemplateSlug === "service-maintenance") {
        const objectId =
          selectedObjectDetails?.locationId ||
          selectedObjectDetails?.code ||
          selectedObjectCode;
        const protocolId = await getProtocolDatabaseId(finalNumber);
        const serviceProblems = [
          {
            key: "service-defects",
            title: "Дефект",
            description: serviceDefects.trim(),
          },
          {
            key: "service-deviations",
            title: "Отклонение",
            description: serviceDeviations.trim(),
          },
        ].filter((item) => item.description);

        for (const problem of serviceProblems) {
          await upsertDefectTask({
            title: problem.title,
            description: problem.description,
            activities: [
              {
                row: problem.key,
                title: problem.title,
                description: problem.description,
                recurrenceMonths: 0,
              },
            ],
            objectCode: objectId,
            objectId,
            objectName: printObjectName,
            client: printClient,
            assignedTo: selectedTechnician,
            sourceProtocolId: protocolId || finalNumber,
            sourceProtocolNumber: finalNumber,
            sourceProtocolRow: problem.key,
            sourceProtocolType: protocolType || undefined,
            sourceLabel: `Протокол за поддръжка на ПИС №${finalNumber}`,
            recurrenceMonths: undefined,
          });
        }
      }

      if (printTemplateSlug === "service-maintenance" && nextVisitDate) {
        const objectId =
          selectedObjectDetails?.locationId ||
          selectedObjectDetails?.code ||
          selectedObjectCode;
        const protocolId = await getProtocolDatabaseId(finalNumber);
        const reason = "Поддръжка на пожароизвестителна система";

        await upsertServiceTask({
          title: "Планирано посещение",
          description: reason,
          taskType: "Планирано посещение",
          activities: [
            {
              row: "next-visit",
              title: reason,
              description: reason,
              recurrenceMonths: 0,
            },
          ],
          objectCode: objectId,
          objectId,
          objectName: printObjectName,
          client: printClient,
          assignedTo: selectedTechnician,
          dueDate: nextVisitDate,
          sourceProtocolId: protocolId || finalNumber,
          sourceProtocolNumber: finalNumber,
          sourceProtocolRow: "next-visit",
          sourceProtocolType: protocolType || undefined,
          sourceLabel: `Протокол за поддръжка на ПИС №${finalNumber}`,
          recurrenceMonths: undefined,
          status: "planned",
        });
      }

      if (printTemplateSlug === "extinguisher-handover") {
        const supabase = createSupabaseBrowserClient();
        const objectId =
          selectedObjectDetails?.locationId ||
          selectedObjectDetails?.code ||
          selectedObjectCode;
        const protocolId = await getProtocolDatabaseId(finalNumber);

        for (const row of extinguisherRows) {
          if (!row.equipmentId) continue;

          const extinguisherTitle = [
            "Пожарогасител",
            row.category,
            row.chargeMassKg,
          ]
            .filter(Boolean)
            .join(" ");
          const serviceSubject = [
            "пожарогасител",
            row.category,
            row.chargeMassKg,
          ]
            .filter(Boolean)
            .join(" ");
          const serviceType = row.serviceType.trim() || "техническо обслужване";
          const taskTitle = `${serviceType} на ${serviceSubject}`.trim();

          if (row.stickerNumber) {
            await saveFireExtinguisherStickerRow({
              row,
              stickerNumber: row.stickerNumber,
              protocolNumber: finalNumber,
              protocolId,
              objectId,
              objectName: printObjectName,
              companySettings,
            });
          }

          const updateEquipmentResult = await supabase
            .from("equipment")
            .update({
              last_check_date: row.serviceDate || protocolDate || null,
              last_service_date: row.serviceDate || protocolDate || null,
              next_check_date: row.nextServiceDate || null,
              next_service_date: row.nextServiceDate || null,
              sticker_number: row.stickerNumber ? Number(row.stickerNumber) : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.equipmentId);

          if (updateEquipmentResult.error) {
            throw new Error(updateEquipmentResult.error.message);
          }

          if (!row.stickerNumber) {
            await saveFireExtinguisherServiceHistory({
                equipment_id: row.equipmentId,
                object_id: objectId,
                protocol_id: protocolId || null,
                protocol_number: finalNumber,
                sticker_number: null,
                service_type: row.serviceType,
                service_date: row.serviceDate || protocolDate || null,
                next_service_date: row.nextServiceDate || null,
                technician_id: "",
                technician: row.servicePersonName,
              });
          }

          await completePlannedEquipmentTasks(row.equipmentId, finalNumber);

          if (row.nextServiceDate) {
            await upsertServiceTask({
              title: taskTitle,
              description: `${taskTitle}\nСледващо обслужване: ${row.nextServiceDate}`,
              taskType: "Планирано посещение",
              activities: [
                {
                  row: row.rowNumber,
                  title: taskTitle,
                  description: `${taskTitle}\nСледващо обслужване: ${row.nextServiceDate}`,
                  recurrenceMonths: 0,
                },
              ],
              objectCode: objectId,
              objectId,
              objectName: printObjectName,
              client: printClient,
              assignedTo: row.servicePersonName || selectedTechnician,
              dueDate: row.nextServiceDate,
              sourceProtocolId: protocolId || finalNumber,
              sourceProtocolNumber: finalNumber,
              sourceProtocolRow: row.equipmentId,
              sourceProtocolType: protocolType || undefined,
              sourceLabel: `Протокол №${finalNumber}`,
              recurrenceMonths: undefined,
              status: "planned",
            });
          }

          if (extinguisherResultNeedsAttention(row.resultStatus || "")) {
            const followUpTask = extinguisherFollowUpTaskContent(
              row.resultStatus || "",
              extinguisherTitle,
              row.problemNote || ""
            );
            await upsertDefectTask({
              title: followUpTask.title,
              description: followUpTask.description,
              activities: [
                {
                  row: row.rowNumber,
                  title: followUpTask.title,
                  description: followUpTask.description,
                  recurrenceMonths: 0,
                },
              ],
              objectCode: objectId,
              objectId,
              objectName: printObjectName,
              client: printClient,
              sourceProtocolId: protocolId || finalNumber,
              sourceProtocolNumber: finalNumber,
              sourceProtocolRow: row.equipmentId,
              sourceProtocolType: protocolType || undefined,
              sourceLabel: `Протокол №${finalNumber}`,
              recurrenceMonths: undefined,
            });
          }
        }
      }

      await saveProtocolRecordToSupabase(
        record,
        selectedObjectDetails?.locationId ?? null
      );
      const savedPhotos = await uploadProtocolPhotos(finalNumber);
      record = { ...record, photos: compactProtocolPhotos(savedPhotos) };
      await saveProtocolRecordToSupabase(
        record,
        selectedObjectDetails?.locationId ?? null
      );
      persistProtocol(record);
      await syncProtocolsToSupabase();

      const successParams = new URLSearchParams({
        number: finalNumber,
        type: protocolType,
        object: printObjectName,
        date: protocolDate,
        printHref: printPreviewHref,
      });

      router.push(`/protocols/success?${successParams.toString()}`);
    } catch (err) {
      console.error("Failed to complete protocol", err);
      setSaveState({
        status: "error",
        message: completionErrorMessage(err),
      });
    }
  }

  const isSaving = saveState.status === "saving";
  const isSavingDraft = isSaving && saveState.mode === "draft";
  const isCompleting = isSaving && saveState.mode === "complete";

  function handleTechnicianChange(technician: string) {
    setSelectedTechnician(technician);
    const savedSignature = technicianSignatures[technician];
    if (savedSignature) {
      setTechnicianSignatureDataUrl(savedSignature);
    } else {
      setTechnicianSignatureDataUrl("");
    }
  }

  return (
    <AppShell
      title="Нов протокол"
      description="Създаване на протокол за поддръжка на ПИС, чеклист и подписи"
    >
      <div className="space-y-6 pb-40 sm:pb-28">
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                <FilePenLine size={22} />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  {draftNumber ? "Редакция на чернова" : "Нов протокол"}
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {draftNumber
                    ? "Допълнете черновата и я завършете, когато е готова."
                    : "Попълнете данните за проверката и сервизното обслужване."}
                </p>
              </div>
            </div>
          </div>

          {formLoadState === "loading" ? (
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-500">
              Зареждане...
            </div>
          ) : null}

          {formLoadState === "error" ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
              Грешка при зареждане
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SelectField
              label="Тип протокол"
              value={protocolType}
              onChange={(value) => setProtocolType(value as ProtocolType | "")}
            >
              <option value="">Избери</option>
              {protocolTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Обект"
              value={selectedObjectCode}
              disabled={Boolean(initialObjectCode)}
              onChange={(objectName) => {
                setSelectedObjectCode(objectName);
              }}
            >
              <option value="">Избери</option>
              {objectOptionsFromDb.map((object) => (
                <option key={object.code} value={object.code}>
                  {object.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Сервиз"
              value={selectedServiceId}
              onChange={setSelectedServiceId}
            >
              <option value="">Избери</option>
              {serviceCenterOptions.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Техник"
              value={selectedTechnician}
              onChange={handleTechnicianChange}
            >
              <option value="">Избери</option>
              {technicianOptions.map((technician) => (
                <option key={technician} value={technician}>
                  {technician}
                </option>
              ))}
            </SelectField>

            {/* Protocol number — readonly, generated automatically on first save */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase text-slate-400">
                № протокол
              </label>
              {protocolNumber ? (
                <div className="flex h-11 min-w-0 items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 font-mono text-lg font-black tracking-wide text-emerald-800">
                  <span className="block min-w-0 truncate whitespace-nowrap">
                  {protocolNumber}
                  </span>
                </div>
              ) : protocolNumberPreview ? (
                <div className="flex h-11 min-w-0 items-center rounded-2xl border border-orange-200 bg-orange-50 px-4 font-mono text-lg font-black tracking-wide text-orange-800">
                  <span className="block min-w-0 truncate whitespace-nowrap">
                  {protocolNumberPreview}
                  </span>
                </div>
              ) : (
                <div className="flex h-11 items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-bold text-slate-400">
                  Изберете сервиз и дата
                </div>
              )}
            </div>

            <TextInputField
              label="Дата"
              type="date"
              value={protocolDate}
              onChange={setProtocolDate}
            />
          </div>

          {selectedObjectDetails ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500">
              <MapPin size={15} className="text-orange-500" />
              <span className="font-black text-slate-800">
                {selectedObjectDetails.name}
              </span>
              <span>•</span>
              <span>{selectedObjectDetails.address}</span>
              <span>•</span>
              <span>Сервиз {serviceCode}</span>
            </div>
          ) : null}
        </Card>

        {visibleSections.subscriptionService && (
          <SubscriptionServiceSection
            contractReference={contractReference}
            setContractReference={setContractReference}
            clientRepresentative={clientRepresentative}
            setClientRepresentative={setClientRepresentative}
            serviceCode={serviceCode}
            subscriptionChecks={subscriptionChecks}
            setSubscriptionChecks={setSubscriptionChecks}
            subscriptionCheckNotes={subscriptionCheckNotes}
            setSubscriptionCheckNotes={setSubscriptionCheckNotes}
            serviceQuality={serviceQuality}
            setServiceQuality={setServiceQuality}
            technicianSignatureDataUrl={technicianSignatureDataUrl}
            setTechnicianSignatureDataUrl={setTechnicianSignatureDataUrl}
            clientSignatureDataUrl={clientSignatureDataUrl}
            setClientSignatureDataUrl={setClientSignatureDataUrl}
            notes={subscriptionNotes}
            setNotes={setSubscriptionNotes}
          />
        )}

        {visibleSections.checklist && (
          <ChecklistSection
            items={activeChecklist}
            checks={checks}
            setChecks={setChecks}
          />
        )}

        {visibleSections.extinguisherTable && (
          <ExtinguisherProtocolSection
            clientOrganization={clientOrganization}
            setClientOrganization={setClientOrganization}
            objectName={extinguisherObjectName}
            setObjectName={setExtinguisherObjectName}
            address={extinguisherAddress}
            setAddress={setExtinguisherAddress}
            region={extinguisherRegion}
            setRegion={setExtinguisherRegion}
            phone={extinguisherPhone}
            setPhone={setExtinguisherPhone}
            clientRepresentative={clientRepresentative}
            setClientRepresentative={setClientRepresentative}
            technician={selectedTechnician}
            setTechnician={setSelectedTechnician}
            protocolDate={protocolDate}
            setProtocolDate={setProtocolDate}
            rows={extinguisherRows}
            setRows={setExtinguisherRows}
            dropdowns={extinguisherDropdowns}
            protocolNumber={protocolNumber || protocolNumberPreview}
            objectId={
              selectedObjectDetails?.locationId ||
              selectedObjectDetails?.code ||
              selectedObjectCode
            }
            companySettings={companySettings}
            equipment={objectEquipment}
            selectedEquipmentIds={selectedEquipmentIds}
            setSelectedEquipmentIds={setSelectedEquipmentIds}
          />
        )}

        {visibleSections.serviceDetails && (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <TextAreaSection
                title="Дефекти"
                value={serviceDefects}
                onChange={setServiceDefects}
              />
              <TextAreaSection
                title="Отклонения"
                value={serviceDeviations}
                onChange={setServiceDeviations}
              />
            </div>
            <Card className="p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SelectField
                  label="Статус на системата"
                  value={serviceSystemStatus}
                  onChange={setServiceSystemStatus}
                >
                  {extinguisherDropdowns.serviceSystemStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectField>
                <TextInputField
                  label="Дата на следващо посещение"
                  type="date"
                  value={nextVisitDate}
                  onChange={setNextVisitDate}
                />
              </div>
            </Card>
          </>
        )}

        {visibleSections.photos && (
          <PhotosSection
            photos={photos}
            setPhotos={setPhotos}
            photoDescription={photoDescription}
            setPhotoDescription={setPhotoDescription}
          />
        )}

        {visibleSections.signatures && (
          <SignaturesSection
            technicianSignatureDataUrl={technicianSignatureDataUrl}
            setTechnicianSignatureDataUrl={setTechnicianSignatureDataUrl}
            clientSignatureDataUrl={clientSignatureDataUrl}
            setClientSignatureDataUrl={setClientSignatureDataUrl}
          />
        )}

      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[1.5rem] text-sm">
            {saveState.status === "draft-saved" && (
              <span className="inline-flex items-center gap-2 font-bold text-green-700">
                <CheckCircle2 size={16} />
                Черновата е запазена: {saveState.number}
              </span>
            )}
            {saveState.status === "error" && (
              <span className="font-bold text-red-600">
                {saveState.message}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={printPreviewHref}
              target="_blank"
              rel="noreferrer"
              onClick={handlePreparePrintPreview}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            >
              <Eye size={18} />
              Преглед за печат
            </a>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSaving}
            >
              {isSavingDraft ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Save size={17} />
              )}
              {isSavingDraft ? "Запазване..." : "Запази чернова"}
            </Button>
            <Button
              type="button"
              onClick={handleCompleteProtocol}
              disabled={isSaving}
            >
              {isCompleting ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <CheckCheck size={17} />
              )}
              {isCompleting ? "Завършване..." : "Завърши протокол"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
