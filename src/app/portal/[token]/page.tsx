"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  Fan,
  FileCheck2,
  FileSignature,
  FileText,
  Flame,
  FireExtinguisher,
  LampWallUp,
  Loader2,
  Mail,
  MapPin,
  MapPinned,
  PanelTop,
  PencilLine,
  Phone,
  ShieldCheck,
  Siren,
  SprayCan,
  UserRound,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { ContactLink } from "../../../components/contact-link";

type PortalClient = {
  id: string;
  name: string;
  clientType: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
};

type PortalLocation = {
  id: string;
  qrCode: string;
  name: string;
  address: string;
  region: string;
  status: string;
  service: string;
  objectType: string;
  equipment: PortalEquipment[];
};

type PortalEquipment = {
  id: string;
  locationId: string;
  name: string;
  type: string;
  subtype: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  capacity: string;
  location: string;
  status: string;
  lastCheckDate: string;
  nextCheckDate: string;
};

type DocumentLine = {
  id?: string;
  name?: string;
  description?: string;
  period?: string;
  periodicity?: string;
  object?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
};

type OfferPreview = {
  number?: string;
  date?: string;
  validUntil?: string;
  client?: string;
  contact?: string;
  phone?: string;
  email?: string;
  object?: string;
  address?: string;
  subject?: string;
  notes?: string;
  executionTerm?: string;
  paymentTerms?: string;
  warrantyTerms?: string;
  preparedBy?: string;
  signatureUrl?: string;
  acceptedSignatureUrl?: string;
  lines?: DocumentLine[];
};

type ContractPreview = OfferPreview & {
  offerNumber?: string;
  contractorSignatureUrl?: string;
  terms?: { id?: string; title?: string; text?: string }[];
};

type DocumentData = {
  offer?: OfferPreview | null;
  contract?: ContractPreview | null;
  totals?: Record<string, unknown> | null;
};

type PortalDocument = {
  id: string;
  kind: string;
  title: string;
  number: string;
  status: string;
  requiresSignature: boolean;
  signatureMethod: string;
  signedAt: string;
  signedByName: string;
  signatureDataUrl: string;
  publishedAt: string;
  href: string;
  total: string;
  objectName: string;
  savedDocumentId: string;
  locationId: string;
  documentData: DocumentData;
};

type PortalProtocol = {
  id: string;
  number: string;
  type: string;
  date: string;
  status: string;
  clientName: string;
  objectName: string;
  technician: string;
  locationId: string;
  objectCode: string;
  protocolPayload: Record<string, unknown>;
};

type PortalTask = {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  dueDate: string;
  objectId: string;
  objectCode: string;
  objectName: string;
  assignedTo: string;
  completedAt: string;
};

type PortalData = {
  portal: { token: string; lastOpenedAt: string };
  client: PortalClient;
  locations: PortalLocation[];
  documents: PortalDocument[];
  protocols: PortalProtocol[];
  tasks: PortalTask[];
};

type PortalLibraryItem =
  | { id: string; itemType: "document"; sortDate: string; document: PortalDocument }
  | { id: string; itemType: "protocol"; sortDate: string; protocol: PortalProtocol };

function formatDate(value: string | undefined) {
  if (!value) return "Без дата";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("bg-BG").format(date);
}

function dateTimestamp(value: string | undefined) {
  if (!value) return 0;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatAmount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `${new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)} €`;
}

function textValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function splitServiceList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function documentKindLabel(kind: string) {
  if (kind === "offer") return "Оферта";
  if (kind === "contract") return "Договор";
  if (kind === "protocol") return "Протокол";
  return "Документ";
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function taskIsDone(task: PortalTask) {
  const status = task.status.toLowerCase();
  return Boolean(task.completedAt) || ["done", "completed", "resolved", "приключена", "готово"].includes(status);
}

function sentenceTitle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toLocaleUpperCase("bg-BG")}${trimmed.slice(1)}`;
}

function portalTaskTitle(task: PortalTask) {
  const text = `${task.title} ${task.description} ${task.taskType}`.toLowerCase();
  if (
    text.includes("поддръжка на пожароизвестителна система") ||
    text.includes("поддръжка на пис") ||
    text.includes("протокол за поддръжка на пис")
  ) {
    return "Поддръжка на ПИС";
  }
  return sentenceTitle(task.title);
}

function documentSource(document: PortalDocument) {
  return document.kind === "contract" ? document.documentData?.contract : document.documentData?.offer;
}

function documentLines(document: PortalDocument) {
  const source = documentSource(document);
  return Array.isArray(source?.lines) ? source.lines : [];
}

function documentTotals(document: PortalDocument) {
  const lines = documentLines(document);
  const totals = document.documentData?.totals;
  const subtotal = Number(textValue(totals, ["subtotal"]));
  const total = Number(textValue(totals, ["total"]));
  const vat = Number(textValue(totals, ["vat"]));
  const lineSubtotal = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity) || 1;
    const unitPrice = Number(line.unitPrice) || 0;
    const price = Number(line.price);
    return sum + (Number.isFinite(price) && price > 0 ? price : quantity * unitPrice);
  }, 0);
  const resolvedSubtotal = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : lineSubtotal;
  const resolvedTotal = Number.isFinite(total) && total > 0 ? total : resolvedSubtotal;
  const resolvedVat = Number.isFinite(vat) && vat > 0 ? vat : Math.max(0, resolvedTotal - resolvedSubtotal);
  return { subtotal: resolvedSubtotal, vat: resolvedVat, total: resolvedTotal };
}

function visibleLineDescription(line: DocumentLine) {
  const description = String(line.description || "").trim();
  const normalized = description.toLowerCase();
  if (!description || normalized.includes("описание от офертата")) return "";
  if (normalized.includes("услуга по пожарна безопасност според избрания обхват")) return "";
  return description;
}

function documentSubject(document: PortalDocument) {
  const source = documentSource(document);
  if (source?.subject) return source.subject;
  if (document.kind === "contract") {
    return "Договор за услуги, свързани с пожарна безопасност, профилактика, сервиз и документиране.";
  }
  return "Оферта за услуги, свързани с пожарна безопасност и сервизно обслужване.";
}

function documentTerms(document: PortalDocument) {
  const source = documentSource(document);
  if (document.kind === "contract") {
    return document.documentData?.contract?.terms || [];
  }
  return [
    {
      id: "execution",
      title: "Изпълнение",
      text: source?.executionTerm || "Изпълнението се планира след писмено потвърждение на офертата и уточняване на достъп до обекта.",
    },
    {
      id: "payment",
      title: "Плащане",
      text: source?.paymentTerms || "Плащане по банков път след издадена фактура, освен ако страните не договорят друго писмено.",
    },
    {
      id: "documents",
      title: "Документи",
      text: source?.warrantyTerms || "Офертата включва документиране на извършените дейности съгласно приложимите изисквания за пожарна безопасност.",
    },
    {
      id: "notes",
      title: "Бележки",
      text: source?.notes || "Цените са ориентировъчни и могат да бъдат прецизирани след оглед и потвърждение на обхвата.",
    },
  ];
}

function documentStatus(document: PortalDocument) {
  if (document.kind === "contract" && document.status === "terminated") {
    return "Прекратен";
  }
  if (document.status === "signed") {
    return document.signatureMethod === "paper" ? "Подписан на хартия" : "Подписан онлайн";
  }
  if (document.requiresSignature) return "Очаква подпис";
  return "Публикуван";
}

function protocolTitle(protocol: PortalProtocol) {
  const protocolType =
    textFromRecord(protocol.protocolPayload ?? {}, "protocolType") || protocol.type;
  const label = protocolTypeLabel(protocolType);
  const shortLabel = label === "Протокол за поддръжка на ПИС" ? "Поддръжка на ПИС" : label;

  return shortLabel;
}

function protocolStatus(protocol: PortalProtocol) {
  if (!protocol.status) return "Издаден";
  if (protocol.status === "signed") return "Подписан";
  if (protocol.status === "completed") return "Приключен";
  return protocol.status;
}

function protocolTypeLabel(value: string) {
  if (value === "subscription") return "Абонаментно обслужване / профилактичен преглед";
  if (value === "extinguisher") return "Пожарогасители";
  if (value === "service") return "Протокол за поддръжка на ПИС";
  return value || "Протокол";
}

const subscriptionScopeRows = [
  {
    number: "1.",
    label: "Външен оглед на възлите на ПГИ",
    periodicity: "ежемесечно",
    intervalMonths: 1,
  },
  {
    number: "2.",
    label: "Проверка на блоковете за управление и работа на ПГИ в ръчен и автоматичен режим",
    periodicity: "на три месеца",
    intervalMonths: 3,
  },
  {
    number: "3.",
    label: "Тест изправността и напрежението на линиите за активиране на ПГИ",
    periodicity: "ежемесечно",
    intervalMonths: 1,
  },
  {
    number: "4.",
    label: "Тест работата на ПГИ в режим местно и дистанционно управление",
    periodicity: "ежемесечно",
    intervalMonths: 1,
  },
  {
    number: "5.",
    label: "Проверка на изнесени сигнализатори за тревога",
    periodicity: "годишно",
    intervalMonths: 12,
  },
  {
    number: "6.",
    label: "Тест на ПГИ в автономен и ръчен режим на активиране",
    periodicity: "годишно",
    intervalMonths: 12,
  },
  {
    number: "7.",
    label: "Проверка на данните за работа на ПГИ",
    periodicity: "на три месеца",
    intervalMonths: 3,
  },
  {
    number: "8.",
    label: "Хардуерен тест на контролните устройства",
    periodicity: "годишно",
    intervalMonths: 12,
  },
];

function isSubscriptionProtocol(protocol: PortalProtocol) {
  const protocolType = textFromRecord(protocol.protocolPayload ?? {}, "protocolType") || protocol.type;
  return protocolTypeLabel(protocolType).includes("Абонаментно обслужване");
}

function subscriptionDefaultScope() {
  return subscriptionScopeRows
    .filter((row) => row.intervalMonths === 1)
    .map((row) => row.label);
}

function subscriptionCheckStatus(value: unknown) {
  if (value === true) return "";
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized || ["непопълнено", "unfilled", "unchecked", "none", "false", "0"].includes(normalized)) {
    return null;
  }
  if (["лошо", "bad", "problem"].includes(normalized)) return "лошо";
  return "";
}

function monthsBetweenDates(from: string | undefined, to: string | undefined) {
  if (!from || !to) return 0;
  const start = new Date(from.includes("T") ? from : `${from}T00:00:00`);
  const end = new Date(to.includes("T") ? to : `${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
}

