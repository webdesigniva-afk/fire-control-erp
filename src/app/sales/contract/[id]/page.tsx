"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { BackButton } from "../../../../components/back-button";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { publishSavedDocumentToClientPortal } from "../../../../lib/client-portal";
import { contractLifecycleFromPayload } from "../../../../lib/contracts";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";

type ContractLine = {
  id: string;
  name: string;
  description: string;
  periodicity: string;
  object: string;
  quantity: number;
  unitPrice: number;
  price: number;
};

type ContractData = {
  opportunityId: string;
  number: string;
  offerNumber: string;
  date: string;
  client: string;
  contact: string;
  phone: string;
  email: string;
  object: string;
  address: string;
  preparedBy: string;
  contractorSignatureUrl: string;
  clientSignatureUrl: string;
  lines: ContractLine[];
  terms: { id: string; title: string; text: string }[];
};

type TeamSession = {
  id?: string;
  name?: string;
  signature_url?: string;
};

type SignatureMethod = "onsite" | "portal" | "paper" | null;
type SignatureStatus = "draft" | "sent_to_portal" | "signed";
type ContractStatus = "draft" | "accepted" | "terminated";

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

function money(value: number) {
  return `${new Intl.NumberFormat("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} €`;
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

function readPayloadOfferLines(payload: unknown): ContractLine[] {
  if (!isRecord(payload) || !isRecord(payload.offer) || !Array.isArray(payload.offer.lines)) return [];

  return payload.offer.lines.map((line, index) => {
    const item = isRecord(line) ? line : {};
    const quantity = Number(item.quantity ?? 1) || 1;
    const unitPrice = Number(item.unitPrice ?? 0) || 0;
    return {
      id: `offer-line-${index}`,
      name: String(item.name ?? "Услуга"),
      description: String(item.description ?? ""),
      periodicity: String(item.period ?? "по график"),
      object: "",
      quantity,
      unitPrice,
      price: quantity * unitPrice,
    };
  });
}

function lineTotal(line: ContractLine) {
  if (Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice)) {
    return line.quantity * line.unitPrice;
  }
  return Number(line.price) || 0;
}

function visibleLineNote(line: ContractLine) {
  const description = line.description.trim();
  if (!description || description.toLowerCase().includes("описание от офертата")) return "";
  if (description.toLowerCase().includes("услуга по пожарна безопасност според избрания обхват")) return "";
  return description;
}

function normalizeContractLine(line: Partial<ContractLine>, index: number, objectName: string): ContractLine {
  const price = Number(line.price) || 0;
  const quantity = Number(line.quantity) || 1;
  const unitPrice = Number(line.unitPrice) || (quantity ? price / quantity : price);

  return {
    id: String(line.id || `line-${index}`),
    name: String(line.name || "Услуга"),
    description: String(line.description || ""),
    periodicity: String(line.periodicity || "по график"),
    object: String(line.object || objectName),
    quantity,
    unitPrice,
    price: lineTotal({
      id: "",
      name: "",
      description: "",
      periodicity: "",
      object: "",
      quantity,
      unitPrice,
      price,
    }),
  };
}

function readPayloadOfferNumber(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.offer)) return "";
  return String(payload.offer.number ?? "");
}

function readDraftContract(payload: unknown): Partial<ContractData> | null {
  if (!isRecord(payload) || !isRecord(payload.contract)) return null;
  return payload.contract as Partial<ContractData>;
}

function readDraftContractStatus(payload: unknown): ContractStatus {
  return contractLifecycleFromPayload(payload).status;
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
  if (signature.status === "sent_to_portal") return "Качен в клиентски портал";
  if (signature.status !== "signed") return "Чернова";
  if (signature.method === "onsite") return "Подписан на терен";
  if (signature.method === "portal") return "Подписан през клиентски портал";
  if (signature.method === "paper") return "Подписан на хартия";
  return "Подписан";
}

function contractStatusClassName(status: ContractStatus) {
  if (status === "terminated") return "border-red-200 bg-red-50 text-red-700";
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-orange-200 bg-orange-50 text-orange-700";
}

function contractStatusPanelClassName(status: ContractStatus) {
  if (status === "terminated") return "border-red-200 bg-red-50 text-red-800";
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function contractStatusLabel(status: ContractStatus) {
  if (status === "terminated") return "Прекратен";
  if (status === "accepted") return "Активен / приет";
  return "Чернова на договор";
}

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
    <div className="mt-4">
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
      <div className="no-print mt-3 flex h-10 justify-end">
        <Button type="button" variant="outline" onClick={clear}>
          Изчисти подпис
        </Button>
      </div>
    </div>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  rows = 2,
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
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      className={className}
    />
  );
}

