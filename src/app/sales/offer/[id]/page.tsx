"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { publishSavedDocumentToClientPortal } from "../../../../lib/client-portal";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

type OfferLine = {
  id: string;
  name: string;
  description: string;
  period: string;
  quantity: number;
  unitPrice: number;
};

type OfferData = {
  opportunityId: string;
  number: string;
  date: string;
  validUntil: string;
  client: string;
  contact: string;
  phone: string;
  email: string;
  object: string;
  address: string;
  subject: string;
  notes: string;
  executionTerm: string;
  paymentTerms: string;
  warrantyTerms: string;
  preparedBy: string;
  preparedByRole: string;
  signatureUrl: string;
  acceptedSignatureUrl: string;
  lines: OfferLine[];
};

type TeamSession = {
  id?: string;
  name?: string;
  role?: string;
  signature_url?: string;
};

type SignatureMethod = "onsite" | "portal" | "paper" | null;
type SignatureStatus = "draft" | "sent_to_portal" | "signed";

type DocumentSignature = {
  status: SignatureStatus;
  method: SignatureMethod;
  signedAt: string | null;
  signedByName: string;
  signatureDataUrl: string;
  paperNote: string;
};

const sessionKey = "firecontrol:team-session";

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("bg-BG").format(new Date(`${value}T00:00:00`));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

const vatRate = 0.2;

function money(value: number) {
  return `${formatAmount(value)} €`;
}

function fakePriceFor(index: number) {
  return [45, 65, 120, 180, 240, 360][index % 6];
}

function serviceLabel(row: { service_category?: string | null; service_name?: string | null }) {
  const category = String(row.service_category ?? "").trim();
  const name = String(row.service_name ?? "").trim();
  return category && category !== name ? `${category} - ${name}` : name || category || "Услуга";
}

function defaultPeriodFor(serviceName: string) {
  const normalized = serviceName.toLowerCase();
  if (normalized.includes("годиш") || normalized.includes("периодич")) return "12 месеца";
  if (normalized.includes("абонамент")) return "месечно";
  if (normalized.includes("поддръж") || normalized.includes("обслуж")) return "еднократно";
  if (normalized.includes("презареж")) return "еднократно";
  if (normalized.includes("провер")) return "еднократно";
  return "по заявка";
}

function visibleLineNote(line: OfferLine) {
  const parts = [line.description]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !value.toLowerCase().includes("услуга по пожарна безопасност според избрания обхват"));

  return Array.from(new Set(parts)).join(" · ");
}

function normalizeLine(line: Partial<OfferLine>, index: number): OfferLine {
  const name = String(line.name || "Услуга");
  return {
    id: String(line.id || `line-${index}-${name}`),
    name,
    description: String(line.description || ""),
    period: String(line.period || defaultPeriodFor(name)),
    quantity: Number(line.quantity) || 1,
    unitPrice: Number(line.unitPrice) || 0,
  };
}

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