function subscriptionProtocolScope(protocol: PortalProtocol) {
  if (!isSubscriptionProtocol(protocol)) return [];
  const checks = protocol.protocolPayload?.["subscriptionChecks"];
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    return [];
  }

  const selectedRows = subscriptionScopeRows
    .map((row) => {
      const status = subscriptionCheckStatus((checks as Record<string, unknown>)[row.number]);
      if (status === null) return "";
      return status ? `${row.label} - ${status}` : row.label;
    })
    .filter(Boolean);

  return selectedRows;
}

function subscriptionTaskScope(task: PortalTask, lastVisitDate: string) {
  const title = `${task.title} ${task.taskType}`.toLowerCase();
  if (!title.includes("абонаментно")) return [];

  const monthOffset = monthsBetweenDates(lastVisitDate, task.dueDate);
  if (monthOffset <= 0) return subscriptionDefaultScope();

  const intervalMonths = monthOffset % 12 === 0 ? 12 : monthOffset % 3 === 0 ? 3 : 1;

  return subscriptionScopeRows
    .filter((row) => row.intervalMonths === intervalMonths)
    .map((row) => row.label);
}

function protocolPrintSlug(protocolType: string) {
  const label = protocolTypeLabel(protocolType);
  if (label === "Пожарогасители") return "extinguisher-handover";
  if (label === "Протокол за поддръжка на ПИС" || label === "Сервизен протокол") {
    return "service-maintenance";
  }
  return "subscription-service";
}

function libraryItemTypeLabel(item: PortalLibraryItem) {
  if (item.itemType === "protocol") return "Протокол";
  return documentKindLabel(item.document.kind);
}

function libraryItemTitle(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? protocolTitle(item.protocol) : item.document.title;
}

function libraryItemObjectName(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? item.protocol.objectName : item.document.objectName;
}

function libraryItemDate(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? item.protocol.date : item.document.publishedAt;
}

function libraryItemStatus(item: PortalLibraryItem) {
  return item.itemType === "protocol" ? protocolStatus(item.protocol) : documentStatus(item.document);
}

function libraryItemNeedsSignature(item: PortalLibraryItem) {
  return item.itemType === "document" && item.document.requiresSignature && item.document.status !== "signed";
}

function textFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function protocolPayloadRows(protocol: PortalProtocol) {
  const rows = protocol.protocolPayload?.["extinguisherRows"];
  return Array.isArray(rows) ? rows : [];
}

function sentenceCaseLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function protocolExtinguisherActivities(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const serviceType = sentenceCaseLabel(
      textFromRecord(row, "serviceType") || textFromRecord(row, "service_type") || "Обслужване"
    );
    const serial = textFromRecord(row, "serialNumber") || textFromRecord(row, "serial_number");
    const serialLabel = serial ? `SN ${serial}` : "без сериен номер";
    grouped.set(serviceType, [...(grouped.get(serviceType) ?? []), serialLabel]);
  }

  return [...grouped.entries()].map(([serviceType, serials]) => `${serviceType} - ${serials.join(", ")}`);
}

function protocolHistoryActivities(protocol: PortalProtocol) {
  const title = protocolTitle(protocol);
  const payload = protocol.protocolPayload ?? {};

  if (title.toLowerCase().includes("пожарогас")) {
    const rows = protocolPayloadRows(protocol)
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
    const activities = protocolExtinguisherActivities(rows);

    return activities.length ? activities : ["Обслужване на пожарогасители"];
  }

  if (isSubscriptionProtocol(protocol)) {
    return subscriptionProtocolScope(protocol);
  }

  const checks = payload["checks"];
  if (checks && typeof checks === "object" && !Array.isArray(checks)) {
    const selected = Object.entries(checks as Record<string, unknown>)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
    if (selected.length) return selected;
  }

  return [
    textFromRecord(payload, "serviceSystemStatus"),
    textFromRecord(payload, "serviceDefects"),
    textFromRecord(payload, "serviceDeviations"),
  ].filter(Boolean);
}

function protocolPayloadPhotos(protocol: PortalProtocol) {
  const photos = protocol.protocolPayload?.["photos"];
  return Array.isArray(photos) ? photos : [];
}

function truthyRecordKeys(record: unknown) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  return Object.entries(record as Record<string, unknown>)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
    .join(",");
}

function checkedRowsByValue(record: unknown, wantedValue: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  return Object.entries(record as Record<string, unknown>)
    .filter(([, value]) => value === wantedValue)
    .map(([key]) => key)
    .join(",");
}

function protocolPreviewId(protocol: PortalProtocol) {
  return `portal-${protocol.id || protocol.number}`;
}

function protocolPrintHref(protocol: PortalProtocol, embedded = false) {
  const payload = protocol.protocolPayload ?? {};
  const protocolType = textFromRecord(payload, "protocolType") || protocolTypeLabel(protocol.type);
  const slug = protocolPrintSlug(protocolType);
  const params = new URLSearchParams({
    protocolNumber: protocol.number || textFromRecord(payload, "number"),
    date: textFromRecord(payload, "date") || protocol.date,
    client: textFromRecord(payload, "client") || protocol.clientName,
    objectName: textFromRecord(payload, "objectName") || protocol.objectName,
    address: textFromRecord(payload, "address"),
    region: textFromRecord(payload, "region"),
    phone: textFromRecord(payload, "phone"),
    technician: textFromRecord(payload, "technician") || protocol.technician,
    contact:
      textFromRecord(payload, "clientRepresentative") ||
      textFromRecord(payload, "contact"),
    clientRepresentative: textFromRecord(payload, "clientRepresentative"),
    technicianSignature: textFromRecord(payload, "technician") || protocol.technician,
    clientSignature: textFromRecord(payload, "clientRepresentative"),
    previewId: protocolPreviewId(protocol),
    contractReference: textFromRecord(payload, "contractReference"),
    serviceQuality: textFromRecord(payload, "serviceQuality"),
    notes: textFromRecord(payload, "notes"),
    serviceDefects: textFromRecord(payload, "serviceDefects"),
    serviceDeviations: textFromRecord(payload, "serviceDeviations"),
    serviceSystemStatus: textFromRecord(payload, "serviceSystemStatus"),
    nextVisitDate: textFromRecord(payload, "nextVisitDate"),
    personnelFunctions: truthyRecordKeys(payload["personnelFunctions"]),
    goodRows: checkedRowsByValue(payload["subscriptionChecks"], "добро"),
    badRows: checkedRowsByValue(payload["subscriptionChecks"], "лошо"),
  });
  const rows = protocolPayloadRows(protocol);
  if (rows.length) {
    params.set("extinguishers", JSON.stringify(rows));
  }
  if (embedded) {
    params.set("embedded", "1");
  }
  const checks = payload["checks"];
  if (checks && typeof checks === "object" && !Array.isArray(checks)) {
    params.set("checks", JSON.stringify(checks));
  }

  return `/protocols/print/${slug}?${params.toString()}`;
}