function serviceLabel(row: { service_category?: string | null; service_name?: string | null }) {
  const category = String(row.service_category ?? "").trim();
  const name = String(row.service_name ?? "").trim();
  return category ? `${category} - ${name}` : name || "Услуга";
}

function numberValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
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

function buildServicePriceMap(rows: Record<string, unknown>[]) {
  const byId = new Map<string, Record<string, unknown>>();
  const prices = new Map<string, number>();

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (id) byId.set(id, row);
  }

  for (const row of rows) {
    const name = String(row.name ?? row.title ?? "").trim();
    if (!name) continue;

    const parentId = String(row.parent_id ?? row.parentId ?? "").trim();
    const parent = parentId ? byId.get(parentId) : null;
    const parentName = String(parent?.name ?? parent?.title ?? "").trim();
    const price = numberValue(row, ["unit_price", "unitPrice"]);

    prices.set(name.toLowerCase(), price);
    if (parentName) {
      prices.set(`${parentName} - ${name}`.toLowerCase(), price);
      prices.set(`${parentName} / ${name}`.toLowerCase(), price);
    }
  }

  return prices;
}

function servicePriceFor(
  row: { service_category?: string | null; service_name?: string | null },
  prices: Map<string, number>
) {
  const label = serviceLabel(row).toLowerCase();
  const category = String(row.service_category ?? "").trim().toLowerCase();
  const name = String(row.service_name ?? "").trim().toLowerCase();

  return prices.get(label) ?? prices.get(name) ?? prices.get(category) ?? 0;
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

async function nextContractNumber(supabase: SupabaseBrowserClient, date: Date) {
  const shortYear = String(date.getFullYear()).slice(-2);
  const { data } = await supabase
    .from("saved_documents")
    .select("number,payload")
    .eq("kind", "contract");

  const maxSequence = ((data as { number?: unknown; payload?: unknown }[] | null) ?? []).reduce((max, row) => {
    const payload = isRecord(row.payload) ? row.payload : {};
    const contract = isRecord(payload.contract) ? payload.contract : {};
    return Math.max(
      max,
      parseSequentialDocumentNumber(row.number, shortYear),
      parseSequentialDocumentNumber(contract.number, shortYear)
    );
  }, 0);
  const nextSequence = Math.max(100, maxSequence + 1);

  return `${shortYear}${String(nextSequence).padStart(4, "0")}/${formatDocumentDateForNumber(date)}`;
}

const defaultTerms = [
  {
    id: "subject",
    title: "Предмет на договора",
    text: "Изпълнителят се задължава да извършва услуги, свързани с пожарна безопасност, профилактика, сервиз и документиране за посочения обект.",
  },
  {
    id: "term",
    title: "Срок",
    text: "Настоящият договор се сключва за срок от 12 месеца, считано от деня на подписването му, като един месец преди изтичането на договора, ако страните не изявят желание за прекратяването му.",
  },
  {
    id: "payment",
    title: "Плащане",
    text: "Плащането се извършва по издадена фактура съгласно договорените цени и срокове.",
  },
  {
    id: "client",
    title: "Задължения на клиента",
    text: "Клиентът осигурява достъп до обекта, лице за контакт и условия за безопасно извършване на дейностите.",
  },
];

export default function ContractEditorPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const opportunityId = params.id;
  const isReadOnly = searchParams.get("mode") === "view";
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [acceptState, setAcceptState] = useState<"idle" | "saving" | "accepted" | "error">("idle");
  const [portalState, setPortalState] = useState<"idle" | "saving" | "published" | "error">("idle");
  const [contractStatus, setContractStatus] = useState<ContractStatus>("draft");
  const [documentSignature, setDocumentSignature] = useState<DocumentSignature>(() => defaultDocumentSignature());

  useEffect(() => {
    let cancelled = false;

    async function loadContract() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const session = readSession();
        const [oppResult, offerDocResult, contractDocResult, servicePricesResult] = await Promise.all([
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
          supabase
            .from("saved_documents")
            .select("payload")
            .eq("id", `contract-${opportunityId}`)
            .eq("kind", "contract")
            .maybeSingle(),
          supabase
            .from("services")
            .select("*")
            .is("archived_at", null),
        ]);

        if (oppResult.error || !oppResult.data) throw new Error(oppResult.error?.message || "Липсва сделка.");

        let preparedBy = session?.name || "";
        let signatureUrl = session?.signature_url || "";
        if (session?.id) {
          try {
            const response = await fetch(`/api/team-profile?memberId=${encodeURIComponent(session.id)}`);
            if (response.ok) {
              const profile = await response.json();
              preparedBy = profile.member?.name || preparedBy;
              signatureUrl = profile.member?.signature_url || signatureUrl;
            }
          } catch {
            // Local session fallback is acceptable here.
          }
        }

        const offerLines = readPayloadOfferLines(offerDocResult.data?.payload);
        const offerNumber = readPayloadOfferNumber(offerDocResult.data?.payload);
        const serviceRows = Array.isArray(oppResult.data.sales_opportunity_services)
          ? (oppResult.data.sales_opportunity_services as { service_category?: string | null; service_name?: string | null }[])
          : [];
        const servicePrices = buildServicePriceMap(
          servicePricesResult.error ? [] : ((servicePricesResult.data as Record<string, unknown>[] | null) ?? [])
        );
        const fallbackLines = serviceRows.map((row, index) => ({
          id: `service-${index}`,
          name: serviceLabel(row),
          description: "",
          periodicity: "по график",
          object: String(oppResult.data.object_name ?? ""),
          quantity: 1,
          unitPrice: servicePriceFor(row, servicePrices),
          price: servicePriceFor(row, servicePrices),
        }));

        const draft = readDraftContract(contractDocResult.data?.payload);
        const today = new Date();
        const generatedNumber = draft?.number || await nextContractNumber(supabase, today);

        const defaultContract: ContractData = {
          opportunityId,
          number: generatedNumber,
          offerNumber,
          date: dateKey(today),
          client: String(oppResult.data.company_name ?? ""),
          contact: String(oppResult.data.contact_name ?? ""),
          phone: String(oppResult.data.phone ?? ""),
          email: String(oppResult.data.email ?? ""),
          object: String(oppResult.data.object_name ?? ""),
          address: String(oppResult.data.object_address ?? ""),
          preparedBy: preparedBy || "Не е зададен потребител",
          contractorSignatureUrl: signatureUrl,
          clientSignatureUrl: "",
          lines: offerLines.length ? offerLines.map((line) => ({ ...line, object: String(oppResult.data.object_name ?? "") })) : fallbackLines,
          terms: defaultTerms,
        };
        const savedStatus = readDraftContractStatus(contractDocResult.data?.payload);
        const loadedSignature = readDocumentSignature(
          contractDocResult.data?.payload,
          draft?.clientSignatureUrl || "",
          draft?.contact || defaultContract.contact || defaultContract.client
        );
        const isAccepted = savedStatus === "accepted" || loadedSignature.status === "signed";

        if (cancelled) return;
        setContract({
          ...defaultContract,
          ...draft,
          opportunityId,
          clientSignatureUrl: loadedSignature.signatureDataUrl || draft?.clientSignatureUrl || "",
          lines: (Array.isArray(draft?.lines) && draft.lines.length ? draft.lines : defaultContract.lines)
            .map((line, index) => normalizeContractLine(line as Partial<ContractLine>, index, defaultContract.object)),
          terms: Array.isArray(draft?.terms) && draft.terms.length ? draft.terms as ContractData["terms"] : defaultContract.terms,
        });
        setDocumentSignature(loadedSignature);
        setContractStatus(savedStatus === "terminated" ? "terminated" : isAccepted ? "accepted" : "draft");
        setAcceptState(isAccepted ? "accepted" : "idle");
        setPortalState(loadedSignature.status === "sent_to_portal" ? "published" : "idle");
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadContract();
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const subtotal = useMemo(() => contract?.lines.reduce((sum, line) => sum + lineTotal(line), 0) ?? 0, [contract]);
  const vatRate = 0.2;
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  function updateContract<K extends keyof ContractData>(key: K, value: ContractData[K]) {
    setContract((current) => current ? { ...current, [key]: value } : current);
  }

  function updateLine(id: string, updates: Partial<ContractLine>) {
    setContract((current) => current ? {
      ...current,
      lines: current.lines.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...updates };
        return { ...next, price: lineTotal(next) };
      }),
    } : current);
  }

  function addLine() {
    setContract((current) => current ? {
      ...current,
      lines: [
        ...current.lines,
        {
          id: `line-${Date.now()}`,
          name: "Нова услуга",
          description: "",
          periodicity: "по график",
          object: current.object,
          quantity: 1,
          unitPrice: 0,
          price: 0,
        },
      ],
    } : current);
  }

  function removeLine(id: string) {
    setContract((current) => current ? { ...current, lines: current.lines.filter((line) => line.id !== id) } : current);
  }

  function updateTerm(id: string, text: string) {
    setContract((current) => current ? {
      ...current,
      terms: current.terms.map((term) => term.id === id ? { ...term, text } : term),
    } : current);
  }

  async function persistContract(statusOverride?: "draft" | "accepted", signatureOverride?: DocumentSignature) {
    if (!contract) throw new Error("Липсва договор.");
    const nextStatus = statusOverride ?? contractStatus;
    const baseSignature = signatureOverride ?? documentSignature;
    const nextSignature = {
      ...baseSignature,
      signatureDataUrl: baseSignature.method === "paper" ? "" : baseSignature.signatureDataUrl || contract.clientSignatureUrl,
      signedByName: baseSignature.signedByName || contract.contact || contract.client,
    };
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("saved_documents").upsert(
      {
        id: `contract-${contract.opportunityId}`,
        kind: "contract",
        number: contract.number,
        title: `Договор ${contract.number}`,
        client: contract.client,
        object: contract.object,
        href: `/sales/contract/${contract.opportunityId}`,
        total: money(total),
        payload: { contract: { ...contract, clientSignatureUrl: nextSignature.signatureDataUrl }, total, signature: nextSignature, status: nextStatus },
        saved_at_ms: Date.now(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(error.message);
  }

  async function saveDraft() {
    setSaveState("saving");
    try {
      await persistContract("draft");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function markContractSigned(method: Exclude<SignatureMethod, null>) {
    if (!contract) return;
    setAcceptState("saving");
    try {
      const now = new Date().toISOString();
      const nextSignature: DocumentSignature = {
        status: "signed",
        method,
        signedAt: now,
        signedByName: contract.contact || contract.client,
        signatureDataUrl: method === "paper" ? "" : contract.clientSignatureUrl,
        paperNote: method === "paper" ? "Документът е принтиран и подписан на хартия." : "",
      };
      setDocumentSignature(nextSignature);
      setContract((current) => current ? { ...current, clientSignatureUrl: nextSignature.signatureDataUrl } : current);
      await persistContract("accepted", nextSignature);
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("sales_opportunities")
        .update({ stage: "contract", status: "Потвърден", last_activity_at: now, updated_at: now })
        .eq("id", contract.opportunityId);
      if (error) throw new Error(error.message);
      if (method !== "portal") {
        await publishSavedDocumentToClientPortal(supabase, {
          opportunityId: contract.opportunityId,
          savedDocumentId: `contract-${contract.opportunityId}`,
          kind: "contract",
          title: `Договор ${contract.number}`,
          clientName: contract.client,
          contactName: contract.contact,
          phone: contract.phone,
          email: contract.email,
          address: contract.address,
          objectName: contract.object,
          status: "signed",
          requiresSignature: false,
          signatureMethod: method,
          signedAt: nextSignature.signedAt,
          signedByName: nextSignature.signedByName,
          signatureDataUrl: nextSignature.signatureDataUrl,
        });
      }
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: contract.opportunityId,
        type: "stage_change",
        title: "Договорът е подписан",
        description: `Договор ${contract.number} е подписан (${signatureStatusLabel(nextSignature)}).`,
      });
      setSaveState("saved");
      setContractStatus("accepted");
      setAcceptState("accepted");
    } catch {
      setAcceptState("error");
    }
  }

  async function publishToPortal() {
    if (!contract) return;
    setPortalState("saving");
    try {
      const nextSignature: DocumentSignature = {
        ...documentSignature,
        status: "sent_to_portal",
        method: "portal",
        signedByName: documentSignature.signedByName || contract.contact || contract.client,
      };
      setDocumentSignature(nextSignature);
      await persistContract("draft", nextSignature);

      const supabase = createSupabaseBrowserClient();
      await publishSavedDocumentToClientPortal(supabase, {
        opportunityId: contract.opportunityId,
        savedDocumentId: `contract-${contract.opportunityId}`,
        kind: "contract",
        title: `Договор ${contract.number}`,
        clientName: contract.client,
        contactName: contract.contact,
        phone: contract.phone,
        email: contract.email,
        address: contract.address,
        objectName: contract.object,
      });
      await supabase.from("sales_activity_logs").insert({
        opportunity_id: contract.opportunityId,
        type: "portal_publish",
        title: "Договорът е качен в клиентски портал",
        description: `Договор ${contract.number} е подготвен за онлайн подпис през клиентски портал.`,
      });

      setPortalState("published");
      setSaveState("saved");
    } catch {
      setPortalState("error");
    }
  }

  if (loadState === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100"><Loader2 className="animate-spin text-orange-500" size={28} /></main>;
  }

  if (loadState === "error" || !contract) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <Card className="mx-auto max-w-xl p-6 text-center">
          <h1 className="text-xl font-black text-slate-950">Договорът не може да се зареди.</h1>
          <BackButton fallbackHref="/sales" className="mt-4 inline-flex text-sm font-bold text-orange-600">Назад към продажби</BackButton>
        </Card>
      </main>
    );
  }

  return (
    <main className="contract-page min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackButton fallbackHref={`/sales/${contract.opportunityId}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
          <ArrowLeft size={18} />
          Назад
        </BackButton>
        <div className="flex flex-wrap gap-2">
          {!isReadOnly ? (
            <>
              <Button type="button" variant="outline" onClick={saveDraft} disabled={saveState === "saving"}>
                {saveState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                {saveState === "saved" ? "Чернова запазена" : "Запази като чернова"}
              </Button>
              <Button type="button" variant="outline" onClick={publishToPortal} disabled={portalState === "saving"}>
                {portalState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <Mail size={17} />}
                {portalState === "published" ? "Качен в портал" : "Качи в клиентски портал"}
              </Button>
              <Button type="button" onClick={() => markContractSigned("onsite")} disabled={acceptState === "saving" || !contract.clientSignatureUrl}>
                {acceptState === "saving" ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                Подпис на терен
              </Button>
              <Button type="button" variant="outline" onClick={() => markContractSigned("paper")} disabled={acceptState === "saving"}>
                <Printer size={17} />
                Подписан на хартия
              </Button>
            </>
          ) : null}
          <Button type="button" onClick={() => window.print()}>
            <Printer size={17} />
            Печат
          </Button>
        </div>
      </div>

      <div className="no-print mx-auto mb-4 w-full max-w-6xl">
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black ${contractStatusClassName(contractStatus)}`}>
          <CheckCircle2 size={17} />
          {contractStatus === "terminated" ? contractStatusLabel(contractStatus) : signatureStatusLabel(documentSignature)}
        </div>
      </div>

      {saveState === "error" || acceptState === "error" || portalState === "error" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          Договорът не беше запазен.
        </div>
      ) : null}
      {portalState === "published" && acceptState !== "accepted" ? (
        <div className="no-print mx-auto mb-4 max-w-6xl rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          Договорът е качен в клиентски портал и очаква онлайн подпис.
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

        .contract-sheet input,
        .contract-sheet textarea,
        .contract-field {
          min-width: 0;
        }

        @media screen {
          .contract-field:focus {
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

          .contract-page {
            background: #ffffff !important;
            margin: 0 !important;
            min-height: auto !important;
            padding: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          .contract-sheet {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            overflow: visible !important;
            padding: 10mm 12mm !important;
            width: 210mm !important;
          }

          .contract-sheet input,
          .contract-sheet textarea {
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
            color: inherit !important;
            overflow: visible !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          .contract-sheet input[type="date"]::-webkit-calendar-picker-indicator {
            display: none !important;
          }

          .contract-header {
            align-items: start !important;
            border-bottom: 1px solid #cbd5e1 !important;
            display: grid !important;
            gap: 10mm !important;
            grid-template-columns: minmax(0, 1fr) 82mm !important;
            padding-bottom: 6mm !important;
          }

          .contract-logo {
            width: 38mm !important;
          }

          .contract-subtitle {
            font-size: 9.2px !important;
            line-height: 1.35 !important;
            margin-top: 2.5mm !important;
            max-width: 86mm !important;
          }

          .contract-subject {
            border-left: 2px solid #f97316 !important;
            color: #334155 !important;
            font-size: 11.2px !important;
            font-weight: 700 !important;
            line-height: 1.45 !important;
            margin-top: 7mm !important;
            max-width: 106mm !important;
            padding-left: 3.5mm !important;
          }

          .contract-meta {
            background: #ffffff !important;
            border: 0 !important;
            border-radius: 4px !important;
            min-width: 0 !important;
            padding: 0 !important;
          }

          .contract-meta-title {
            border-bottom: 0 !important;
            padding-bottom: 0 !important;
          }

          .contract-meta h1 {
            border-bottom: 0 !important;
            font-size: 27px !important;
            margin: 0 !important;
            padding-bottom: 0 !important;
          }

          .contract-meta-accent {
            background: #f97316 !important;
            display: block !important;
            height: 1.2mm !important;
            margin-top: 3mm !important;
            width: 18mm !important;
          }

          .contract-meta-fields {
            border-top: 1px solid #e2e8f0 !important;
            margin-top: 5mm !important;
            padding-top: 4mm !important;
          }

          .contract-meta label {
            gap: 4mm !important;
            grid-template-columns: 18mm minmax(0, 1fr) !important;
            margin-top: 2.6mm !important;
          }

          .contract-meta span {
            color: #94a3b8 !important;
            font-size: 8px !important;
            line-height: 1.2 !important;
          }

          .contract-meta input {
            font-size: 10.2px !important;
            height: auto !important;
            line-height: 1.25 !important;
            overflow-wrap: anywhere !important;
            width: 100% !important;
          }

          .contract-party-grid {
            border-bottom: 1px solid #e2e8f0 !important;
            display: grid !important;
            gap: 10mm !important;
            grid-template-columns: 1fr 1fr !important;
            margin-top: 5mm !important;
            padding-bottom: 4.5mm !important;
          }

          .contract-party-grid h2 {
            font-size: 8.5px !important;
          }

          .contract-party-grid input {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
          }

          .contract-party-grid textarea {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
            overflow-wrap: anywhere !important;
            white-space: pre-wrap !important;
            word-break: normal !important;
          }

          .contract-party-grid textarea:first-child {
            font-size: 14px !important;
            line-height: 1.25 !important;
          }

          .contract-lines-section {
            margin-top: 5mm !important;
          }

          .contract-lines-section h2 {
            font-size: 16px !important;
          }

          .contract-lines-section p {
            font-size: 10px !important;
          }

          .contract-table {
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            font-size: 10.5px !important;
            margin-top: 4mm !important;
          }

          .contract-table th {
            background: #f1f5f9 !important;
            font-size: 8.5px !important;
            padding: 1.8mm 2mm !important;
          }

          .contract-table td {
            padding: 2.2mm 2mm !important;
          }

          .contract-table textarea,
          .contract-table input {
            font-size: 10.5px !important;
            line-height: 1.35 !important;
          }

          .contract-table tr,
          .contract-terms,
          .contract-signatures {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .contract-table col:nth-child(1) { width: 5% !important; }
          .contract-table col:nth-child(2) { width: 52% !important; }
          .contract-table col:nth-child(3) { width: 12% !important; }
          .contract-table col:nth-child(4) { width: 15% !important; }
          .contract-table col:nth-child(5) { width: 16% !important; }

          .contract-total {
            font-size: 13px !important;
            margin-top: 3mm !important;
          }

          .contract-summary {
            font-size: 10px !important;
            margin-left: auto !important;
            margin-top: 4mm !important;
            width: 54mm !important;
          }

          .contract-summary-row {
            display: grid !important;
            gap: 4mm !important;
            grid-template-columns: 1fr 1fr !important;
            padding: 1.2mm 0 !important;
          }

          .contract-summary-row strong {
            text-align: right !important;
          }

          .contract-summary-total {
            background: #020617 !important;
            border-radius: 3px !important;
            color: #ffffff !important;
            margin-top: 1.5mm !important;
            padding: 2.3mm 2.5mm !important;
          }

          .contract-summary-total strong {
            font-size: 14px !important;
          }

          .contract-terms {
            border-top: 1px solid #e2e8f0 !important;
            margin-top: 6mm !important;
            padding-top: 4mm !important;
          }

          .contract-terms > div {
            gap: 0 !important;
          }

          .contract-term {
            display: grid !important;
            gap: 4mm !important;
            grid-template-columns: 7mm minmax(0, 1fr) !important;
            padding: 3.2mm 0 !important;
          }

          .contract-term + .contract-term {
            border-top: 1px solid #eef2f7 !important;
          }

          .contract-term-number {
            align-items: start !important;
            color: #94a3b8 !important;
            display: flex !important;
            font-size: 10px !important;
            font-weight: 900 !important;
            justify-content: flex-start !important;
            line-height: 1.2 !important;
            padding-top: 0.4mm !important;
          }

          .contract-term h2 {
            color: #64748b !important;
            font-size: 8.5px !important;
            letter-spacing: 0.09em !important;
            margin: 0 !important;
          }

          .contract-term-print-text {
            color: #0f172a !important;
            display: block !important;
            font-size: 10px !important;
            font-weight: 650 !important;
            line-height: 1.42 !important;
            margin-top: 1.2mm !important;
          }

          .contract-signatures {
            border-top: 1px solid #e2e8f0 !important;
            display: grid !important;
            gap: 12mm !important;
            grid-template-columns: 1fr 1fr !important;
            margin-top: 6mm !important;
            padding-top: 5mm !important;
          }

          .contract-signatures::before {
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

          .contract-signature-box,
          .contract-signatures canvas {
            height: 24mm !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      <article className={`contract-sheet mx-auto w-full max-w-[210mm] rounded-[6px] bg-white px-[15mm] py-[14mm] shadow-sm ring-1 ring-slate-200 print:max-w-none print:rounded-none print:ring-0 ${isReadOnly ? "pointer-events-none" : ""}`}>
        <header className="contract-header grid gap-7 border-b border-slate-200 pb-7 md:grid-cols-[minmax(0,1fr)_82mm] md:items-start">
          <div className="min-w-0">
            <img src="/firecontrol-header-logo.png" alt="FIREControl" className="contract-logo h-auto w-[43mm] object-contain" />
            <p className="contract-subtitle mt-3 max-w-[92mm] text-[10.5px] font-black uppercase leading-4 tracking-wide text-slate-500">Пожарна безопасност, сервиз и абонаментно обслужване</p>
            <div className="contract-subject mt-8 max-w-[110mm] border-l-2 border-orange-500 py-1 pl-4 text-[13px] font-semibold leading-6 text-slate-700">
              Договор за услуги, свързани с пожарна безопасност, профилактика, сервиз и документиране.
            </div>
          </div>
          <div className="contract-meta min-w-0 rounded-[4px] border border-slate-200 bg-slate-50/70 p-5 print:bg-white">
            <div className="contract-meta-title border-b border-slate-200 pb-4">
              <h1 className="text-[30px] font-black uppercase leading-none tracking-tight text-slate-950">Договор</h1>
              <span className="contract-meta-accent hidden rounded-full print:block" />
            </div>
            <div className="contract-meta-fields mt-4 space-y-3 text-sm">
              <label className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Номер</span>
                <input
                  value={contract.number}
                  onChange={(event) => updateContract("number", event.target.value)}
                  className="contract-field w-full min-w-0 whitespace-nowrap bg-transparent py-1 text-[11.5px] font-black tracking-[-0.01em] text-slate-900 outline-none"
                />
              </label>
              <label className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Дата</span>
                <input
                  type="date"
                  value={contract.date}
                  onChange={(event) => updateContract("date", event.target.value)}
                  className="contract-field w-full min-w-0 bg-transparent py-1 text-[12.5px] font-bold text-slate-800 outline-none"
                />
              </label>
              <label className="grid grid-cols-[22mm_minmax(0,1fr)] items-center gap-3">
                <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400">Оферта</span>
                <input
                  value={contract.offerNumber}
                  onChange={(event) => updateContract("offerNumber", event.target.value)}
                  placeholder="№ оферта"
                  className="contract-field w-full min-w-0 bg-transparent py-1 text-[12.5px] font-bold text-slate-800 outline-none placeholder:text-slate-300"
                />
              </label>
            </div>
          </div>
        </header>

        {contract.offerNumber ? (
          <div className="no-print mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
            Договорът е обвързан с оферта № {contract.offerNumber}.
          </div>
        ) : null}

        <div className={`no-print mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${contractStatusPanelClassName(contractStatus)}`}>
          <span>Статус: {contractStatusLabel(contractStatus)}</span>
          <span className="hidden">
          Статус: {contractStatus === "accepted" ? "Договор приет" : "Чернова на договор"}
          </span>
        </div>

        <section className="contract-party-grid mt-7 grid gap-8 border-b border-slate-200 pb-7 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Възложител</h2>
            <div className="mt-3 space-y-1.5">
              <AutoResizeTextarea value={contract.client} onChange={(event) => updateContract("client", event.target.value)} rows={1} placeholder="Фирма / име" className="w-full resize-none overflow-hidden bg-transparent text-xl font-black leading-7 text-slate-950 outline-none" />
              <AutoResizeTextarea value={contract.contact} onChange={(event) => updateContract("contact", event.target.value)} rows={1} placeholder="Лице за контакт" className="w-full resize-none overflow-hidden bg-transparent text-sm font-bold leading-6 text-slate-700 outline-none" />
              <AutoResizeTextarea value={contract.phone} onChange={(event) => updateContract("phone", event.target.value)} rows={1} placeholder="Телефон" className="w-full resize-none overflow-hidden bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
              <AutoResizeTextarea value={contract.email} onChange={(event) => updateContract("email", event.target.value)} rows={1} placeholder="Email" className="w-full resize-none overflow-hidden bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
            </div>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Обект и изпълнител</h2>
            <div className="mt-3 space-y-1.5">
              <AutoResizeTextarea value={contract.object} onChange={(event) => updateContract("object", event.target.value)} rows={1} placeholder="Обект" className="w-full resize-none overflow-hidden bg-transparent text-xl font-black leading-7 text-slate-950 outline-none" />
              <AutoResizeTextarea value={contract.address} onChange={(event) => updateContract("address", event.target.value)} rows={1} placeholder="Адрес" className="w-full resize-none overflow-hidden bg-transparent text-sm font-bold leading-6 text-slate-700 outline-none" />
              <AutoResizeTextarea value={contract.preparedBy} onChange={(event) => updateContract("preparedBy", event.target.value)} rows={1} placeholder="Изготвил" className="w-full resize-none overflow-hidden bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
            </div>
          </div>
        </section>

        <section className="contract-lines-section mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black">Договорени услуги</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Данните се попълват от приетата оферта и могат да се редактират преди приемане на договора.
              </p>
            </div>
            {!isReadOnly ? (
            <div className="no-print">
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus size={17} />
                Добави ред
              </Button>
            </div>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-300">
            <table className="contract-table w-full table-fixed border-collapse text-[12px]">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[48%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[14%]" />
                <col className="no-print w-[6%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 text-left">№</th>
                  <th className="px-3 py-3 text-left">Услуга</th>
                  <th className="px-3 py-3 text-center">Количество</th>
                  <th className="px-3 py-3 text-right">Ед. цена</th>
                  <th className="px-3 py-3 text-right">Общо</th>
                  {!isReadOnly ? <th className="no-print px-2 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {contract.lines.map((line, index) => {
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
                      <AutoResizeTextarea
                        value={line.description}
                        onChange={(event) => updateLine(line.id, { description: event.target.value })}
                        rows={1}
                        placeholder="Описание от офертата"
                        className="no-print mt-1 w-full resize-none overflow-hidden bg-transparent text-[10.5px] font-medium leading-4 text-slate-500 outline-none placeholder:text-slate-300"
                      />
                    </td>
                    <td className="px-2 py-2.5 align-middle text-center">
                      <input type="number" min="0" step="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) || 0 })} className="w-full bg-transparent text-center text-[12px] font-bold outline-none" />
                    </td>
                    <td className="px-2 py-2.5 align-middle">
                      <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) || 0 })} className="w-full bg-transparent text-right text-[12px] font-bold outline-none" />
                    </td>
                    <td className="px-2 py-2.5 align-middle text-right text-[12px] font-black text-slate-950">{money(lineTotal(line))}</td>
                    {!isReadOnly ? <td className="no-print px-2 py-2 text-center align-middle"><button type="button" onClick={() => removeLine(line.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:border-red-200 hover:bg-red-100" title="Изтрий услуга" aria-label={`Изтрий услуга ${index + 1}`}><Trash2 size={14} /></button></td> : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="contract-summary mt-4 ml-auto w-full max-w-[250px] text-[12px]">
            <div className="contract-summary-row grid grid-cols-2 gap-4 py-1.5">
              <div className="font-bold text-slate-500">Междинна сума</div>
              <strong className="text-right font-bold text-slate-800">{money(subtotal)}</strong>
            </div>
            <div className="contract-summary-row grid grid-cols-2 gap-4 py-1.5">
              <div className="font-bold text-slate-500">ДДС {Math.round(vatRate * 100)}%</div>
              <strong className="text-right font-bold text-slate-800">{money(vat)}</strong>
            </div>
            <div className="contract-summary-row contract-summary-total mt-2 grid grid-cols-2 gap-4 rounded-[4px] bg-slate-950 px-3 py-3 text-white print:bg-slate-900">
              <div className="text-[13px] font-black uppercase">Общо</div>
              <strong className="text-right text-[17px] font-black">{money(total)}</strong>
            </div>
          </div>
        </section>

        <section className="contract-terms mt-7 border-t border-slate-200 pt-6">
          <div className="grid gap-3">
            {contract.terms.map((term, index) => (
              <div key={term.id} className="contract-term grid gap-4 rounded-xl border border-slate-100 bg-slate-50/40 p-4 break-inside-avoid md:grid-cols-[42px_minmax(0,1fr)] print:rounded-none print:border-0 print:bg-transparent print:p-0">
                <div className="contract-term-number flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-slate-400 shadow-sm print:h-auto print:w-auto print:rounded-none print:bg-transparent print:shadow-none">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">{term.title}</h2>
                  <AutoResizeTextarea
                    value={term.text}
                    onChange={(event) => updateTerm(term.id, event.target.value)}
                    rows={2}
                    className="mt-1 w-full resize-none overflow-hidden border-0 bg-transparent text-sm font-medium leading-6 text-slate-800 outline-none print:hidden"
                  />
                  <div className="contract-term-print-text hidden whitespace-pre-line">
                    {term.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="contract-signatures mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <div className="text-sm font-bold">Изпълнител:</div>
            <div className="mt-2 font-black">{contract.preparedBy}</div>
            <div className="contract-signature-box mt-4 h-32 rounded-xl border border-dashed border-slate-300 p-3 print:rounded-none">
              {contract.contractorSignatureUrl ? <img src={contract.contractorSignatureUrl} alt="Подпис" className="h-full max-w-full object-contain" /> : null}
            </div>
          </div>
          <div>
            <div className="text-sm font-bold">Клиент:</div>
            <div className="mt-2 font-black">{contract.contact || contract.client || "Без име"}</div>
            <SignaturePad
              value={contract.clientSignatureUrl}
              onChange={(value) => updateContract("clientSignatureUrl", value)}
            />
          </div>
        </footer>
      </article>
    </main>
  );
}
