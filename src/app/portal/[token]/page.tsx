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
  Phone,
  ShieldCheck,
  Siren,
  SprayCan,
  UserRound,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";

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
  preparedBy?: string;
  lines?: DocumentLine[];
};

type ContractPreview = OfferPreview & {
  offerNumber?: string;
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

function documentStatus(document: PortalDocument) {
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
    return subscriptionDefaultScope();
  }

  const selectedRows = subscriptionScopeRows
    .filter((row) => Boolean((checks as Record<string, unknown>)[row.number]))
    .map((row) => row.label);

  return selectedRows.length ? selectedRows : subscriptionDefaultScope();
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

function protocolNextVisitDates(protocol: PortalProtocol) {
  const payload = protocol.protocolPayload ?? {};
  const dates = [textFromRecord(payload, "nextVisitDate")];

  for (const row of protocolPayloadRows(protocol)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rowRecord = row as Record<string, unknown>;
    dates.push(
      textFromRecord(rowRecord, "nextServiceDate"),
      textFromRecord(rowRecord, "next_service_date"),
      textFromRecord(rowRecord, "nextCheckDate"),
      textFromRecord(rowRecord, "next_check_date")
    );
  }

  return dates.filter(Boolean);
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

function libraryItemTone(item: PortalLibraryItem): "green" | "orange" | "blue" | "slate" {
  if (item.itemType === "protocol") return "blue";
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

function badgeClass(tone: "green" | "orange" | "blue" | "slate") {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "orange") return "border-orange-200 bg-orange-50 text-orange-700";
  if (tone === "blue") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "green" | "orange" | "blue" | "slate";
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
        className="h-40 w-full touch-none rounded-2xl border border-dashed border-slate-300 bg-white"
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
  const rows = documentLines(document)
    .map((line, index) => {
      const quantity = Number(line.quantity) || 1;
      const unitPrice = Number(line.unitPrice) || 0;
      const price = Number(line.price);
      const total = Number.isFinite(price) && price > 0 ? price : quantity * unitPrice;
      return `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(line.name || "Услуга")}</strong><br><span>${escapeHtml(line.description || "")}</span></td>
        <td>${escapeHtml(line.period || line.periodicity || "")}</td>
        <td class="right">${escapeHtml(formatAmount(total))}</td>
      </tr>`;
    })
    .join("");
  const totals = documentTotals(document);
  const signature = document.signatureDataUrl
    ? `<div class="signature"><img src="${escapeHtml(document.signatureDataUrl)}" alt="Подпис"><div>${escapeHtml(document.signedByName || "Клиент")}</div><small>${escapeHtml(formatDate(document.signedAt))}</small></div>`
    : `<div class="signature empty">Няма положен подпис</div>`;

  return `<!doctype html>
  <html lang="bg">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(document.title)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
      header { display: grid; grid-template-columns: 1fr 58mm; gap: 12mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 10mm; }
      .brand { font-size: 23pt; font-weight: 900; letter-spacing: -0.5px; }
      .brand span { color: #ea580c; }
      .subtitle, .label { color: #64748b; font-size: 8pt; font-weight: 800; text-transform: uppercase; }
      .meta { border: 1px solid #dbe4ef; border-radius: 8px; padding: 6mm; background: #f8fafc; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 10mm; }
      .value { margin-top: 2mm; font-size: 14pt; font-weight: 900; }
      p { margin: 2mm 0 0; color: #334155; }
      table { width: 100%; margin-top: 10mm; border-collapse: collapse; border: 1px solid #dbe4ef; }
      th { background: #f1f5f9; color: #64748b; font-size: 8pt; text-transform: uppercase; text-align: left; }
      th, td { border-bottom: 1px solid #dbe4ef; padding: 3.5mm; vertical-align: top; }
      td span { color: #475569; }
      .right { text-align: right; white-space: nowrap; }
      .totals { width: 70mm; margin: 8mm 0 0 auto; border: 1px solid #dbe4ef; border-radius: 8px; overflow: hidden; }
      .totals div { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #dbe4ef; }
      .totals div:last-child { border-bottom: 0; background: #020617; color: white; }
      .totals span, .totals strong { padding: 3.5mm; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 14mm; page-break-inside: avoid; }
      .signature { min-height: 28mm; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 4mm; text-align: center; }
      .signature img { max-height: 22mm; max-width: 100%; object-fit: contain; display: block; margin: 0 auto 2mm; }
      .empty { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-weight: 700; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <div class="brand">FIRE<span>Control</span></div>
        <div class="subtitle">${escapeHtml(documentKindLabel(document.kind))} за пожарна безопасност и сервизно обслужване.</div>
      </div>
      <div class="meta">
        <div class="label">Номер</div><strong>${escapeHtml(document.number || source?.number || "")}</strong><br><br>
        <div class="label">Дата</div><strong>${escapeHtml(formatDate(source?.date || document.publishedAt))}</strong>
      </div>
    </header>
    <section class="grid">
      <div><div class="label">Клиент</div><div class="value">${escapeHtml(source?.client || "")}</div><p>${escapeHtml(source?.contact || "")}<br>${escapeHtml(source?.phone || "")}<br>${escapeHtml(source?.email || "")}</p></div>
      <div><div class="label">Обект</div><div class="value">${escapeHtml(source?.object || document.objectName || "")}</div><p>${escapeHtml(source?.address || "")}</p></div>
    </section>
    <table><thead><tr><th>№</th><th>Услуга</th><th>Период</th><th class="right">Стойност</th></tr></thead><tbody>${rows || `<tr><td colspan="4">Няма позиции.</td></tr>`}</tbody></table>
    <section class="totals">
      <div><span>Междинна сума</span><strong>${escapeHtml(formatAmount(totals.subtotal))}</strong></div>
      <div><span>ДДС</span><strong>${escapeHtml(formatAmount(totals.vat))}</strong></div>
      <div><span>Общо</span><strong>${escapeHtml(formatAmount(totals.total))}</strong></div>
    </section>
    <section class="signatures">
      <div><div class="label">Изготвил</div><div class="signature empty">${escapeHtml(source?.preparedBy || "FireControl")}</div></div>
      <div><div class="label">Клиент</div>${signature}</div>
    </section>
  </body>
  </html>`;
}

function openPdfPrintWindow(document: PortalDocument) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(documentHtml(document));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
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

function DocumentPreview({ document }: { document: PortalDocument }) {
  const source = documentSource(document);
  const lines = documentLines(document);
  const totals = documentTotals(document);
  const terms = document.kind === "contract" ? document.documentData?.contract?.terms || [] : [];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div>
          <div className="text-3xl font-black tracking-tight">
            FIRE<span className="text-orange-600">Control</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {documentKindLabel(document.kind)} за пожарна безопасност и сервизно обслужване.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-400">Номер</div>
          <div className="mt-1 font-black">{document.number || source?.number}</div>
          <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
          <div className="mt-1 font-black">{formatDate(source?.date || document.publishedAt)}</div>
          {document.kind === "contract" && document.documentData?.contract?.offerNumber ? (
            <>
              <div className="mt-3 text-xs font-black uppercase text-slate-400">Към оферта</div>
              <div className="mt-1 font-black">{document.documentData.contract.offerNumber}</div>
            </>
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
    const nextVisitDate = protocols
      .flatMap(protocolNextVisitDates)
      .filter((value) => dateTimestamp(value) >= today.getTime())
      .sort((a, b) => dateTimestamp(a) - dateTimestamp(b))[0];

    return {
      lastVisitDate: lastProtocol?.date || "",
      nextVisitDate: nextVisitDate || "",
    };
  }, [data]);
  const timelineTasks = useMemo(
    () =>
      [
        ...upcomingTasks.map((task) => ({
          ...task,
          timelineStatus: "upcoming" as const,
          timelineDate: task.dueDate,
        })),
        ...completedTasks.map((task) => ({
          ...task,
          timelineStatus: "completed" as const,
          timelineDate: task.completedAt || task.dueDate,
        })),
      ]
        .filter((task) => task.timelineDate || task.title)
        .sort((a, b) => {
          if (a.timelineStatus !== b.timelineStatus) return a.timelineStatus === "upcoming" ? -1 : 1;
          const aTime = a.timelineDate ? new Date(a.timelineDate).getTime() : 0;
          const bTime = b.timelineDate ? new Date(b.timelineDate).getTime() : 0;
          return a.timelineStatus === "upcoming" ? aTime - bTime : bTime - aTime;
        })
        .slice(0, 10),
    [upcomingTasks, completedTasks]
  );
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
                    {data.client.phone}
                  </span>
                ) : null}
                {data.client.email ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700">
                    <Mail size={16} className="text-orange-500" />
                    {data.client.email}
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
              <Badge tone="slate">{data.documents.filter((document) => document.kind === "offer").length} оферти</Badge>
              <Badge tone="blue">{data.documents.filter((document) => document.kind === "contract").length} договори</Badge>
              <Badge tone="slate">{data.protocols.length} протоколи</Badge>
              <Badge tone="orange">{documentsForSignature.length} за подпис</Badge>
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
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800"
                  >
                    <ExternalLink size={16} />
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
                    {location.service ? (
                      <div className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                        {location.service}
                      </div>
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
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">График и история</h2>
              <Badge tone="blue">{timelineTasks.length}</Badge>
            </div>
            <div className="mt-4">
              {timelineTasks.length ? (
                <div className="relative pl-8">
                  <div className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-orange-300 via-slate-200 to-emerald-200" />
                  <div className="divide-y divide-slate-100">
                    {timelineTasks.map((task) => {
                      const upcoming = task.timelineStatus === "upcoming";
                      const markerClass = upcoming
                        ? "border-orange-200 bg-orange-50 text-orange-600"
                        : "border-emerald-200 bg-emerald-50 text-emerald-600";
                      const Icon = upcoming ? Clock3 : CheckCircle2;
                      const scopeLines = subscriptionTaskScope(task, protocolVisitSummary.lastVisitDate);

                      return (
                        <div key={`${task.timelineStatus}-${task.id}`} className="relative py-4 first:pt-1 last:pb-1">
                          <div className={`absolute -left-8 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 ${markerClass}`}>
                            <Icon size={14} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={upcoming ? "orange" : "green"}>
                              {upcoming ? "Предстояща" : "Приключена"}
                            </Badge>
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
              ) : (
                <div className="rounded-2xl bg-slate-50 p-6 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                    <Clock3 size={20} />
                  </div>
                  <div className="mt-3 text-sm font-bold text-slate-500">
                    Все още няма планирани или приключени дейности.
                  </div>
                </div>
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
                <Badge tone={selectedDocument.status === "signed" ? "green" : "orange"}>{documentStatus(selectedDocument)}</Badge>
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

            <DocumentPreview document={selectedDocument} />

            {selectedDocument.status === "signed" ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={22} />
                  <div>
                    <h3 className="text-lg font-black text-emerald-900">Подписан документ</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800/75">Документът е подписан и е достъпен за преглед и PDF експорт.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px]">
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                    <div className="text-xs font-black uppercase text-slate-400">Подписал</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{selectedDocument.signedByName || "Клиент"}</div>
                    <div className="mt-3 text-xs font-black uppercase text-slate-400">Дата</div>
                    <div className="mt-1 text-sm font-bold text-slate-700">{formatDate(selectedDocument.signedAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-3">
                    {selectedDocument.signatureDataUrl ? (
                      <img src={selectedDocument.signatureDataUrl} alt="Подпис" className="h-32 w-full object-contain" />
                    ) : (
                      <div className="flex h-32 items-center justify-center text-sm font-bold text-slate-400">Няма изображение на подпис.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-black">Онлайн подпис</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  С подписването потвърждавате, че сте прегледали документа и го приемате електронно през клиентския портал.
                </p>
                <label className="mt-4 block text-xs font-black uppercase text-slate-400">Име на подписващ</label>
                <input value={signedByName} onChange={(event) => setSignedByName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-orange-400" />
                <div className="mt-4">
                  <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
                </div>
                {signState === "error" ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{signError}</div> : null}
                <button type="button" onClick={signDocument} disabled={signState === "saving" || !signedByName.trim() || !signatureDataUrl} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {signState === "saving" ? <Loader2 size={18} className="animate-spin" /> : <FileSignature size={18} />}
                  Подпиши документа
                </button>
              </div>
            )}
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