function storeProtocolPrintPayload(protocol: PortalProtocol) {
  const payload = protocol.protocolPayload ?? {};

  try {
    localStorage.setItem(
      `firecontrol:protocol-preview:${protocolPreviewId(protocol)}`,
      JSON.stringify({
        technicianSignatureDataUrl: textFromRecord(payload, "technicianSignatureDataUrl"),
        clientSignatureDataUrl: textFromRecord(payload, "clientSignatureDataUrl"),
        extinguisherRows: protocolPayloadRows(protocol),
        photos: protocolPayloadPhotos(protocol),
        savedAt: Date.now(),
      })
    );
  } catch {
    // The protocol can still open; only embedded signatures/photos may be missing.
  }
}

function documentNumberIsInTitle(document: PortalDocument) {
  return Boolean(document.number && document.title.toLowerCase().includes(document.number.toLowerCase()));
}

function libraryItemTone(item: PortalLibraryItem): "green" | "orange" | "blue" | "slate" | "red" {
  if (item.itemType === "protocol") return "blue";
  if (item.document.status === "terminated") return "red";
  if (item.document.status === "signed") return "green";
  if (item.document.requiresSignature) return "orange";
  return "slate";
}

function equipmentListIcon(type: string): { icon: LucideIcon; className: string } {
  switch (type) {
    case "Пожарогасител":
      return { icon: FireExtinguisher, className: "bg-orange-50 text-orange-600" };
    case "Пожароизвестител":
      return { icon: Siren, className: "bg-red-50 text-red-600" };
    case "Пожароизвестителна централа":
      return { icon: PanelTop, className: "bg-sky-50 text-sky-600" };
    case "Пожарен кран":
      return { icon: Waves, className: "bg-cyan-50 text-cyan-600" };
    case "Спринклерна система":
      return { icon: SprayCan, className: "bg-blue-50 text-blue-600" };
    case "Аварийно осветление":
      return { icon: LampWallUp, className: "bg-amber-50 text-amber-600" };
    case "Димоотвеждане":
      return { icon: Fan, className: "bg-slate-100 text-slate-600" };
    case "Евакуационен план":
      return { icon: MapPinned, className: "bg-emerald-50 text-emerald-600" };
    default:
      return { icon: CircleAlert, className: "bg-slate-100 text-slate-500" };
  }
}

function equipmentPublicDetails(item: PortalEquipment) {
  return [
    item.location ? `Място: ${item.location}` : "",
    item.capacity ? `Капацитет: ${item.capacity}` : "",
    [item.brand, item.model].filter(Boolean).join(" ") || "",
    item.serialNumber ? `Сериен номер: ${item.serialNumber}` : "",
    item.nextCheckDate ? `Следваща проверка: ${formatDate(item.nextCheckDate)}` : "",
    item.status ? `Статус: ${item.status}` : "",
  ].filter(Boolean);
}

