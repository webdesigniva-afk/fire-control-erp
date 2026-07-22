"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { publishSavedDocumentToClientPortal } from "../../../../lib/client-portal";
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

function readDraftContractStatus(payload: unknown): "draft" | "accepted" {
  if (!isRecord(payload)) return "draft";
  return payload.status === "accepted" ? "accepted" : "draft";
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

function nextContractNumber(id: string) {
  return `CTR-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
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
    text: "Договорът се сключва за срок от 12 месеца, считано от датата на подписване, освен ако страните не договорят друго писмено.",
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
  const [contractStatus, setContractStatus] = useState<"draft" | "accepted">("draft");
  const [documentSignature, setDocumentSignature] = useState<DocumentSignature>(() => defaultDocumentSignature());

  useEffect(() => {
    let cancelled = false;

    async function loadContract() {
      setLoadState("loading");
      try {
        const supabase = createSupabaseBrowserClient();
        const session = readSession();
        const [oppResult, offerDocResult, contractDocResult] = await Promise.all([
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
        const fallbackLines = serviceRows.map((row, index) => ({
          id: `service-${index}`,
          name: serviceLabel(row),
          description: "",
          periodicity: "по график",
          object: String(oppResult.data.object_name ?? ""),
          quantity: 1,
          unitPrice: [120, 180, 240, 360][index % 4],
          price: [120, 180, 240, 360][index % 4],
        }));

        const defaultContract: ContractData = {
          opportunityId,
          number: nextContractNumber(opportunityId),
          offerNumber,
          date: dateKey(new Date()),
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
        const draft = readDraftContract(contractDocResult.data?.payload);
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
        setContractStatus(isAccepted ? "accepted" : "draft");
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

  const total = useMemo(() => contract?.lines.reduce((sum, line) => sum + lineTotal(line), 0) ?? 0, [contract]);

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
          <Link href="/sales" className="mt-4 inline-flex text-sm font-bold text-orange-600">Назад към продажби</Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/sales/${contract.opportunityId}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm">
          <ArrowLeft size={18} />
          Назад
        </Link>
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
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black ${
          contractStatus === "accepted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-orange-200 bg-orange-50 text-orange-700"
        }`}>
          <CheckCircle2 size={17} />
          {signatureStatusLabel(documentSignature)}
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

      <article className={`mx-auto w-full max-w-6xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0 ${isReadOnly ? "pointer-events-none" : ""}`}>
        <header className="grid gap-8 border-b border-slate-200 pb-8 md:grid-cols-[1fr_auto]">
          <div className="pt-1">
            <div className="text-3xl font-black tracking-tight">FIRE<span className="text-orange-600 print:text-black">Control</span></div>
            <p className="mt-2 max-w-xl text-xs font-black uppercase tracking-wide text-slate-500">Пожарна безопасност, сервиз и абонаментно обслужване</p>
            <div className="mt-6 h-1 w-20 rounded-full bg-gradient-to-r from-red-600 to-orange-400 print:bg-slate-900" />
          </div>
          <div className="min-w-80 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <h1 className="text-3xl font-black uppercase leading-none">Договор</h1>
            <div className="mt-5 space-y-3 text-sm">
              <label className="grid grid-cols-[92px_1fr] items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Номер</span>
                <input
                  value={contract.number}
                  onChange={(event) => updateContract("number", event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
              </label>
              <label className="grid grid-cols-[92px_1fr] items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Дата</span>
                <input
                  type="date"
                  value={contract.date}
                  onChange={(event) => updateContract("date", event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
              </label>
              <label className="grid grid-cols-[92px_1fr] items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">Оферта</span>
                <input
                  value={contract.offerNumber}
                  onChange={(event) => updateContract("offerNumber", event.target.value)}
                  placeholder="№ оферта"
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none placeholder:text-slate-300 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
              </label>
            </div>
          </div>
        </header>

        {contract.offerNumber ? (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">
            Договорът е обвързан с оферта № {contract.offerNumber}.
          </div>
        ) : null}

        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
          contractStatus === "accepted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          Статус: {contractStatus === "accepted" ? "Договор приет" : "Чернова на договор"}
        </div>

        <section className="mt-7 grid gap-8 border-b border-slate-200 pb-7 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Възложител</h2>
            <div className="mt-3 space-y-1.5">
              <input value={contract.client} onChange={(event) => updateContract("client", event.target.value)} placeholder="Фирма / име" className="w-full bg-transparent text-xl font-black leading-7 text-slate-950 outline-none" />
              <input value={contract.contact} onChange={(event) => updateContract("contact", event.target.value)} placeholder="Лице за контакт" className="w-full bg-transparent text-sm font-bold leading-6 text-slate-700 outline-none" />
              <input value={contract.phone} onChange={(event) => updateContract("phone", event.target.value)} placeholder="Телефон" className="w-full bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
              <input value={contract.email} onChange={(event) => updateContract("email", event.target.value)} placeholder="Email" className="w-full bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
            </div>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wide text-slate-400">Обект и изпълнител</h2>
            <div className="mt-3 space-y-1.5">
              <input value={contract.object} onChange={(event) => updateContract("object", event.target.value)} placeholder="Обект" className="w-full bg-transparent text-xl font-black leading-7 text-slate-950 outline-none" />
              <input value={contract.address} onChange={(event) => updateContract("address", event.target.value)} placeholder="Адрес" className="w-full bg-transparent text-sm font-bold leading-6 text-slate-700 outline-none" />
              <input value={contract.preparedBy} onChange={(event) => updateContract("preparedBy", event.target.value)} placeholder="Изготвил" className="w-full bg-transparent text-sm font-semibold leading-6 text-slate-600 outline-none" />
            </div>
          </div>
        </section>

        <section className="mt-6">
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
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[45%]" />
                <col className="w-[17%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="no-print w-[5%]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 text-left">№</th>
                  <th className="px-3 py-3 text-left">Услуга и описание</th>
                  <th className="px-3 py-3 text-left">Период</th>
                  <th className="px-3 py-3 text-center">Бр.</th>
                  <th className="px-3 py-3 text-right">Ед. цена</th>
                  <th className="px-3 py-3 text-right">Общо</th>
                  {!isReadOnly ? <th className="no-print px-2 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {contract.lines.map((line, index) => (
                  <tr key={line.id} className="align-top">
                    <td className="px-3 py-4 font-black text-slate-400">{index + 1}</td>
                    <td className="px-3 py-4">
                      <AutoResizeTextarea
                        value={line.name}
                        onChange={(event) => updateLine(line.id, { name: event.target.value })}
                        rows={1}
                        className="w-full resize-none overflow-hidden bg-transparent text-sm font-black leading-5 text-slate-950 outline-none"
                      />
                      <AutoResizeTextarea
                        value={line.description}
                        onChange={(event) => updateLine(line.id, { description: event.target.value })}
                        rows={2}
                        placeholder="Описание от офертата"
                        className="mt-1 w-full resize-none overflow-hidden bg-transparent text-sm font-medium leading-5 text-slate-600 outline-none placeholder:text-slate-300"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <AutoResizeTextarea
                        value={line.periodicity}
                        onChange={(event) => updateLine(line.id, { periodicity: event.target.value })}
                        rows={1}
                        className="w-full resize-none overflow-hidden bg-transparent text-sm font-bold leading-5 text-slate-700 outline-none"
                      />
                    </td>
                    <td className="px-3 py-4 text-center">
                      <input type="number" min="0" step="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) || 0 })} className="w-full bg-transparent text-center text-sm font-bold outline-none" />
                    </td>
                    <td className="px-3 py-4">
                      <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) || 0 })} className="w-full bg-transparent text-right text-sm font-bold outline-none" />
                    </td>
                    <td className="px-3 py-4 text-right font-black text-slate-950">{money(lineTotal(line))}</td>
                    {!isReadOnly ? <td className="no-print px-2 py-3 text-center"><button type="button" onClick={() => removeLine(line.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right text-base font-black">Общо: {money(total)}</div>
        </section>

        <section className="mt-7 space-y-5 border-t border-slate-200 pt-6">
          {contract.terms.map((term) => (
            <div key={term.id} className="break-inside-avoid">
              <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{term.title}</h2>
              <AutoResizeTextarea
                value={term.text}
                onChange={(event) => updateTerm(term.id, event.target.value)}
                rows={2}
                className="w-full resize-none overflow-hidden border-0 bg-transparent text-sm font-medium leading-6 text-slate-800 outline-none"
              />
            </div>
          ))}
        </section>

        <footer className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <div className="text-sm font-bold">Изпълнител:</div>
            <div className="mt-2 font-black">{contract.preparedBy}</div>
            <div className="mt-4 h-32 rounded-xl border border-dashed border-slate-300 p-3 print:rounded-none">
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