function formatDocumentDateForNumber(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}г.`;
}

function parseSequentialDocumentNumber(value: unknown, shortYear: string) {
  const match = String(value ?? "").match(/^(\d{2})(\d{4})\//);
  if (!match || match[1] !== shortYear) return 0;
  return Number(match[2]) || 0;
}

async function nextOfferNumber(supabase: SupabaseBrowserClient, date: Date) {
  const shortYear = String(date.getFullYear()).slice(-2);
  const { data } = await supabase
    .from("saved_documents")
    .select("number,payload")
    .eq("kind", "offer");

  const maxSequence = ((data as { number?: unknown; payload?: unknown }[] | null) ?? []).reduce((max, row) => {
    const payload = isRecord(row.payload) ? row.payload : {};
    const offer = isRecord(payload.offer) ? payload.offer : {};
    return Math.max(
      max,
      parseSequentialDocumentNumber(row.number, shortYear),
      parseSequentialDocumentNumber(offer.number, shortYear)
    );
  }, 0);
  const nextSequence = Math.max(100, maxSequence + 1);

  return `${shortYear}${String(nextSequence).padStart(4, "0")}/${formatDocumentDateForNumber(date)}`;
}

function readSession(): TeamSession | null {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? (JSON.parse(raw) as TeamSession) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readDraftOffer(payload: unknown): Partial<OfferData> | null {
  if (!isRecord(payload) || !isRecord(payload.offer)) return null;
  return payload.offer as Partial<OfferData>;
}

function defaultDocumentSignature(signedByName = ""): DocumentSignature {
  return {
    status: "draft",
    method: null,
    signedAt: null,
    signedByName,
    signatureDataUrl: "",
    paperNote: "",
  };
}

function readDocumentSignature(payload: unknown, fallbackSignatureDataUrl = "", fallbackName = ""): DocumentSignature {
  if (isRecord(payload) && isRecord(payload.signature)) {
    const signature = payload.signature;
    const status = signature.status === "sent_to_portal" || signature.status === "signed" ? signature.status : "draft";
    const method =
      signature.method === "onsite" || signature.method === "portal" || signature.method === "paper"
        ? signature.method
        : null;

    return {
      status,
      method,
      signedAt: typeof signature.signedAt === "string" ? signature.signedAt : null,
      signedByName: String(signature.signedByName || fallbackName),
      signatureDataUrl: String(signature.signatureDataUrl || fallbackSignatureDataUrl),
      paperNote: String(signature.paperNote || ""),
    };
  }

  if (fallbackSignatureDataUrl) {
    return {
      status: "signed",
      method: "onsite",
      signedAt: null,
      signedByName: fallbackName,
      signatureDataUrl: fallbackSignatureDataUrl,
      paperNote: "",
    };
  }

  return defaultDocumentSignature(fallbackName);
}

function signatureStatusLabel(signature: DocumentSignature) {
  if (signature.status === "sent_to_portal") return "Качена в клиентски портал";
  if (signature.status !== "signed") return "Чернова";
  if (signature.method === "onsite") return "Подписана на терен";
  if (signature.method === "portal") return "Подписана през клиентски портал";
  if (signature.method === "paper") return "Подписана на хартия";
  return "Подписана";
}

function SignaturePad({
  value,
  onChange,
  showClear = true,
}: {
  value: string;
  onChange: (value: string) => void;
  showClear?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  function prepareCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;

    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    return { canvas, context };
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  useEffect(() => {
    const prepared = prepareCanvas();
    if (!prepared) return;

    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    if (!value) return;

    const image = new Image();
    image.onload = () => {
      prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
      prepared.context.drawImage(image, 0, 0, prepared.canvas.width, prepared.canvas.height);
    };
    image.src = value;
  }, [value]);

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const prepared = prepareCanvas();
    const currentPoint = point(event);
    if (!prepared || !currentPoint) return;

    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    prepared.context.beginPath();
    prepared.context.moveTo(currentPoint.x, currentPoint.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const prepared = prepareCanvas();
    const currentPoint = point(event);
    if (!prepared || !currentPoint) return;

    prepared.context.lineTo(currentPoint.x, currentPoint.y);
    prepared.context.stroke();
    onChange(prepared.canvas.toDataURL("image/png"));
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function clear() {
    const prepared = prepareCanvas();
    if (!prepared) return;
    prepared.context.clearRect(0, 0, prepared.canvas.width, prepared.canvas.height);
    onChange("");
  }

  return (
    <div className="mt-3">
      <canvas
        ref={canvasRef}
        width={520}
        height={150}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => { drawingRef.current = false; }}
        className="h-32 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
      />
      {showClear ? (
        <div className="no-print mt-3 flex h-10 justify-end">
          <Button type="button" variant="outline" onClick={clear}>
            Изчисти подпис
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  rows = 1,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      data-autoresize="true"
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      className={className}
    />
  );
}

export default function SalesOfferEditorPage() {
  const params = useParams<{ id: string }>();
  const opportunityId = params.id;
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [acceptState, setAcceptState] = useState<"idle" | "saving" | "accepted" | "error">("idle");
  const [portalState, setPortalState] = useState<"idle" | "saving" | "published" | "error">("idle");
  const [portalPath, setPortalPath] = useState("");
  const [documentSignature, setDocumentSignature] = useState<DocumentSignature>(() => defaultDocumentSignature());

  useEffect(() => {
    function resizeDocumentTextareas() {
      document.querySelectorAll<HTMLTextAreaElement>(".offer-sheet textarea[data-autoresize='true']").forEach((textarea) => {
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
      });
    }

    window.addEventListener("beforeprint", resizeDocumentTextareas);
    window.addEventListener("resize", resizeDocumentTextareas);
    resizeDocumentTextareas();

    return () => {
      window.removeEventListener("beforeprint", resizeDocumentTextareas);
      window.removeEventListener("resize", resizeDocumentTextareas);
    };
  }, [offer]);

  useEffect(() => {
    let cancelled = false;

    async function loadOffer() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const [{ data, error }, draftResult, session] = await Promise.all([
          supabase
            .from("sales_opportunities")
            .select("*, sales_opportunity_services(service_category, service_name)")
            .eq("id", opportunityId)
            .maybeSingle(),
          supabase
            .from("saved_documents")
            .select("payload")
            .eq("id", `offer-${opportunityId}`)
            .eq("kind", "offer")
            .maybeSingle(),
          Promise.resolve(readSession()),
        ]);

        if (error || !data) throw new Error(error?.message || "Липсва оферта.");

        let preparedBy = session?.name || "";
        let preparedByRole = session?.role || "";
        let signatureUrl = session?.signature_url || "";

        if (session?.id) {
          try {
            const response = await fetch(`/api/team-profile?memberId=${encodeURIComponent(session.id)}`);
            if (response.ok) {
              const profile = await response.json();
              preparedBy = profile.member?.name || preparedBy;
              preparedByRole = profile.member?.role || preparedByRole;
              signatureUrl = profile.member?.signature_url || signatureUrl;
            }
          } catch {
            // The local session is enough for the document header.
          }
        }

        const today = new Date();
        const serviceRows = Array.isArray(data.sales_opportunity_services)
          ? (data.sales_opportunity_services as { service_category?: string | null; service_name?: string | null }[])
          : [];
        const lines = serviceRows.length
          ? serviceRows.map((row, index) => ({
              id: `${index}-${serviceLabel(row)}`,
              name: serviceLabel(row),
              description: "",
              period: defaultPeriodFor(serviceLabel(row)),
              quantity: 1,
              unitPrice: fakePriceFor(index),
            }))
          : [{
              id: "default-service",
              name: "Пожарна безопасност",
              description: "",
              period: "по заявка",
              quantity: 1,
              unitPrice: 180,
            }];

        const draftOffer = readDraftOffer(draftResult.data?.payload);
        const generatedNumber = draftOffer?.number || await nextOfferNumber(supabase, today);

        if (cancelled) return;
        const defaultOffer: OfferData = {
          opportunityId,
          number: generatedNumber,
          date: dateKey(today),
          validUntil: dateKey(addDays(today, 14)),
          client: String(data.company_name ?? ""),
          contact: String(data.contact_name ?? ""),
          phone: String(data.phone ?? ""),
          email: String(data.email ?? ""),
          object: String(data.object_name ?? ""),
          address: String(data.object_address ?? ""),
          subject: "Оферта за услуги, свързани с пожарна безопасност и сервизно обслужване.",
          notes: "Цените са ориентировъчни и могат да бъдат прецизирани след оглед и потвърждение на обхвата.",
          executionTerm: "Изпълнението се планира след писмено потвърждение на офертата и уточняване на достъп до обекта.",
          paymentTerms: "Плащане по банков път след издадена фактура, освен ако страните не договорят друго писмено.",
          warrantyTerms: "Офертата включва документиране на извършените дейности съгласно приложимите изисквания за пожарна безопасност.",
          preparedBy: preparedBy || "Не е зададен потребител",
          preparedByRole,
          signatureUrl,
          acceptedSignatureUrl: "",
          lines,
        };
        const loadedSignature = readDocumentSignature(
          draftResult.data?.payload,
          draftOffer?.acceptedSignatureUrl || "",
          draftOffer?.contact || defaultOffer.contact || defaultOffer.client
        );
        setOffer({
          ...defaultOffer,
          ...draftOffer,
          opportunityId,
          acceptedSignatureUrl: loadedSignature.signatureDataUrl || draftOffer?.acceptedSignatureUrl || "",
          lines: Array.isArray(draftOffer?.lines) && draftOffer.lines.length
            ? draftOffer.lines.map((line, index) => normalizeLine(line, index))
            : defaultOffer.lines,
        });
        setDocumentSignature(loadedSignature);
        setAcceptState(loadedSignature.status === "signed" ? "accepted" : "idle");
        setPortalState(loadedSignature.status === "sent_to_portal" ? "published" : "idle");
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadOffer();
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const totals = useMemo(() => {
    const subtotal = offer?.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) ?? 0;
    const vat = subtotal * vatRate;
    return { subtotal, vat, total: subtotal + vat };
  }, [offer]);

  function updateOffer<K extends keyof OfferData>(key: K, value: OfferData[K]) {
    setOffer((current) => current ? { ...current, [key]: value } : current);
  }

  function updateLine(id: string, updates: Partial<OfferLine>) {
    setOffer((current) => current ? {
      ...current,
      lines: current.lines.map((line) => line.id === id ? { ...line, ...updates } : line),
    } : current);
  }

  function addLine() {
    setOffer((current) => current ? {
      ...current,
      lines: [
        ...current.lines,
        {
          id: `line-${Date.now()}`,
          name: "Нова услуга",
          description: "",
          period: "по заявка",
          quantity: 1,
          unitPrice: 0,
        },
      ],
    } : current);
  }

  function removeLine(id: string) {
    setOffer((current) => current ? {
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    } : current);
  }

  async function persistOffer(signatureOverride?: DocumentSignature) {
    if (!offer) throw new Error("Липсва оферта.");

    const supabase = createSupabaseBrowserClient();
    const documentId = `offer-${offer.opportunityId}`;
    const baseSignature = signatureOverride ?? documentSignature;
    const nextSignature = {
      ...baseSignature,
      signatureDataUrl: baseSignature.method === "paper" ? "" : baseSignature.signatureDataUrl || offer.acceptedSignatureUrl,
      signedByName: baseSignature.signedByName || offer.contact || offer.client,
    };
    const { error } = await supabase.from("saved_documents").upsert(
      {
        id: documentId,
        kind: "offer",
        number: offer.number,
        title: `Оферта ${offer.number}`,
        client: offer.client,
        object: offer.object,
        href: `/sales/offer/${offer.opportunityId}`,
        total: money(totals.total),
        payload: { offer: { ...offer, acceptedSignatureUrl: nextSignature.signatureDataUrl }, totals, signature: nextSignature, status: nextSignature.status === "signed" ? "accepted" : "draft" },
        saved_at_ms: Date.now(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);

    const { error: opportunityError } = await supabase
      .from("sales_opportunities")
      .update({
        status: "Запазена като чернова",
        updated_at: new Date().toISOString(),
      })
      .eq("id", offer.opportunityId)
      .eq("stage", "offer");
    if (opportunityError) throw new Error(opportunityError.message);
  }

  async function saveOffer() {
    setSaveState("saving");
    try {
      await persistOffer();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function markOfferSigned(method: Exclude<SignatureMethod, null>) {
    if (!offer) return;
    setAcceptState("saving");
    setSaveState("idle");
    try {
      const now = new Date().toISOString();
      const nextSignature: DocumentSignature = {
        status: "signed",
        method,
        signedAt: now,
        signedByName: offer.contact || offer.client,
        signatureDataUrl: method === "paper" ? "" : offer.acceptedSignatureUrl,
        paperNote: method === "paper" ? "Документът е принтиран и подписан на хартия." : "",
      };
      setDocumentSignature(nextSignature);
      setOffer((current) => current ? { ...current, acceptedSignatureUrl: nextSignature.signatureDataUrl } : current);

      await persistOffer(nextSignature);

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sales_opportunities")
        .update({
          stage: "order",
          status: "Потвърден",
          last_activity_at: now,
          updated_at: now,
        })
        .eq("id", offer.opportunityId);
      if (error) throw new Error(error.message);

      if (method !== "portal") {
        await publishSavedDocumentToClientPortal(supabase, {
          opportunityId: offer.opportunityId,
          savedDocumentId: `offer-${offer.opportunityId}`,
          kind: "offer",
          title: `Оферта ${offer.number}`,
          clientName: offer.client,
          contactName: offer.contact,
          phone: offer.phone,
          email: offer.email,
          address: offer.address,
          objectName: offer.object,
          status: "signed",
          requiresSignature: false,
          signatureMethod: method,
          signedAt: nextSignature.signedAt,
          signedByName: nextSignature.signedByName,
          signatureDataUrl: nextSignature.signatureDataUrl,
        });
      }

      await supabase.from("sales_activity_logs").insert({
        opportunity_id: offer.opportunityId,
        type: "stage_change",
        title: "Офертата е подписана",
        description: `Оферта ${offer.number} е подписана (${signatureStatusLabel(nextSignature)}) и преместена към Поръчки.`,
      });

      setAcceptState("accepted");
      setSaveState("saved");
    } catch {
      setAcceptState("error");
    }
  }

  async function publishToPortal() {
    if (!offer) return;
    setPortalState("saving");
    try {
      const nextSignature: DocumentSignature = {
        ...documentSignature,
        status: "sent_to_portal",
        method: "portal",
        signedByName: documentSignature.signedByName || offer.contact || offer.client,
      };
      setDocumentSignature(nextSignature);
      await persistOffer(nextSignature);

      const supabase = createSupabaseBrowserClient();
      const portal = await publishSavedDocumentToClientPortal(supabase, {
        opportunityId: offer.opportunityId,
        savedDocumentId: `offer-${offer.opportunityId}`,
        kind: "offer",
        title: `Оферта ${offer.number}`,
        clientName: offer.client,
        contactName: offer.contact,
        phone: offer.phone,
        email: offer.email,
        address: offer.address,
        objectName: offer.object,
      });
      setPortalPath(portal.portalPath);
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: offer.opportunityId,
        type: "portal_publish",
        title: "Офертата е качена в клиентски портал",
        description: `Оферта ${offer.number} е подготвена за онлайн подпис през клиентски портал.`,
      });

      setPortalState("published");
      setSaveState("saved");
    } catch {
      setPortalState("error");
    }
  }

  if (loadState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-orange-500" size={28} />
      </main>
    );
  }

  if (loadState === "error" || !offer) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <Card className="mx-auto max-w-xl p-6 text-center">
          <h1 className="text-xl font-black text-slate-950">Офертата не може да се зареди.</h1>
          <Link href="/sales" className="mt-4 inline-flex text-sm font-bold text-orange-600">
            Назад към продажби
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="offer-page min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/sales/${offer.opportunityId}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
          <ArrowLeft size={18} />
          Назад
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={saveOffer} disabled={saveState === "saving"}>
            {saveState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            {saveState === "saved" ? "Чернова запазена" : "Запази като чернова"}
          </Button>
          <Button type="button" variant="outline" onClick={publishToPortal} disabled={portalState === "saving"}>
            {portalState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Mail size={17} />}
            {portalState === "published" ? "Качена в портал" : "Качи в клиентски портал"}
          </Button>
          {portalPath ? (
            <Link href={portalPath} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 shadow-sm transition hover:bg-blue-100">
              <ExternalLink size={17} />
              Отвори портал
            </Link>
          ) : null}
          <Button type="button" onClick={() => markOfferSigned("onsite")} disabled={acceptState === "saving" || !offer.acceptedSignatureUrl}>
            {acceptState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            Подпис на терен
          </Button>
          <Button type="button" variant="outline" onClick={() => markOfferSigned("paper")} disabled={acceptState === "saving"}>
            <Printer size={17} />
            Подписана на хартия
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <Printer size={17} />
            Печат
          </Button>
        </div>
      </div>

      {saveState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Офертата не беше запазена.
        </div>
      ) : null}
      {acceptState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Офертата не беше подписана.
        </div>
      ) : null}
      {portalState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Офертата не беше качена в клиентския портал.
        </div>
      ) : null}
      {acceptState === "accepted" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {signatureStatusLabel(documentSignature)}. Сделката е преместена към Поръчки.
        </div>
      ) : null}
      {portalState === "published" && acceptState !== "accepted" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          Офертата е качена в клиентски портал и очаква онлайн подпис.
        </div>
      ) : null}

      <style>{`
        @page {
          size: A4;
          margin: 0 0 11mm;

          @bottom-center {
            content: counter(page);
            color: #64748b;
            font-size: 9px;
            font-weight: 700;
          }
        }

        .offer-sheet input,
        .offer-sheet textarea,
        .offer-field {
          min-width: 0;
        }

        @media screen {
          .offer-field {
            border-bottom: 1px solid transparent;
          }

          .offer-field:focus {
            border-bottom-color: #fb923c;
          }
        }

        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html,
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .offer-page {
            background: #ffffff !important;
            margin: 0 !important;
            min-height: auto !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .offer-sheet {
            border: 0 !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            margin: 0 !important;
            min-height: auto !important;
            overflow: visible !important;
            padding: 10mm 12mm !important;
            width: 210mm !important;
          }

          .offer-sheet input,
          .offer-sheet textarea {
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
            color: inherit !important;
            overflow: visible !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          .offer-sheet input[type="date"]::-webkit-calendar-picker-indicator {
            display: none !important;
          }

          .offer-sheet header {
            align-items: start !important;
            border-bottom: 1px solid #cbd5e1 !important;
            display: grid !important;
            gap: 10mm !important;
            grid-template-columns: minmax(0, 1fr) 74mm !important;
            padding-bottom: 6mm !important;
          }

          .offer-sheet header img {
            width: 38mm !important;
          }

          .offer-sheet header p {
            font-size: 9.2px !important;
            line-height: 1.35 !important;
            margin-top: 2.5mm !important;
            max-width: 86mm !important;
          }

          .offer-sheet header textarea {
            border-left: 2px solid #f97316 !important;
            font-size: 11.2px !important;
            line-height: 1.45 !important;
            margin-top: 7mm !important;
            max-width: 106mm !important;
            padding-left: 3.5mm !important;
          }

          .offer-meta {
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            padding: 4mm !important;
          }

          .offer-meta h1 {
            font-size: 25px !important;
          }

          .offer-meta label {
            gap: 2mm !important;
            grid-template-columns: 17mm minmax(0, 1fr) !important;
          }

          .offer-meta span {
            font-size: 8.5px !important;
          }

          .offer-meta input {
            font-size: 11.2px !important;
            line-height: 1.2 !important;
          }

          .offer-number-field {
            font-size: 11px !important;
            width: 100% !important;
          }

          .offer-sheet canvas {
            height: 24mm !important;
            max-width: 100% !important;
          }

          .offer-print-block {
            break-inside: avoid;
          }

          .offer-sheet section {
            margin-top: 5mm !important;
          }

          .offer-sheet section:nth-of-type(1) {
            border-bottom: 1px solid #e2e8f0 !important;
            display: grid !important;
            gap: 10mm !important;
            grid-template-columns: 1fr 1fr !important;
            padding-bottom: 4.5mm !important;
          }

          .offer-sheet section:nth-of-type(1) h2 {
            font-size: 8.5px !important;
          }

          .offer-sheet section:nth-of-type(1) textarea {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
          }

          .offer-sheet section:nth-of-type(1) textarea:first-child {
            font-size: 14px !important;
            line-height: 1.25 !important;
          }

          .offer-table {
            font-size: 10.5px !important;
          }

          .offer-table th {
            background: #f1f5f9 !important;
            font-size: 8.5px !important;
            padding: 1.8mm 2mm !important;
          }

          .offer-table td {
            padding: 2.2mm 2mm !important;
          }

          .offer-table textarea,
          .offer-table input {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
          }

          .offer-table td:first-child {
            color: #64748b !important;
          }

          .offer-table tr,
          .offer-signatures {
            break-inside: avoid;
          }

          .offer-table col:nth-child(1) {
            width: 5% !important;
          }

          .offer-table col:nth-child(2) {
            width: 51% !important;
          }

          .offer-table col:nth-child(3) {
            width: 12% !important;
          }

          .offer-table col:nth-child(4) {
            width: 15% !important;
          }

          .offer-table col:nth-child(5) {
            width: 17% !important;
          }

          .offer-sheet section:nth-of-type(3) {
            align-items: start !important;
            border-top: 1px solid #e2e8f0 !important;
            display: grid !important;
            gap: 10mm !important;
            grid-template-columns: minmax(0, 1fr) 50mm !important;
            padding-top: 5mm !important;
          }

          .offer-sheet section:nth-of-type(3) h2 {
            font-size: 10px !important;
          }

          .offer-sheet section:nth-of-type(3) label {
            display: grid !important;
            gap: 4mm !important;
            grid-template-columns: 28mm minmax(0, 1fr) !important;
          }

          .offer-sheet section:nth-of-type(3) span {
            font-size: 8px !important;
          }

          .offer-sheet section:nth-of-type(3) textarea {
            font-size: 9.5px !important;
            line-height: 1.35 !important;
          }

          .offer-sheet section:nth-of-type(3) > div:last-child {
            font-size: 10px !important;
            padding-top: 0 !important;
          }

          .offer-sheet section:nth-of-type(3) > div:last-child > div {
            padding-bottom: 1.2mm !important;
            padding-top: 1.2mm !important;
          }

          .offer-sheet section:nth-of-type(3) > div:last-child > div:nth-child(3) {
            border-radius: 3px !important;
            margin-top: 1.5mm !important;
            padding: 2.3mm 2.5mm !important;
          }

          .offer-sheet section:nth-of-type(3) > div:last-child > div:nth-child(3) div:last-child {
            font-size: 14px !important;
          }

          .offer-signatures {
            border-top: 1px solid #e2e8f0 !important;
            display: grid !important;
            gap: 12mm !important;
            grid-template-columns: 1fr 1fr !important;
            margin-top: 6mm !important;
            padding-top: 5mm !important;
            page-break-before: auto !important;
            page-break-inside: avoid !important;
          }

          .offer-signatures input,
          .offer-signatures div {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
          }

          .offer-signatures input {
            margin-top: 1mm !important;
          }

          .offer-signatures canvas {
            height: 24mm !important;
            margin-top: 2mm !important;
          }

          .offer-signatures::before {
            content: "Потвърждение";
            color: #64748b;
            display: block;
            font-size: 9px;
            font-weight: 900;
            grid-column: 1 / -1;
            letter-spacing: 0.12em;
            margin-bottom: -7mm;
            text-transform: uppercase;
          }
        }
      `}</style>

      <article className="offer-sheet mx-auto w-full max-w-[210mm] rounded-[6px] bg-white px-[15mm] py-[14mm] shadow-sm ring-1 ring-slate-200 print:max-w-none print:rounded-none print:ring-0">
        <header className="grid gap-7 border-b border-slate-200 pb-7 md:grid-cols-[minmax(0,1fr)_74mm] md:items-start">
          <div className="min-w-0">
            <img
              src="/firecontrol-header-logo.png"
              alt="FIREControl"
              className="h-auto w-[43mm] object-contain"
            />
            <p className="mt-3 max-w-[92mm] text-[10.5px] font-black uppercase leading-4 tracking-wide text-slate-500">
              Пожарна безопасност, сервиз и абонаментно обслужване
            </p>
            <AutoResizeTextarea
              value={offer.subject}
              onChange={(event) => updateOffer("subject", event.target.value)}
              rows={2}
              className="mt-8 w-full max-w-[110mm] resize-none overflow-hidden border-l-2 border-orange-500 bg-transparent py-1 pl-4 text-[13px] font-semibold leading-6 text-slate-700 outline-none"
            />
          </div>

          <div className="offer-meta min-w-0 rounded-[4px] border border-slate-200 bg-slate-50/70 p-5 print:bg-white">
            <div className="border-b border-slate-200 pb-4">
              <h1 className="text-[30px] font-black uppercase leading-none tracking-tight text-slate-950">Оферта</h1>
            </div>
            <div className="mt-4 space-y-3">
              <label className="grid grid-cols-[24mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Номер</span>
                <input
                  value={offer.number}
                  onChange={(event) => updateOffer("number", event.target.value)}
                  className="offer-field offer-number-field w-full min-w-0 bg-transparent py-1 text-[12.5px] font-black text-slate-900 outline-none"
                />
              </label>
              <label className="grid grid-cols-[24mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Дата</span>
                <input
                  type="date"
                  value={offer.date}
                  onChange={(event) => updateOffer("date", event.target.value)}
                  className="offer-field w-full min-w-0 bg-transparent py-1 text-[12.5px] font-bold text-slate-800 outline-none"
                />
              </label>
              <label className="grid grid-cols-[24mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Валидност</span>
                <input
                  type="date"
                  value={offer.validUntil}
                  onChange={(event) => updateOffer("validUntil", event.target.value)}
                  className="offer-field w-full min-w-0 bg-transparent py-1 text-[12.5px] font-bold text-slate-800 outline-none"
                />
              </label>
            </div>
          </div>
        </header>

        <section className="offer-print-block mt-7 grid gap-8 border-b border-slate-200 pb-6 md:grid-cols-2">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Клиент</h2>
            <div className="mt-3 space-y-1">
              <AutoResizeTextarea value={offer.client} onChange={(event) => updateOffer("client", event.target.value)} rows={1} placeholder="Фирма / име" className="w-full resize-none overflow-hidden bg-transparent text-[18px] font-black leading-6 text-slate-950 outline-none" />
              <AutoResizeTextarea value={offer.contact} onChange={(event) => updateOffer("contact", event.target.value)} rows={1} placeholder="Лице за контакт" className="w-full resize-none overflow-hidden bg-transparent text-[12.5px] font-bold leading-5 text-slate-700 outline-none" />
              <AutoResizeTextarea value={offer.phone} onChange={(event) => updateOffer("phone", event.target.value)} rows={1} placeholder="Телефон" className="w-full resize-none overflow-hidden bg-transparent text-[12.5px] font-semibold leading-5 text-slate-600 outline-none" />
              <AutoResizeTextarea value={offer.email} onChange={(event) => updateOffer("email", event.target.value)} rows={1} placeholder="Email" className="w-full resize-none overflow-hidden bg-transparent text-[12.5px] font-semibold leading-5 text-slate-600 outline-none" />
            </div>
          </div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Обект</h2>
            <div className="mt-3 space-y-1">
              <AutoResizeTextarea value={offer.object} onChange={(event) => updateOffer("object", event.target.value)} rows={1} placeholder="Име на обект" className="w-full resize-none overflow-hidden bg-transparent text-[18px] font-black leading-6 text-slate-950 outline-none" />
              <AutoResizeTextarea
                value={offer.address}
                onChange={(event) => updateOffer("address", event.target.value)}
                rows={1}
                placeholder="Адрес"
                className="w-full resize-none overflow-hidden bg-transparent text-[12.5px] font-bold leading-5 text-slate-700 outline-none"
              />
              <AutoResizeTextarea value={offer.preparedByRole} onChange={(event) => updateOffer("preparedByRole", event.target.value)} rows={1} placeholder="Роля / отдел" className="w-full resize-none overflow-hidden bg-transparent text-[12.5px] font-semibold leading-5 text-slate-600 outline-none" />
            </div>
          </div>
        </section>

        <section className="mt-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[18px] font-black leading-none">Офертни позиции</h2>
              <p className="mt-2 text-[12px] font-semibold text-slate-500">
                Цените са без включен ДДС, освен ако изрично не е посочено друго.
              </p>
            </div>
            <div className="no-print">
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus size={17} />
                Добави ред
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-300">
            <table className="offer-table w-full table-fixed border-collapse text-[12px]">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[48%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[14%]" />
                <col className="no-print w-[6%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-300 px-2 py-2 text-left">№</th>
                  <th className="border-b border-slate-300 px-2 py-2 text-left">Услуга</th>
                  <th className="border-b border-slate-300 px-2 py-2 text-center">Количество</th>
                  <th className="border-b border-slate-300 px-2 py-2 text-right">Ед. цена</th>
                  <th className="border-b border-slate-300 px-2 py-2 text-right">Общо</th>
                  <th className="no-print border-b border-slate-300 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {offer.lines.map((line, index) => {
                  const note = visibleLineNote(line);

                  return (
                    <tr key={line.id} className="align-middle">
                      <td className="px-2 py-2.5 align-middle font-black text-slate-400">{index + 1}</td>
                      <td className="px-2 py-2.5 align-middle">
                        <AutoResizeTextarea
                          value={line.name}
                          onChange={(event) => updateLine(line.id, { name: event.target.value })}
                          rows={1}
                          className="w-full resize-none overflow-hidden bg-transparent text-[12.5px] font-black leading-5 text-slate-950 outline-none"
                        />
                        {note ? (
                          <div className="mt-0.5 text-[10.5px] font-semibold leading-4 text-slate-500">
                            {note}
                          </div>
                        ) : null}
                        <div className="no-print mt-1 grid gap-1">
                          <AutoResizeTextarea
                            value={line.description}
                            onChange={(event) => updateLine(line.id, { description: event.target.value })}
                            rows={1}
                            placeholder="Описание"
                            className="w-full resize-none overflow-hidden bg-transparent text-[10.5px] font-medium leading-4 text-slate-500 outline-none placeholder:text-slate-300"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2.5 align-middle text-center">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) || 0 })}
                          className="w-full bg-transparent text-center text-[12px] font-bold outline-none"
                        />
                      </td>
                      <td className="px-2 py-2.5 align-middle">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) || 0 })}
                          className="w-full bg-transparent text-right text-[12px] font-bold outline-none"
                        />
                      </td>
                      <td className="px-2 py-2.5 align-middle text-right text-[12px] font-black text-slate-950">
                        {money(line.quantity * line.unitPrice)}
                      </td>
                      <td className="no-print px-2 py-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:border-red-200 hover:bg-red-100"
                          aria-label={`Изтрий услуга ${index + 1}`}
                          title="Изтрий услуга"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="offer-print-block mt-7 grid items-start gap-8 border-t border-slate-200 pt-6 md:grid-cols-[minmax(0,1fr)_54mm]">
          <div>
            <h2 className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-500">
              Условия
            </h2>
            <div className="mt-4 space-y-3.5">
              <label className="grid gap-3 md:grid-cols-[36mm_minmax(0,1fr)]">
                <span className="pt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">Изпълнение</span>
                <AutoResizeTextarea
                  value={offer.executionTerm}
                  onChange={(event) => updateOffer("executionTerm", event.target.value)}
                  rows={1}
                  className="w-full resize-none overflow-hidden bg-transparent text-[10.8px] font-medium leading-[1.55] text-slate-700 outline-none"
                />
              </label>
              <label className="grid gap-3 md:grid-cols-[36mm_minmax(0,1fr)]">
                <span className="pt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">Плащане</span>
                <AutoResizeTextarea
                  value={offer.paymentTerms}
                  onChange={(event) => updateOffer("paymentTerms", event.target.value)}
                  rows={1}
                  className="w-full resize-none overflow-hidden bg-transparent text-[10.8px] font-medium leading-[1.55] text-slate-700 outline-none"
                />
              </label>
              <label className="grid gap-3 md:grid-cols-[36mm_minmax(0,1fr)]">
                <span className="pt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">Документи</span>
                <AutoResizeTextarea
                  value={offer.warrantyTerms}
                  onChange={(event) => updateOffer("warrantyTerms", event.target.value)}
                  rows={1}
                  className="w-full resize-none overflow-hidden bg-transparent text-[10.8px] font-medium leading-[1.55] text-slate-700 outline-none"
                />
              </label>
              <label className="grid gap-3 md:grid-cols-[36mm_minmax(0,1fr)]">
                <span className="pt-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">Бележки</span>
                <AutoResizeTextarea
                  value={offer.notes}
                  onChange={(event) => updateOffer("notes", event.target.value)}
                  rows={1}
                  className="w-full resize-none overflow-hidden bg-transparent text-[10.8px] font-medium leading-[1.55] text-slate-700 outline-none"
                />
              </label>
            </div>
          </div>

          <div className="pt-1 text-[12px]">
            <div className="grid grid-cols-2 gap-4 py-1.5">
              <div className="font-bold text-slate-500">Междинна сума</div>
              <div className="text-right font-bold text-slate-800">{money(totals.subtotal)}</div>
            </div>
            <div className="grid grid-cols-2 gap-4 py-1.5">
              <div className="font-bold text-slate-500">ДДС {Math.round(vatRate * 100)}%</div>
              <div className="text-right font-bold text-slate-800">{money(totals.vat)}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-4 rounded-[4px] bg-slate-950 px-3 py-3 text-white print:bg-slate-900">
              <div className="text-[13px] font-black uppercase">Общо</div>
              <div className="text-right text-[17px] font-black">{money(totals.total)}</div>
            </div>
            <p className="pt-2 text-right text-[10.5px] font-semibold leading-5 text-slate-500">
              Валидна до {formatDisplayDate(offer.validUntil)}
            </p>
          </div>
        </section>

        <footer className="offer-signatures mt-8 grid gap-8 border-t border-slate-200 pt-6 md:grid-cols-2">
          <div>
            <div className="text-[12px] font-bold text-slate-600">Изготвил:</div>
            <input value={offer.preparedBy} onChange={(event) => updateOffer("preparedBy", event.target.value)} className="mt-1 w-full bg-transparent text-[15px] font-black text-slate-950 outline-none" />
            <SignaturePad
              value={offer.signatureUrl}
              onChange={(value) => updateOffer("signatureUrl", value)}
              showClear
            />
          </div>
          <div>
            <div className="text-[12px] font-bold text-slate-600">Приел офертата:</div>
            <div className="mt-1 text-[15px] font-black text-slate-950">{offer.contact || offer.client || "Без име"}</div>
            <SignaturePad
              value={offer.acceptedSignatureUrl}
              onChange={(value) => updateOffer("acceptedSignatureUrl", value)}
            />
          </div>
        </footer>
      </article>
    </main>
  );
}