function badgeClass(tone: "green" | "orange" | "blue" | "slate" | "red") {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "orange") return "border-orange-200 bg-orange-50 text-orange-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "green" | "orange" | "blue" | "slate" | "red";
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${badgeClass(tone)}`}>
      {children}
    </span>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value;
    }
  }

  useEffect(() => {
    prepareCanvas();
    window.addEventListener("resize", prepareCanvas);
    return () => window.removeEventListener("resize", prepareCanvas);
  }, [value]);

  function pointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    const point = pointer(event);
    context?.beginPath();
    context?.moveTo(point.x, point.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const point = pointer(event);
    context?.lineTo(point.x, point.y);
    context?.stroke();
  }

  function finish() {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-32 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerLeave={finish}
      />
      <button type="button" onClick={clear} className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600">
        Изчисти подписа
      </button>
    </div>
  );
}

function documentHtml(document: PortalDocument) {
  const source = documentSource(document);
  const isContract = document.kind === "contract";
  const contractSource = isContract ? document.documentData?.contract : null;
  const terms = documentTerms(document);
  const rows = documentLines(document)
    .map((line, index) => {
      const quantity = Number(line.quantity) || 1;
      const unitPrice = Number(line.unitPrice) || 0;
      const price = Number(line.price);
      const total = Number.isFinite(price) && price > 0 ? price : quantity * unitPrice;
      const visibleDescription = visibleLineDescription(line);
      /*
      const description = String(line.description || "").trim();
      const visibleDescription = description.toLowerCase().includes("услуга по пожарна безопасност според избрания обхват")
        ? ""
        : description;
      */
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(line.name || "Услуга")}</strong>${visibleDescription ? `<br><span>${escapeHtml(visibleDescription)}</span>` : ""}</td>
        <td class="center">${escapeHtml(quantity)}</td>
        <td class="right">${escapeHtml(formatAmount(unitPrice))}</td>
        <td class="right">${escapeHtml(formatAmount(total))}</td>
      </tr>`;
    })
    .join("");
  const totals = documentTotals(document);
  const subject =
    source?.subject ||
    `${documentKindLabel(document.kind)} за услуги, свързани с пожарна безопасност и сервизно обслужване.`;
  const contractorSignatureUrl = contractSource?.contractorSignatureUrl || source?.signatureUrl || "";
  const preparedSignature = contractorSignatureUrl
    ? `<img src="${escapeHtml(contractorSignatureUrl)}" alt="Подпис">`
    : "";
  const acceptedSignatureUrl = document.signatureDataUrl || source?.acceptedSignatureUrl || "";
  const clientSignature = acceptedSignatureUrl
    ? `<div class="signature"><img src="${escapeHtml(acceptedSignatureUrl)}" alt="Подпис"><div>${escapeHtml(document.signedByName || source?.contact || source?.client || "Клиент")}</div>${document.signedAt ? `<small>${escapeHtml(formatDate(document.signedAt))}</small>` : ""}</div>`
    : `<div class="signature empty">Няма положен подпис</div>`;

  return `<!doctype html>
  <html lang="bg">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(document.title)}</title>
    <style>
      @page {
        size: A4;
        margin: 10mm 12mm 12mm;
        @bottom-center {
          content: counter(page);
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #0f172a;
        font-family: Arial, sans-serif;
        font-size: 10.5px;
        line-height: 1.38;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 82mm;
        gap: 10mm;
        border-bottom: 1px solid #cbd5e1;
        padding-bottom: 6mm;
      }
      .logo { width: 38mm; height: auto; display: block; }
      .subtitle {
        margin-top: 2.5mm;
        max-width: 86mm;
        color: #64748b;
        font-size: 9.2px;
        font-weight: 900;
        line-height: 1.35;
        text-transform: uppercase;
      }
      .subject {
        margin-top: 7mm;
        max-width: 106mm;
        border-left: 2px solid #f97316;
        padding-left: 3.5mm;
        color: #334155;
        font-size: 11.2px;
        font-weight: 700;
        line-height: 1.45;
      }
      .meta {
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 4mm;
      }
      .meta h1 {
        margin: 0 0 4mm;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4mm;
        font-size: 25px;
        font-weight: 900;
        line-height: 1;
        text-transform: uppercase;
      }
      .meta-row {
        display: grid;
        grid-template-columns: 18mm minmax(0, 1fr);
        gap: 2mm;
        align-items: center;
        margin-top: 3mm;
      }
      .label {
        color: #64748b;
        font-size: 8.5px;
        font-weight: 900;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .meta strong {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 11px;
        font-weight: 900;
      }
      .party-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10mm;
        margin-top: 5mm;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4.5mm;
      }
      .value {
        margin-top: 1.5mm;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.25;
      }
      p { margin: 1.5mm 0 0; color: #475569; }
      .positions-title { margin-top: 5mm; }
      .positions-title h2 { margin: 0; font-size: 16px; font-weight: 900; }
      .positions-title p { color: #64748b; font-size: 10px; font-weight: 700; }
      table { width: 100%; margin-top: 4mm; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; table-layout: fixed; }
      col:nth-child(1) { width: 5%; }
      col:nth-child(2) { width: 52%; }
      col:nth-child(3) { width: 12%; }
      col:nth-child(4) { width: 15%; }
      col:nth-child(5) { width: 16%; }
      th { background: #f1f5f9; color: #64748b; font-size: 8.5px; font-weight: 900; text-transform: uppercase; text-align: left; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 2.2mm 2mm; vertical-align: middle; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      td strong { font-size: 10.5px; line-height: 1.35; }
      td span { color: #64748b; font-size: 9.5px; font-weight: 600; }
      .center { text-align: center; }
      .right { text-align: right; white-space: nowrap; }
      .after-table {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 54mm;
        gap: 10mm;
        margin-top: 7mm;
        border-top: 1px solid #e2e8f0;
        padding-top: 5mm;
        break-inside: avoid;
      }
      .terms h2 {
        margin: 0 0 4mm;
        color: #64748b;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .term {
        display: grid;
        grid-template-columns: 28mm minmax(0, 1fr);
        gap: 4mm;
        margin-top: 3mm;
      }
      .term div:last-child { color: #334155; font-size: 9.5px; line-height: 1.35; }
      .totals { font-size: 10px; }
      .totals .row { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 1.2mm 0; }
      .totals strong { text-align: right; }
      .totals .total { margin-top: 1.5mm; border-radius: 3px; background: #020617; color: white; padding: 2.3mm 2.5mm; }
      .totals .total strong { font-size: 14px; }
      .valid { color: #64748b; font-size: 9.5px; font-weight: 700; text-align: right; }
      .signatures {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12mm;
        margin-top: 6mm;
        border-top: 1px solid #e2e8f0;
        padding-top: 5mm;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .signatures::before {
        content: "Потвърждение";
        grid-column: 1 / -1;
        margin-bottom: -7mm;
        color: #64748b;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .signature { min-height: 28mm; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 4mm; text-align: center; }
      .signature img { max-height: 22mm; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 2mm; }
      .empty { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-weight: 700; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <img class="logo" src="/firecontrol-header-logo.png" alt="FIREControl">
        <div class="subtitle">Пожарна безопасност, сервиз и абонаментно обслужване</div>
        <div class="subject">${escapeHtml(subject)}</div>
      </div>
      <div class="meta">
        <h1>${escapeHtml(documentKindLabel(document.kind))}</h1>
        <div class="meta-row"><div class="label">Номер</div><strong>${escapeHtml(document.number || source?.number || "")}</strong></div>
        <div class="meta-row"><div class="label">Дата</div><strong>${escapeHtml(formatDate(source?.date || document.publishedAt))}</strong></div>
        ${source?.validUntil ? `<div class="meta-row"><div class="label">Валидност</div><strong>${escapeHtml(formatDate(source.validUntil))}</strong></div>` : ""}
      </div>
    </header>
    <section class="party-grid">
      <div><div class="label">Клиент</div><div class="value">${escapeHtml(source?.client || "")}</div><p>${escapeHtml([source?.contact, source?.phone, source?.email].filter(Boolean).join(" · "))}</p></div>
      <div><div class="label">Обект</div><div class="value">${escapeHtml(source?.object || document.objectName || "")}</div><p>${escapeHtml(source?.address || "")}</p></div>
    </section>
    <section class="positions-title">
      <h2>Офертни позиции</h2>
      <p>Цените са без включен ДДС, освен ако изрично не е посочено друго.</p>
    </section>
    <table><colgroup><col><col><col><col><col></colgroup><thead><tr><th>№</th><th>Услуга</th><th class="center">Количество</th><th class="right">Ед. цена</th><th class="right">Общо</th></tr></thead><tbody>${rows || `<tr><td colspan="5">Няма позиции.</td></tr>`}</tbody></table>
    <section class="after-table">
      <div class="terms">
        <h2>Условия</h2>
        <div class="term"><div class="label">Изпълнение</div><div>${escapeHtml(source?.executionTerm || "Изпълнението се планира след писмено потвърждение на офертата и уточняване на достъп до обекта.")}</div></div>
        <div class="term"><div class="label">Плащане</div><div>${escapeHtml(source?.paymentTerms || "Плащане по банков път след издадена фактура, освен ако страните не договорят друго писмено.")}</div></div>
        <div class="term"><div class="label">Документи</div><div>${escapeHtml(source?.warrantyTerms || "Офертата включва документиране на извършените дейности съгласно приложимите изисквания за пожарна безопасност.")}</div></div>
        <div class="term"><div class="label">Бележки</div><div>${escapeHtml(source?.notes || "Цените са ориентировъчни и могат да бъдат прецизирани след оглед и потвърждение на обхвата.")}</div></div>
      </div>
      <div class="totals">
        <div class="row"><span>Междинна сума</span><strong>${escapeHtml(formatAmount(totals.subtotal))}</strong></div>
        <div class="row"><span>ДДС 20%</span><strong>${escapeHtml(formatAmount(totals.vat))}</strong></div>
        <div class="row total"><span>Общо</span><strong>${escapeHtml(formatAmount(totals.total))}</strong></div>
        ${source?.validUntil ? `<p class="valid">Валидна до ${escapeHtml(formatDate(source.validUntil))}</p>` : ""}
      </div>
    </section>
    <section class="signatures">
      <div><div class="label">Изготвил:</div><div class="name">${escapeHtml(source?.preparedBy || "FireControl")}</div><div class="signature ${preparedSignature ? "" : "empty"}">${preparedSignature || escapeHtml(source?.preparedBy || "FireControl")}</div></div>
      <div><div class="label">Приел офертата:</div><div class="name">${escapeHtml(source?.contact || source?.client || "Клиент")}</div>${clientSignature}</div>
    </section>
  </body>
  </html>`;
}

