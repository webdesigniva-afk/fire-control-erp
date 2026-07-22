import { createSupabaseServerClient } from "../../../../../../../lib/supabase/server";

export const runtime = "nodejs";

type DataRecord = Record<string, unknown>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; documentId: string }> }
) {
  try {
    const { token, documentId } = await context.params;
    const cleanToken = clean(token);
    const cleanDocumentId = clean(documentId);
    const body = (await request.json().catch(() => ({}))) as {
      signedByName?: string;
      signatureDataUrl?: string;
    };
    const signedByName = clean(body.signedByName);
    const signatureDataUrl = clean(body.signatureDataUrl);

    if (!cleanToken || !cleanDocumentId) {
      return Response.json({ error: "Липсва портал или документ." }, { status: 400 });
    }

    if (!signedByName || !signatureDataUrl.startsWith("data:image/")) {
      return Response.json({ error: "Попълнете име и подпис." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: link, error: linkError } = await supabase
      .from("client_portal_links")
      .select("*")
      .eq("token", cleanToken)
      .eq("active", true)
      .maybeSingle<DataRecord>();

    if (linkError) throw new Error(linkError.message);
    if (!link) {
      return Response.json({ error: "Портал линкът не е активен." }, { status: 404 });
    }

    const expiresAt = textValue(link, ["expires_at"]);
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return Response.json({ error: "Портал линкът е изтекъл." }, { status: 410 });
    }

    const clientId = textValue(link, ["client_id"]);
    const { data: portalDocument, error: documentError } = await supabase
      .from("client_portal_documents")
      .select("*")
      .eq("id", cleanDocumentId)
      .eq("client_id", clientId)
      .maybeSingle<DataRecord>();

    if (documentError) throw new Error(documentError.message);
    if (!portalDocument) {
      return Response.json({ error: "Документът не е намерен в този портал." }, { status: 404 });
    }

    if (textValue(portalDocument, ["status"]) === "signed") {
      return Response.json({ error: "Документът вече е подписан." }, { status: 409 });
    }

    const savedDocumentId = textValue(portalDocument, ["saved_document_id"]);
    const kind = textValue(portalDocument, ["kind"]);
    const now = new Date().toISOString();
    const signature = {
      status: "signed",
      method: "portal",
      signedAt: now,
      signedByName,
      signatureDataUrl,
      paperNote: "",
    };

    const { error: portalUpdateError } = await supabase
      .from("client_portal_documents")
      .update({
        status: "signed",
        signed_at: now,
        signed_by_name: signedByName,
        signature_method: "portal",
        signature_data_url: signatureDataUrl,
        updated_at: now,
      })
      .eq("id", cleanDocumentId);

    if (portalUpdateError) throw new Error(portalUpdateError.message);

    if (savedDocumentId) {
      const { data: savedDocument, error: savedDocumentError } = await supabase
        .from("saved_documents")
        .select("*")
        .eq("id", savedDocumentId)
        .maybeSingle<DataRecord>();

      if (savedDocumentError) throw new Error(savedDocumentError.message);

      const payload = isRecord(savedDocument?.payload) ? savedDocument.payload : {};
      const nextPayload: DataRecord = {
        ...payload,
        signature,
        status: kind === "offer" ? "accepted" : "signed",
      };

      if (kind === "offer" && isRecord(nextPayload.offer)) {
        nextPayload.offer = { ...nextPayload.offer, acceptedSignatureUrl: signatureDataUrl };
      }

      if (kind === "contract" && isRecord(nextPayload.contract)) {
        nextPayload.contract = { ...nextPayload.contract, clientSignatureUrl: signatureDataUrl };
      }

      const { error: savedUpdateError } = await supabase
        .from("saved_documents")
        .update({
          payload: nextPayload,
          updated_at: now,
          saved_at_ms: Date.now(),
        })
        .eq("id", savedDocumentId);

      if (savedUpdateError) throw new Error(savedUpdateError.message);
    }

    const metadata = isRecord(portalDocument.metadata) ? portalDocument.metadata : {};
    const opportunityId = textValue(metadata, ["opportunityId"]);

    if (opportunityId) {
      const stage = kind === "offer" ? "order" : kind === "contract" ? "contract" : "";
      if (stage) {
        const { error: opportunityError } = await supabase
          .from("sales_opportunities")
          .update({
            stage,
            status: "Потвърден",
            last_activity_at: now,
            updated_at: now,
          })
          .eq("id", opportunityId);

        if (opportunityError) throw new Error(opportunityError.message);
      }

      await supabase.from("sales_activity_logs").insert({
        opportunity_id: opportunityId,
        type: "portal_signature",
        title: kind === "offer" ? "Офертата е подписана през клиентски портал" : "Договорът е подписан през клиентски портал",
        description: `Документът е подписан онлайн от ${signedByName}.`,
      });
    }

    return Response.json({ ok: true, signedAt: now, signedByName });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при подписване на документ." },
      { status: 500 }
    );
  }
}