function openPdfPrintWindow(document: PortalDocument) {
  const html = documentHtml(document);
  const printWindow = window.open("about:blank", "_blank", "width=900,height=1100");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

function protocolHtml(protocol: PortalProtocol, client: PortalClient) {
  return `<!doctype html>
  <html lang="bg">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(protocolTitle(protocol))}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
      header { display: grid; grid-template-columns: 1fr 55mm; gap: 12mm; border-bottom: 1px solid #dbe4ef; padding-bottom: 10mm; }
      .brand { font-size: 24pt; font-weight: 900; letter-spacing: -0.5px; }
      .brand span { color: #ea580c; }
      .label { color: #64748b; font-size: 8pt; font-weight: 800; text-transform: uppercase; }
      .meta, .box { border: 1px solid #dbe4ef; border-radius: 8px; padding: 6mm; background: #f8fafc; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 10mm; }
      .value { margin-top: 2mm; font-size: 14pt; font-weight: 900; }
      .section { margin-top: 10mm; }
      p { margin: 2mm 0 0; color: #334155; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 18mm; }
      .signature { min-height: 28mm; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 4mm; color: #94a3b8; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <div class="brand">FIRE<span>Control</span></div>
        <div class="label">Протокол за пожарна безопасност и сервизно обслужване</div>
      </div>
      <div class="meta">
        <div class="label">Номер</div><strong>${escapeHtml(protocol.number || protocol.id)}</strong><br><br>
        <div class="label">Дата</div><strong>${escapeHtml(formatDate(protocol.date))}</strong>
      </div>
    </header>
    <section class="grid">
      <div class="box"><div class="label">Клиент</div><div class="value">${escapeHtml(client.name || protocol.clientName)}</div><p>${escapeHtml(client.phone)}<br>${escapeHtml(client.email)}</p></div>
      <div class="box"><div class="label">Обект</div><div class="value">${escapeHtml(protocol.objectName || protocol.objectCode)}</div><p>${escapeHtml(protocol.type)}<br>${escapeHtml(protocol.status)}</p></div>
    </section>
    <section class="section box">
      <div class="label">Изпълнител</div>
      <div class="value">${escapeHtml(protocol.technician || "FireControl")}</div>
      <p>Статус: ${escapeHtml(protocolStatus(protocol))}</p>
    </section>
    <section class="signatures">
      <div><div class="label">Изготвил</div><div class="signature">${escapeHtml(protocol.technician || "FireControl")}</div></div>
      <div><div class="label">Клиент</div><div class="signature">Подпис</div></div>
    </section>
  </body>
  </html>`;
}

function openProtocolPrintWindow(protocol: PortalProtocol, client: PortalClient) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(protocolHtml(protocol, client));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function DocumentPreview({
  document,
  signedByName,
  signatureDataUrl,
  onSignatureChange,
}: {
  document: PortalDocument;
  signedByName: string;
  signatureDataUrl: string;
  onSignatureChange: (value: string) => void;
}) {
  const source = documentSource(document);
  const lines = documentLines(document);
  const totals = documentTotals(document);
  const terms = documentTerms(document);
  const isContract = document.kind === "contract";
  const contractSource = isContract ? document.documentData?.contract : null;
  const acceptedSignatureUrl = document.signatureDataUrl || source?.acceptedSignatureUrl || signatureDataUrl;
  const clientName = document.signedByName || signedByName || source?.contact || source?.client || "Клиент";
  const contractorSignatureUrl = contractSource?.contractorSignatureUrl || source?.signatureUrl || "";
  const canSign = document.status !== "signed";

  return (
    <article className="mx-auto w-full max-w-[210mm] rounded-[6px] bg-white px-6 py-7 shadow-sm ring-1 ring-slate-200 sm:px-10 md:px-[15mm] md:py-[14mm]">
      <header className="grid gap-7 border-b border-slate-200 pb-7 md:grid-cols-[minmax(0,1fr)_82mm] md:items-start">
        <div className="min-w-0">
          <img src="/firecontrol-header-logo.png" alt="FIREControl" className="h-auto w-[43mm] max-w-full object-contain" />
          <p className="mt-3 max-w-[92mm] text-[10.5px] font-black uppercase leading-4 tracking-wide text-slate-500">
            Пожарна безопасност, сервиз и абонаментно обслужване
          </p>
          <div className="mt-8 max-w-[110mm] border-l-2 border-orange-500 py-1 pl-4 text-[13px] font-semibold leading-6 text-slate-700">
            {documentSubject(document)}
          </div>
        </div>
        <div className="min-w-0 rounded-[4px] border border-slate-200 bg-slate-50/70 p-5">
          <div className="border-b border-slate-200 pb-4">
            <h1 className="text-[30px] font-black uppercase leading-none tracking-tight text-slate-950">
              {documentKindLabel(document.kind)}
            </h1>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
              <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Номер</span>
              <strong className="min-w-0 whitespace-nowrap text-[11.5px] font-black tracking-[-0.01em] text-slate-900">
                {document.number || source?.number}
              </strong>
            </div>
            <div className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
              <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Дата</span>
              <strong className="text-[12.5px] font-bold text-slate-800">{formatDate(source?.date || document.publishedAt)}</strong>
            </div>
            {contractSource?.offerNumber ? (
              <div className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Оферта</span>
                <strong className="min-w-0 text-[12.5px] font-bold text-slate-800 [overflow-wrap:anywhere]">{contractSource.offerNumber}</strong>
              </div>
            ) : null}
            {!isContract && source?.validUntil ? (
              <div className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Валидност</span>
                <strong className="text-[12.5px] font-bold text-slate-800">{formatDate(source.validUntil)}</strong>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mt-7 grid gap-8 border-b border-slate-200 pb-7 md:grid-cols-2">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Възложител</h2>
          <div className="mt-3 space-y-1.5">
            <div className="text-xl font-black leading-7 text-slate-950">{source?.client || document.title}</div>
            {source?.contact ? <div className="text-sm font-bold leading-6 text-slate-700">{source.contact}</div> : null}
            {source?.phone ? (
              <div className="text-sm font-semibold leading-6 text-slate-600">
                <ContactLink kind="phone" value={source.phone} />
              </div>
            ) : null}
            {source?.email ? (
              <div className="text-sm font-semibold leading-6 text-slate-600">
                <ContactLink kind="email" value={source.email} />
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Обект и изпълнител</h2>
          <div className="mt-3 space-y-1.5">
            <div className="text-xl font-black leading-7 text-slate-950">{source?.object || document.objectName || "Обект"}</div>
            {source?.address ? <div className="text-sm font-bold leading-6 text-slate-700">{source.address}</div> : null}
            <div className="text-sm font-semibold leading-6 text-slate-600">{source?.preparedBy || "FireControl"}</div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <h2 className="text-lg font-black">{isContract ? "Договорени услуги" : "Офертни позиции"}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {isContract
              ? "Услугите са попълнени от приетата оферта."
              : "Цените са без включен ДДС, освен ако изрично не е посочено друго."}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-300">
          <table className="w-full table-fixed border-collapse text-[12px]">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[52%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 text-left">№</th>
                <th className="px-3 py-3 text-left">Услуга</th>
                <th className="px-3 py-3 text-center">Количество</th>
                <th className="px-3 py-3 text-right">Ед. цена</th>
                <th className="px-3 py-3 text-right">Общо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.length ? (
                lines.map((line, index) => {
                  const quantity = Number(line.quantity) || 1;
                  const unitPrice = Number(line.unitPrice) || 0;
                  const price = Number(line.price);
                  const total = Number.isFinite(price) && price > 0 ? price : quantity * unitPrice;
                  const note = visibleLineDescription(line);

                  return (
                    <tr key={line.id || index} className="align-middle">
                      <td className="px-2 py-2.5 align-middle font-black text-slate-400">{index + 1}</td>
                      <td className="px-2 py-2.5 align-middle">
                        <div className="text-[12.5px] font-black leading-5 text-slate-950">{line.name || "Услуга"}</div>
                        {note ? <div className="mt-0.5 text-[10.5px] font-semibold leading-4 text-slate-500">{note}</div> : null}
                      </td>
                      <td className="px-2 py-2.5 align-middle text-center text-[12px] font-bold">{quantity}</td>
                      <td className="px-2 py-2.5 align-middle text-right text-[12px] font-bold">{formatAmount(unitPrice)}</td>
                      <td className="px-2 py-2.5 align-middle text-right text-[12px] font-black text-slate-950">{formatAmount(total)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center font-bold text-slate-400">
                    Няма позиции за визуализация.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto w-full max-w-[250px] text-[12px]">
          <div className="grid grid-cols-2 gap-4 py-1.5">
            <div className="font-bold text-slate-500">Междинна сума</div>
            <strong className="text-right font-bold text-slate-800">{formatAmount(totals.subtotal)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-4 py-1.5">
            <div className="font-bold text-slate-500">ДДС 20%</div>
            <strong className="text-right font-bold text-slate-800">{formatAmount(totals.vat)}</strong>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 rounded-[4px] bg-slate-950 px-3 py-3 text-white">
            <div className="text-[13px] font-black uppercase">Общо</div>
            <strong className="text-right text-[17px] font-black">{formatAmount(totals.total)}</strong>
          </div>
        </div>
      </section>

      <section className="mt-7 border-t border-slate-200 pt-6">
        <div className="grid gap-3">
          {terms.map((term, index) => (
            <div key={term.id || term.title || index} className="grid gap-4 rounded-xl border border-slate-100 bg-slate-50/40 p-4 md:grid-cols-[42px_minmax(0,1fr)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-slate-400 shadow-sm">
                {index + 1}
              </div>
              <div className="min-w-0">
                <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">{term.title || "Условие"}</h2>
                <div className="mt-1 whitespace-pre-line text-sm font-medium leading-6 text-slate-800">{term.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {canSign ? (
        <div className="mt-8 rounded-xl border border-orange-100 bg-orange-50/70 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
          С подписването потвърждавате, че сте прегледали документа и го приемате електронно през клиентския портал.
        </div>
      ) : null}

      <footer className="mt-6 grid gap-8 border-t border-slate-200 pt-6 md:grid-cols-2">
        <div>
          <div className="text-sm font-bold">Изпълнител:</div>
          <div className="mt-2 font-black">{source?.preparedBy || "FireControl"}</div>
          <div className="mt-4 h-32 rounded-xl border border-dashed border-slate-300 p-3">
            {contractorSignatureUrl ? (
              <img src={contractorSignatureUrl} alt="Подпис" className="h-full max-w-full object-contain" />
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-sm font-bold">{isContract ? "Клиент:" : "Приел офертата:"}</div>
          <div className="mt-2 font-black">{document.signedByName || source?.contact || source?.client || "Клиент"}</div>
          <div className={canSign ? "mt-4" : "mt-4 h-32 rounded-xl border border-dashed border-slate-300 p-3"}>
            {canSign ? (
              <SignaturePad value={signatureDataUrl} onChange={onSignatureChange} />
            ) : acceptedSignatureUrl ? (
              <img src={acceptedSignatureUrl} alt="Подпис" className="h-full max-w-full object-contain" />
            ) : null}
          </div>
          {document.signedAt ? <div className="mt-2 text-sm font-bold text-slate-500">{formatDate(document.signedAt)}</div> : null}
        </div>
      </footer>
    </article>
  );
}
/*
          ) : null}
        </div>
      </div>

      <div className="mt-7 grid gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Клиент</div>
          <div className="mt-1 text-lg font-black">{source?.client || document.title}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {[source?.contact, source?.phone, source?.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Обект</div>
          <div className="mt-1 text-lg font-black">{source?.object || document.objectName || "Обект"}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">{source?.address}</div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3">№</th>
              <th className="px-3 py-3">Услуга</th>
              <th className="px-3 py-3">Период</th>
              <th className="px-3 py-3 text-right">Стойност</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length ? (
              lines.map((line, index) => {
                const quantity = Number(line.quantity) || 1;
                const unitPrice = Number(line.unitPrice) || 0;
                const price = Number(line.price);
                const total = Number.isFinite(price) && price > 0 ? price : quantity * unitPrice;
                return (
                  <tr key={line.id || index}>
                    <td className="px-3 py-4 font-black text-slate-400">{index + 1}</td>
                    <td className="px-3 py-4">
                      <div className="font-black">{line.name || "Услуга"}</div>
                      {line.description ? <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">{line.description}</div> : null}
                    </td>
                    <td className="px-3 py-4 font-bold text-slate-600">{line.period || line.periodicity}</td>
                    <td className="px-3 py-4 text-right font-black">{formatAmount(total)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center font-bold text-slate-400">
                  Няма позиции за визуализация.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {terms.slice(0, 4).map((term) => (
            <div key={term.id || term.title} className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-400">{term.title || "Условие"}</div>
              <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{term.text}</div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-2 border-b border-slate-200">
            <span className="p-4 font-bold text-slate-500">Междинна сума</span>
            <strong className="p-4 text-right">{formatAmount(totals.subtotal)}</strong>
          </div>
          <div className="grid grid-cols-2 border-b border-slate-200">
            <span className="p-4 font-bold text-slate-500">ДДС</span>
            <strong className="p-4 text-right">{formatAmount(totals.vat)}</strong>
          </div>
          <div className="grid grid-cols-2 bg-slate-950 text-white">
            <span className="p-4 font-black">Общо</span>
            <strong className="p-4 text-right">{formatAmount(totals.total)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

*/
function ProtocolPreview({ protocol, client }: { protocol: PortalProtocol; client: PortalClient }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div>
          <div className="text-3xl font-black tracking-tight">
            FIRE<span className="text-orange-600">Control</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Протокол за пожарна безопасност и сервизно обслужване.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Номер</div>
          <div className="mt-1 font-black">{protocol.number || protocol.id}</div>
          <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
          <div className="mt-1 font-black">{formatDate(protocol.date)}</div>
        </div>
      </div>

      <div className="mt-7 grid gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Клиент</div>
          <div className="mt-1 text-lg font-black">{client.name || protocol.clientName}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {[client.phone, client.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Обект</div>
          <div className="mt-1 text-lg font-black">{protocol.objectName || protocol.objectCode || "Обект"}</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {protocol.type || "Сервизен протокол"}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Статус</div>
          <div className="mt-1 font-black">{protocolStatus(protocol)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Техник</div>
          <div className="mt-1 font-black">{protocol.technician || "FireControl"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Тип</div>
          <div className="mt-1 font-black">{protocol.type || "Протокол"}</div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<PortalData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signState, setSignState] = useState<"idle" | "saving" | "error">("idle");
  const [signError, setSignError] = useState("");
  const [openLocationEquipmentIds, setOpenLocationEquipmentIds] = useState<string[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"upcoming" | "past">("upcoming");

  async function loadPortal() {
    const response = await fetch(`/api/client-portal/${token}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Порталът не може да се зареди.");
    setData(payload);
  }

  useEffect(() => {
    if (!token) return;
    let alive = true;
    async function run() {
      try {
        setLoadState("loading");
        await loadPortal();
        if (alive) setLoadState("ready");
      } catch (error) {
        if (!alive) return;
        setErrorMessage(error instanceof Error ? error.message : "Порталът не може да се зареди.");
        setLoadState("error");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;

    async function refreshPortal() {
      try {
        await loadPortal();
        setLoadState("ready");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Порталът не може да се зареди.");
        setLoadState("error");
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshPortal();
      }
    }

    window.addEventListener("focus", refreshPortal);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshPortal);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [token]);

  const documentsForSignature = useMemo(() => data?.documents.filter((document) => document.requiresSignature) || [], [data]);
  const visibleDocuments = data?.documents || [];
  const libraryItems = useMemo<PortalLibraryItem[]>(() => {
    if (!data) return [];
    return [
      ...data.documents.map((document) => ({
        id: `document-${document.id}`,
        itemType: "document" as const,
        sortDate: document.publishedAt,
        document,
      })),
      ...data.protocols.map((protocol) => ({
        id: `protocol-${protocol.id}`,
        itemType: "protocol" as const,
        sortDate: protocol.date,
        protocol,
      })),
    ].sort((a, b) => {
      const first = new Date(a.sortDate || 0).getTime() || 0;
      const second = new Date(b.sortDate || 0).getTime() || 0;
      return second - first;
    });
  }, [data]);
  const upcomingTasks = useMemo(() => data?.tasks.filter((task) => !taskIsDone(task)) || [], [data]);
  const completedTasks = useMemo(() => data?.tasks.filter(taskIsDone) || [], [data]);
  const protocolVisitSummary = useMemo(() => {
    const protocols = data?.protocols ?? [];
    const lastProtocol = [...protocols]
      .filter((protocol) => dateTimestamp(protocol.date))
      .sort((a, b) => dateTimestamp(b.date) - dateTimestamp(a.date))[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextVisitDate = upcomingTasks
      .map((task) => task.dueDate)
      .filter((value) => value && dateTimestamp(value) >= today.getTime())
      .sort((a, b) => dateTimestamp(a) - dateTimestamp(b))[0];

    return {
      lastVisitDate: lastProtocol?.date || "",
      nextVisitDate: nextVisitDate || "",
    };
  }, [data, upcomingTasks]);
  const upcomingTimelineTasks = useMemo(
    () =>
      upcomingTasks
        .map((task) => ({
          ...task,
          timelineDate: task.dueDate,
        }))
        .filter((task) => task.timelineDate || task.title)
        .sort((a, b) => {
          const aTime = a.timelineDate ? new Date(a.timelineDate).getTime() : 0;
          const bTime = b.timelineDate ? new Date(b.timelineDate).getTime() : 0;
          return aTime - bTime;
        })
        .slice(0, 10),
    [upcomingTasks]
  );
  const pastProtocolTimeline = useMemo(
    () =>
      (data?.protocols ?? [])
        .filter((protocol) => protocol.date || protocolTitle(protocol))
        .map((protocol) => ({
          id: protocol.id || protocol.number,
          protocol,
          timelineDate: protocol.date,
          title: protocolTitle(protocol),
          objectName: protocol.objectName,
          activities: protocolHistoryActivities(protocol),
        }))
        .sort((a, b) => dateTimestamp(b.timelineDate) - dateTimestamp(a.timelineDate))
        .slice(0, 10),
    [data]
  );
  const visibleTimelineCount = scheduleMode === "upcoming" ? upcomingTimelineTasks.length : pastProtocolTimeline.length;
  const selectedDocument = visibleDocuments.find((document) => document.id === selectedDocumentId) || null;
  const selectedProtocol = data?.protocols.find((protocol) => protocol.id === selectedProtocolId) || null;

  function openDocument(document: PortalDocument) {
    setSelectedDocumentId(document.id);
    setSelectedProtocolId("");
    setSignedByName(data?.client.contactPerson || data?.client.name || "");
    setSignatureDataUrl("");
    setSignState("idle");
    setSignError("");
  }

  function openProtocol(protocol: PortalProtocol) {
    storeProtocolPrintPayload(protocol);
    setSelectedProtocolId(protocol.id);
    setSelectedDocumentId("");
    setSignState("idle");
    setSignError("");
  }

  function openLibraryItem(item: PortalLibraryItem) {
    if (item.itemType === "protocol") {
      openProtocol(item.protocol);
    } else {
      openDocument(item.document);
    }
  }

  function downloadDocument(document: PortalDocument) {
    openPdfPrintWindow(document);
  }

  function downloadLibraryItem(item: PortalLibraryItem) {
    if (!data) return;
    if (item.itemType === "protocol") {
      storeProtocolPrintPayload(item.protocol);
      window.open(protocolPrintHref(item.protocol), "_blank", "noopener,noreferrer");
    } else {
      downloadDocument(item.document);
    }
  }

  function toggleLocationEquipment(locationId: string) {
    setOpenLocationEquipmentIds((current) =>
      current.includes(locationId)
        ? current.filter((id) => id !== locationId)
        : [...current, locationId]
    );
  }

  async function signDocument() {
    if (!selectedDocument || !token) return;
    try {
      setSignState("saving");
      setSignError("");
      const response = await fetch(`/api/client-portal/${token}/documents/${selectedDocument.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedByName, signatureDataUrl }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Документът не беше подписан.");
      await loadPortal();
      setSignState("idle");
    } catch (error) {
      setSignState("error");
      setSignError(error instanceof Error ? error.message : "Документът не беше подписан.");
    }
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_center,#fff7ed_0%,#f8fafc_42%,#eef2f7_100%)] px-4">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-orange-200 bg-white shadow-[0_18px_45px_rgba(234,88,12,0.14)]" />
            <div className="absolute inset-2 animate-ping rounded-full bg-orange-100/70" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-[0_12px_28px_rgba(234,88,12,0.28)]">
              <Flame size={28} className="animate-pulse" />
            </div>
          </div>
          <div className="mt-5 text-lg font-extrabold text-slate-950">FireControl</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">
            Зареждане на клиентския портал
          </div>
        </div>
      </main>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-red-500" size={32} />
          <h1 className="mt-4 text-xl font-black text-slate-950">Порталът не е достъпен</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-950">
      <header className="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <img
            src="/firecontrol-header-logo.png"
            alt="FIREControl"
            className="h-auto w-[190px] max-w-full object-contain object-left sm:w-[235px]"
          />
          <div className="max-w-2xl md:text-right">
            <h1 className="text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl">
              Клиентски портал
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.055)]">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="p-6 md:p-8">
              <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                <ShieldCheck size={13} className="mr-1 text-orange-300" />
                Активен портал
              </span>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight md:text-4xl">{data.client.name}</h1>
              <div className="mt-4 flex max-w-3xl flex-wrap gap-2">
                {data.client.contactPerson ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700">
                    <UserRound size={16} className="text-orange-500" />
                    {data.client.contactPerson}
                  </span>
                ) : null}
                {data.client.phone ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700">
                    <Phone size={16} className="text-orange-500" />
                    <ContactLink kind="phone" value={data.client.phone} />
                  </span>
                ) : null}
                {data.client.email ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700">
                    <Mail size={16} className="text-orange-500" />
                    <ContactLink kind="email" value={data.client.email} />
                  </span>
                ) : null}
                {data.client.address ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700">
                    <MapPin size={16} className="text-orange-500" />
                    {data.client.address}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                Документен център, обслужвани обекти, предстоящи дейности и сервизна история.
              </p>
            </div>
            <div className="border-t border-slate-200 bg-slate-50/70 p-6 lg:border-l lg:border-t-0">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Последно посещение
                    </div>
                    <div className="mt-1 text-lg font-extrabold text-slate-950">
                      {protocolVisitSummary.lastVisitDate
                        ? formatDate(protocolVisitSummary.lastVisitDate)
                        : "Няма записан протокол"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <Clock3 size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Следващо посещение
                    </div>
                    <div className="mt-1 text-lg font-extrabold text-slate-950">
                      {protocolVisitSummary.nextVisitDate
                        ? formatDate(protocolVisitSummary.nextVisitDate)
                        : "Ще бъде насрочено"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3"><div className="text-xs font-bold text-slate-400">Документи</div><div className="mt-1 text-2xl font-extrabold">{libraryItems.length}</div></div>
                <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3"><div className="text-xs font-bold text-slate-400">Обекти</div><div className="mt-1 text-2xl font-extrabold">{data.locations.length}</div></div>
                <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3"><div className="text-xs font-bold text-slate-400">Предстоящи</div><div className="mt-1 text-2xl font-extrabold">{upcomingTasks.length}</div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[22px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.045)]">
          <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold">Документи</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Оферти, договори и протоколи, подредени по дата.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="slate">
                {countLabel(
                  data.documents.filter((document) => document.kind === "offer").length,
                  "оферта",
                  "оферти"
                )}
              </Badge>
              <Badge tone="blue">
                {countLabel(
                  data.documents.filter((document) => document.kind === "contract").length,
                  "договор",
                  "договори"
                )}
              </Badge>
              <Badge tone="slate">
                {countLabel(data.protocols.length, "протокол", "протоколи")}
              </Badge>
              <Badge tone="orange">
                {countLabel(documentsForSignature.length, "за подпис", "за подпис")}
              </Badge>
            </div>
          </div>
          </div>
          <div className="hidden border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[170px_minmax(300px,1.2fr)_220px_170px_170px] md:items-center md:gap-4">
            <div>Тип</div>
            <div>Документ</div>
            <div>Дата и обект</div>
            <div>Статус</div>
            <div className="text-right">Действия</div>
          </div>
          <div className="border-t border-slate-200 md:border-t-0">
            {libraryItems.length ? libraryItems.map((item) => (
              <div key={item.id} className="grid gap-4 border-b border-slate-100 px-5 py-4 transition last:border-b-0 hover:bg-slate-50/80 md:grid-cols-[170px_minmax(300px,1.2fr)_220px_170px_170px] md:items-start md:gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    {item.itemType === "protocol" ? <FileCheck2 size={17} /> : <FileText size={17} />}
                  </div>
                  <span className="text-sm font-bold text-slate-700">{libraryItemTypeLabel(item)}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold leading-6 text-slate-950">{libraryItemTitle(item)}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                    {item.itemType === "document" && item.document.number && !documentNumberIsInTitle(item.document) ? <span>№ {item.document.number}</span> : null}
                    {item.itemType === "protocol" && item.protocol.number ? <span>№ {item.protocol.number}</span> : null}
                    {item.itemType === "protocol" && item.protocol.technician ? <span>Техник: {item.protocol.technician}</span> : null}
                  </div>
                </div>
                <div className="min-w-0 text-sm font-bold text-slate-600">
                  <div>{formatDate(libraryItemDate(item))}</div>
                  {libraryItemObjectName(item) ? <div className="mt-1 truncate text-xs text-slate-400">{libraryItemObjectName(item)}</div> : null}
                </div>
                <div>
                  <Badge tone={libraryItemTone(item)}>{libraryItemStatus(item)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={() => openLibraryItem(item)}
                    title="Отвори документа"
                    aria-label="Отвори документа"
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-white transition ${
                      libraryItemNeedsSignature(item)
                        ? "bg-orange-500 hover:bg-orange-600"
                        : "bg-slate-950 hover:bg-slate-800"
                    }`}
                  >
                    {libraryItemNeedsSignature(item) ? <PencilLine size={16} /> : <ExternalLink size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadLibraryItem(item)}
                    title="Изтегли като PDF"
                    aria-label="Изтегли като PDF"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-orange-200 hover:bg-orange-50"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400">
                Тук ще се появят оферти, договори и протоколи.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Обекти</h2>
              <Badge>{data.locations.length}</Badge>
            </div>
            <div className="mt-4 space-y-4">
              {data.locations.length ? data.locations.map((location) => {
                const equipmentOpen = openLocationEquipmentIds.includes(location.id);
                const serviceItems = splitServiceList(location.service);

                return (
                <div key={location.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/50">
                  <div className={`${equipmentOpen ? "border-b border-slate-100" : ""} p-4`}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600">
                        <Building2 size={19} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-extrabold text-slate-950">{location.name}</div>
                          {location.objectType ? <Badge tone="slate">{location.objectType}</Badge> : null}
                        </div>
                        {location.address ? (
                          <div className="mt-2 flex gap-2 text-sm font-semibold text-slate-500">
                            <MapPin size={16} className="mt-0.5 shrink-0 text-orange-500" />
                            <span>{location.address}</span>
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleLocationEquipment(location.id)}
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                        aria-expanded={equipmentOpen}
                        aria-label={equipmentOpen ? "Скрий оборудването" : "Покажи оборудването"}
                        title={equipmentOpen ? "Скрий оборудването" : "Покажи оборудването"}
                      >
                        {location.equipment.length}
                        <ChevronDown
                          size={15}
                          className={`transition ${equipmentOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {serviceItems.length ? (
                      <ul className="mt-3 space-y-1.5 text-sm font-semibold leading-6 text-slate-500">
                        {serviceItems.map((service) => (
                          <li key={service} className="flex gap-2">
                            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                            <span>{service}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {equipmentOpen ? (
                  <div className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Оборудване
                      </div>
                      <span className="text-xs font-bold text-slate-400">
                        {location.equipment.length}
                      </span>
                    </div>
                    {location.equipment.length ? (
                      <div className="divide-y divide-slate-100">
                        {location.equipment.map((item) => {
                          const { icon: EquipmentIcon, className } = equipmentListIcon(item.type);
                          const details = equipmentPublicDetails(item);

                          return (
                            <div key={item.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${className}`}>
                                <EquipmentIcon size={17} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-extrabold text-slate-900">{item.name || item.type || "Оборудване"}</div>
                                {details.length ? (
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-400">
                                    {details.map((detail) => (
                                      <span key={detail}>{detail}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm font-bold text-slate-400">
                        Няма добавено оборудване към този обект.
                      </div>
                    )}
                  </div>
                  ) : null}
                </div>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-400">Няма добавени обекти.</div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-extrabold">График и история</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {scheduleMode === "upcoming"
                    ? "Предстоящи посещения и сервизни задачи."
                    : "Съставени протоколи и дейностите в тях."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                  {(["upcoming", "past"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScheduleMode(mode)}
                      className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                        scheduleMode === mode
                          ? "bg-white text-orange-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {mode === "upcoming" ? "Предстоящи" : "Минали"}
                    </button>
                  ))}
                </div>
                <Badge tone="blue">{visibleTimelineCount}</Badge>
              </div>
            </div>
            <div className="mt-4">
              {scheduleMode === "upcoming" && upcomingTimelineTasks.length ? (
                <div className="relative pl-8">
                  <div className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-orange-300 via-slate-200 to-slate-100" />
                  <div className="divide-y divide-slate-100">
                    {upcomingTimelineTasks.map((task) => {
                      const scopeLines = subscriptionTaskScope(task, protocolVisitSummary.lastVisitDate);

                      return (
                        <div key={`upcoming-${task.id}`} className="relative py-4 first:pt-1 last:pb-1">
                          <div className="absolute -left-8 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-orange-200 bg-orange-50 text-orange-600">
                            <Clock3 size={14} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="orange">Предстояща</Badge>
                            {task.timelineDate ? (
                              <span className="text-xs font-bold uppercase text-slate-400">
                                {formatDate(task.timelineDate)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-base font-extrabold leading-snug text-slate-950">
                            {portalTaskTitle(task)}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-500">
                            {task.objectName || task.objectCode ? (
                              <span className="inline-flex items-center gap-2">
                                <Building2 size={15} className="shrink-0 text-slate-400" />
                                {task.objectName || task.objectCode}
                              </span>
                            ) : null}
                            {task.taskType ? (
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                {task.taskType}
                              </span>
                            ) : null}
                          </div>
                          {scopeLines.length ? (
                            <div className="mt-3 space-y-1.5 text-sm font-semibold leading-5 text-slate-500">
                              {scopeLines.map((scope) => (
                                <div key={scope} className="flex gap-2">
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                                  <span>{scope}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {scheduleMode === "past" && pastProtocolTimeline.length ? (
                <div className="relative pl-8">
                  <div className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-emerald-300 via-slate-200 to-slate-100" />
                  <div className="divide-y divide-slate-100">
                    {pastProtocolTimeline.map((item) => {
                      const activities = item.activities.slice(0, 6);
                      const extraCount = Math.max(item.activities.length - activities.length, 0);

                      return (
                        <div key={`past-${item.id}`} className="relative py-4 first:pt-1 last:pb-1">
                          <div className="absolute -left-8 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-emerald-600">
                            <CheckCircle2 size={14} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="green">Минал протокол</Badge>
                            {item.timelineDate ? (
                              <span className="text-xs font-bold uppercase text-slate-400">
                                {formatDate(item.timelineDate)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-base font-extrabold leading-snug text-slate-950">
                                {item.title}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-500">
                                {item.objectName ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Building2 size={15} className="shrink-0 text-slate-400" />
                                    {item.objectName}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openProtocol(item.protocol)}
                              className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-orange-200 hover:text-orange-700"
                            >
                              Отвори протокол
                            </button>
                          </div>
                          {activities.length ? (
                            <div className="mt-3 space-y-1.5 text-sm font-semibold leading-5 text-slate-500">
                              {activities.map((activity) => (
                                <div key={activity} className="flex gap-2">
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                                  <span>{activity}</span>
                                </div>
                              ))}
                              {extraCount ? (
                                <div className="text-sm font-bold text-slate-400">+ още {extraCount}</div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {visibleTimelineCount === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <Clock3 size={20} />
                  </div>
                  <div className="mt-3 text-sm font-bold text-slate-500">
                    {scheduleMode === "upcoming"
                      ? "Все още няма предстоящи дейности."
                      : "Все още няма съставени протоколи в историята."}
                  </div>
                </div>
              ) : (
                null
              )}
            </div>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 py-8">
          <div className="flex flex-col gap-5 text-sm text-slate-500 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <img
                src="/firecontrol-header-logo.png"
                alt="FireControl"
                className="h-auto w-32 object-contain object-left"
              />
              <p className="mt-2 font-semibold leading-6">
                FireControl защитава това, което е най-ценно за вас - хората, бизнеса и инвестициите ви.
                Доверете се на доказан експерт в цялостните решения за пожарна безопасност.
              </p>
            </div>
            <div className="flex flex-col gap-2 font-bold text-slate-700 md:items-end">
              <a
                href="mailto:office@firecontrol.bg"
                className="inline-flex items-center gap-2 transition hover:text-orange-600"
              >
                <Mail size={16} className="text-orange-500" />
                office@firecontrol.bg
              </a>
              <a
                href="https://firecontrol.bg/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-orange-600"
              >
                <ExternalLink size={16} className="text-orange-500" />
                firecontrol.bg
              </a>
              <a
                href="tel:+359896089991"
                className="inline-flex items-center gap-2 transition hover:text-orange-600"
              >
                <Phone size={16} className="text-orange-500" />
                +359 89 608 9991
              </a>
              <a
                href="https://www.google.com/maps/search/?api=1&query=%D0%B3%D1%80.%20%D0%A8%D1%83%D0%BC%D0%B5%D0%BD%2C%20%D1%83%D0%BB.%20%D0%92%D0%BB%D0%B0%D0%B4%D0%B0%D0%B9%D1%81%D0%BA%D0%BE%20%D0%B2%D1%8A%D1%81%D1%82%D0%B0%D0%BD%D0%B8%D0%B5%20%E2%84%96152"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 transition hover:text-orange-600"
              >
                <MapPin size={16} className="text-orange-500" />
                гр. Шумен, ул. Владайско въстание №152
              </a>
            </div>
          </div>
        </footer>
      </div>

      {selectedDocument ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-6">
          <div className="mx-auto max-w-5xl rounded-[28px] bg-[#f3f7fb] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Badge tone={selectedDocument.status === "terminated" ? "red" : selectedDocument.status === "signed" ? "green" : "orange"}>{documentStatus(selectedDocument)}</Badge>
                <h2 className="mt-2 text-xl font-black">{selectedDocument.title}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => downloadDocument(selectedDocument)} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                  <Download size={18} />
                  PDF
                </button>
                <button type="button" onClick={() => setSelectedDocumentId("")} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            <DocumentPreview
              document={selectedDocument}
              signedByName={signedByName}
              signatureDataUrl={signatureDataUrl}
              onSignatureChange={setSignatureDataUrl}
            />

            {selectedDocument.status !== "signed" ? (
              <div className="mx-auto mt-4 flex w-full max-w-[210mm] flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                {signState === "error" ? (
                  <div className="text-sm font-bold text-red-700">{signError}</div>
                ) : (
                  <div className="text-sm font-semibold text-slate-500">Подпишете в полето „Клиент“ в документа.</div>
                )}
                <button type="button" onClick={signDocument} disabled={signState === "saving" || !signedByName.trim() || !signatureDataUrl} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {signState === "saving" ? <Loader2 size={18} className="animate-spin" /> : <FileSignature size={18} />}
                  Подпиши документа
                </button>
              </div>
            ) : null}

          </div>
        </div>
      ) : null}

      {selectedProtocol ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70 px-3 py-4">
          <div className="relative mx-auto h-full max-w-6xl overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedProtocolId("")}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-600 shadow-sm backdrop-blur transition hover:bg-slate-50"
              aria-label="Затвори протокола"
              title="Затвори"
            >
              <X size={18} />
            </button>
            <iframe
              title={protocolTitle(selectedProtocol)}
              src={protocolPrintHref(selectedProtocol, true)}
              className="h-full w-full bg-white"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
