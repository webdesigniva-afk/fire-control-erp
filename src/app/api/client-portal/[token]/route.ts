import type { SupabaseClient } from "@supabase/supabase-js";
import { contractLifecycleFromPayload } from "../../../../lib/contracts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

type DataRecord = Record<string, unknown>;

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function boolValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return false;
  for (const key of keys) {
    if (typeof record[key] === "boolean") return Boolean(record[key]);
  }
  return false;
}

function isRecord(value: unknown): value is DataRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isMissingColumnError(message: string) {
  return message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist");
}

function clientDisplayName(client: DataRecord) {
  const type = textValue(client, ["client_type", "clientType"]);
  if (type === "private") {
    return (
      uniqueValues([
        textValue(client, ["first_name", "firstName"]),
        textValue(client, ["last_name", "lastName"]),
      ]).join(" ") || textValue(client, ["name"])
    );
  }

  return textValue(client, ["company_name", "companyName", "name", "organization"]) || "Клиент";
}

function normalizeLocation(row: DataRecord) {
  return {
    id: textValue(row, ["id"]),
    qrCode: textValue(row, ["qr_code", "code"]),
    name: textValue(row, ["name", "object_name", "title"]) || "Обект",
    address: textValue(row, ["address", "full_address"]),
    region: textValue(row, ["region", "oblast", "area"]),
    status: textValue(row, ["status"]) || "изряден",
    service: textValue(row, ["service"]),
    objectType: textValue(row, ["object_type"]),
  };
}

function normalizeEquipment(row: DataRecord) {
  return {
    id: textValue(row, ["id"]),
    locationId: textValue(row, ["location_id", "locationId"]),
    name: textValue(row, ["display_name", "name"]) || textValue(row, ["equipment_type", "type", "category"]),
    type: textValue(row, ["equipment_type", "type", "category"]),
    subtype: textValue(row, ["subtype"]),
    category: textValue(row, ["category"]),
    brand: textValue(row, ["brand"]),
    model: textValue(row, ["model"]),
    serialNumber: textValue(row, ["serial_number", "serial", "identifier", "code"]),
    capacity: textValue(row, ["capacity", "mass", "charge_mass"]),
    location: textValue(row, ["location", "object_location", "place"]),
    status: textValue(row, ["status"]),
    lastCheckDate: textValue(row, ["last_check_date", "last_check", "last_check_at", "last_service_date"]),
    nextCheckDate: textValue(row, ["next_check_date", "next_check", "next_check_at", "next_service_date"]),
  };
}

function normalizeDocument(row: DataRecord, savedDocument?: DataRecord | null) {
  const payload = isRecord(savedDocument?.payload) ? savedDocument.payload : {};
  const lifecycle = textValue(row, ["kind"]) === "contract"
    ? contractLifecycleFromPayload(payload)
    : null;
  const signature = isRecord(payload.signature) ? payload.signature : {};
  const offer = isRecord(payload.offer) ? payload.offer : null;
  const contract = isRecord(payload.contract) ? payload.contract : null;
  const totals = isRecord(payload.totals)
    ? payload.totals
    : typeof payload.total === "number"
      ? { subtotal: payload.total, vat: 0, total: payload.total }
      : null;

  return {
    id: textValue(row, ["id"]),
    kind: textValue(row, ["kind"]),
    title: textValue(row, ["title"]) || textValue(savedDocument, ["title"]) || textValue(savedDocument, ["number"]),
    number: textValue(savedDocument, ["number"]),
    status: lifecycle?.status === "terminated"
      ? "terminated"
      : textValue(row, ["status"]) || textValue(payload, ["status"]) || "published",
    requiresSignature: boolValue(row, ["requires_signature", "requiresSignature"]),
    signatureMethod: textValue(row, ["signature_method", "signatureMethod"]) || textValue(signature, ["method"]),
    signedAt: textValue(row, ["signed_at", "signedAt"]) || textValue(signature, ["signedAt"]),
    signedByName: textValue(row, ["signed_by_name", "signedByName"]) || textValue(signature, ["signedByName"]),
    signatureDataUrl: textValue(row, ["signature_data_url", "signatureDataUrl"]) || textValue(signature, ["signatureDataUrl"]),
    publishedAt: textValue(row, ["published_at", "publishedAt"]),
    href: textValue(savedDocument, ["href"]),
    total: textValue(savedDocument, ["total"]),
    objectName: textValue(savedDocument, ["object"]),
    savedDocumentId: textValue(row, ["saved_document_id", "savedDocumentId"]),
    locationId: textValue(row, ["location_id", "locationId"]),
    documentData: {
      offer,
      contract,
      totals,
    },
  };
}

function normalizeProtocol(row: DataRecord) {
  const payload = isRecord(row["protocol_payload"]) ? row["protocol_payload"] : {};

  return {
    id: textValue(row, ["id"]),
    number: textValue(row, ["protocol_number", "number"]),
    type: textValue(row, ["protocol_type", "type"]),
    date: textValue(row, ["protocol_date", "created_at"]),
    status: textValue(row, ["status"]),
    clientName: textValue(row, ["client_name"]),
    objectName: textValue(row, ["object_name"]),
    technician: textValue(row, ["technician"]),
    locationId: textValue(row, ["location_id"]),
    objectCode: textValue(row, ["object_code"]),
    protocolPayload: payload,
  };
}

function normalizeTask(row: DataRecord) {
  return {
    id: textValue(row, ["id"]),
    title: textValue(row, ["title"]) || textValue(row, ["task_type"]) || "Задача",
    description: textValue(row, ["description"]),
    taskType: textValue(row, ["task_type"]),
    status: textValue(row, ["status"]),
    dueDate: textValue(row, ["due_date"]),
    objectId: textValue(row, ["object_id"]),
    objectCode: textValue(row, ["object_code"]),
    objectName: textValue(row, ["object_name"]),
    assignedTo: textValue(row, ["assigned_to", "technician", "resolved_by"]),
    completedAt: textValue(row, ["completed_at", "resolved_at"]),
  };
}

function signatureMethod(value: string) {
  return value === "onsite" || value === "portal" || value === "paper" ? value : null;
}

function savedDocumentSignature(savedDocument: DataRecord) {
  const payload = isRecord(savedDocument.payload) ? savedDocument.payload : {};
  const signature = isRecord(payload.signature) ? payload.signature : {};
  const offer = isRecord(payload.offer) ? payload.offer : {};
  const contract = isRecord(payload.contract) ? payload.contract : {};
  const status = textValue(signature, ["status"]) || textValue(payload, ["status"]);
  const dataUrl =
    textValue(signature, ["signatureDataUrl"]) ||
    textValue(offer, ["acceptedSignatureUrl"]) ||
    textValue(contract, ["clientSignatureUrl"]);

  return {
    isSigned: status === "signed" || status === "accepted" || Boolean(dataUrl),
    method: signatureMethod(textValue(signature, ["method"])),
    signedAt: textValue(signature, ["signedAt"]),
    signedByName:
      textValue(signature, ["signedByName"]) ||
      textValue(contract, ["contact", "client"]) ||
      textValue(offer, ["contact", "client"]),
    signatureDataUrl: dataUrl,
    opportunityId: textValue(offer, ["opportunityId"]) || textValue(contract, ["opportunityId"]),
  };
}

async function readSignedSavedDocumentsForClient(
  supabase: SupabaseClient,
  clientId: string,
  client: DataRecord
) {
  const possibleClientNames = uniqueValues([
    clientDisplayName(client),
    textValue(client, ["name"]),
    textValue(client, ["company_name", "companyName"]),
  ]);

  const [byClientResult, opportunitiesResult] = await Promise.all([
    possibleClientNames.length
      ? supabase
          .from("saved_documents")
          .select("*")
          .in("client", possibleClientNames)
          .in("kind", ["offer", "contract"])
          .limit(200)
      : { data: [] as DataRecord[], error: null },
    supabase
      .from("sales_opportunities")
      .select("id")
      .eq("converted_client_id", clientId)
      .limit(200),
  ]);

  if (byClientResult.error) throw new Error(byClientResult.error.message);
  if (opportunitiesResult.error) throw new Error(opportunitiesResult.error.message);

  const opportunityIds = uniqueValues(
    ((opportunitiesResult.data ?? []) as DataRecord[]).map((row) => textValue(row, ["id"]))
  );
  const savedDocumentIds = uniqueValues(opportunityIds.flatMap((id) => [`offer-${id}`, `contract-${id}`]));
  const byOpportunityResult = savedDocumentIds.length
    ? await supabase
        .from("saved_documents")
        .select("*")
        .in("id", savedDocumentIds)
    : { data: [] as DataRecord[], error: null };

  if (byOpportunityResult.error) throw new Error(byOpportunityResult.error.message);

  const documentsById = new Map<string, DataRecord>();
  for (const row of [
    ...((byClientResult.data ?? []) as DataRecord[]),
    ...((byOpportunityResult.data ?? []) as DataRecord[]),
  ]) {
    const id = textValue(row, ["id"]);
    if (id) documentsById.set(id, row);
  }

  return Array.from(documentsById.values()).filter((row) => savedDocumentSignature(row).isSigned);
}

async function syncSignedSavedDocumentsToPortal(
  supabase: SupabaseClient,
  clientId: string,
  client: DataRecord
) {
  const [signedSavedDocuments, existingResult] = await Promise.all([
    readSignedSavedDocumentsForClient(supabase, clientId, client),
    supabase
      .from("client_portal_documents")
      .select("id,saved_document_id")
      .eq("client_id", clientId),
  ]);

  if (existingResult.error) throw new Error(existingResult.error.message);

  const existingBySavedId = new Map(
    ((existingResult.data ?? []) as DataRecord[]).map((row) => [
      textValue(row, ["saved_document_id"]),
      textValue(row, ["id"]),
    ])
  );
  const now = new Date().toISOString();

  for (const savedDocument of signedSavedDocuments) {
    const savedDocumentId = textValue(savedDocument, ["id"]);
    const kind = textValue(savedDocument, ["kind"]);
    if (!savedDocumentId || (kind !== "offer" && kind !== "contract")) continue;

    const signature = savedDocumentSignature(savedDocument);
    const payload = {
      client_id: clientId,
      saved_document_id: savedDocumentId,
      kind,
      title:
        textValue(savedDocument, ["title"]) ||
        `${kind === "offer" ? "Оферта" : "Договор"} ${textValue(savedDocument, ["number"])}`,
      status: "signed",
      requires_signature: false,
      signature_method: signature.method,
      signed_at: signature.signedAt || null,
      signed_by_name: signature.signedByName,
      signature_data_url: signature.signatureDataUrl,
      metadata: {
        opportunityId: signature.opportunityId,
        objectName: textValue(savedDocument, ["object"]),
      },
      updated_at: now,
    };

    const existingId = existingBySavedId.get(savedDocumentId);
    if (existingId) {
      const { error } = await supabase
        .from("client_portal_documents")
        .update(payload)
        .eq("id", existingId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("client_portal_documents")
        .insert({ ...payload, published_at: now });
      if (error) throw new Error(error.message);
    }
  }
}

async function readTasksForPortal(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  taskIdentifiers: string[]
) {
  if (!taskIdentifiers.length) {
    return [] as DataRecord[];
  }

  const result = await supabase
    .from("service_tasks")
    .select("*")
    .in("object_id", taskIdentifiers)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100);

  if (!result.error) {
    return ((result.data ?? []) as DataRecord[]);
  }

  if (isMissingColumnError(result.error.message)) {
    return [] as DataRecord[];
  }

  throw new Error(result.error.message);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const cleanToken = typeof token === "string" ? token.trim() : "";

    if (!cleanToken) {
      return Response.json({ error: "Липсва портал линк." }, { status: 400 });
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
    const [{ data: client, error: clientError }, { data: locations }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).maybeSingle<DataRecord>(),
      supabase.from("locations").select("*").eq("client_id", clientId).order("name", { ascending: true }),
    ]);

    if (clientError) throw new Error(clientError.message);
    if (!client) {
      return Response.json({ error: "Клиентът не е намерен." }, { status: 404 });
    }

    const locationRows = (locations ?? []) as DataRecord[];
    await syncSignedSavedDocumentsToPortal(supabase, clientId, client);

    const portalDocumentsResult = await supabase
      .from("client_portal_documents")
      .select("*")
      .eq("client_id", clientId)
      .is("archived_at", null)
      .order("published_at", { ascending: false });

    if (portalDocumentsResult.error) throw new Error(portalDocumentsResult.error.message);

    const portalDocumentRows = (portalDocumentsResult.data ?? []) as DataRecord[];
    const savedDocumentIds = uniqueValues(portalDocumentRows.map((row) => textValue(row, ["saved_document_id"])));
    const savedDocumentsResult = savedDocumentIds.length
      ? await supabase.from("saved_documents").select("*").in("id", savedDocumentIds)
      : { data: [] as DataRecord[], error: null };

    if (savedDocumentsResult.error) throw new Error(savedDocumentsResult.error.message);

    const savedDocumentById = new Map(
      ((savedDocumentsResult.data ?? []) as DataRecord[]).map((row) => [textValue(row, ["id"]), row])
    );

    const locationIds = uniqueValues(locationRows.map((row) => textValue(row, ["id"])));
    const locationCodes = uniqueValues(locationRows.flatMap((row) => [
      textValue(row, ["qr_code"]),
      textValue(row, ["code"]),
      textValue(row, ["name", "object_name", "title"]),
    ]));

    const protocolsResult = locationIds.length
      ? await supabase
          .from("protocols")
          .select("*")
          .in("location_id", locationIds)
          .order("protocol_date", { ascending: false, nullsFirst: false })
          .limit(100)
      : { data: [] as DataRecord[], error: null };

    if (protocolsResult.error) throw new Error(protocolsResult.error.message);

    const equipmentResult = locationIds.length
      ? await supabase
          .from("equipment")
          .select("*")
          .in("location_id", locationIds)
          .eq("archived", false)
          .order("created_at", { ascending: true })
      : { data: [] as DataRecord[], error: null };

    if (equipmentResult.error) throw new Error(equipmentResult.error.message);

    const equipmentByLocationId = new Map<string, ReturnType<typeof normalizeEquipment>[]>();
    for (const row of ((equipmentResult.data ?? []) as DataRecord[]).map(normalizeEquipment)) {
      if (!row.locationId) continue;
      equipmentByLocationId.set(row.locationId, [
        ...(equipmentByLocationId.get(row.locationId) ?? []),
        row,
      ]);
    }

    const taskRows = await readTasksForPortal(supabase, uniqueValues([...locationIds, ...locationCodes]));

    await supabase
      .from("client_portal_links")
      .update({ last_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", textValue(link, ["id"]));

    return Response.json({
      portal: {
        token: cleanToken,
        lastOpenedAt: textValue(link, ["last_opened_at"]),
      },
      client: {
        id: clientId,
        name: clientDisplayName(client),
        clientType: textValue(client, ["client_type", "clientType"]) || "corporate",
        contactPerson: textValue(client, ["contact_person", "contactPerson"]),
        phone: textValue(client, ["phone"]),
        email: textValue(client, ["email"]),
        address: textValue(client, ["address"]),
      },
      locations: locationRows.map((row) => {
        const location = normalizeLocation(row);
        return {
          ...location,
          equipment: equipmentByLocationId.get(location.id) ?? [],
        };
      }),
      documents: portalDocumentRows.map((row) =>
        normalizeDocument(row, savedDocumentById.get(textValue(row, ["saved_document_id"])) ?? null)
      ),
      protocols: ((protocolsResult.data ?? []) as DataRecord[]).map(normalizeProtocol),
      tasks: taskRows.map(normalizeTask),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при зареждане на клиентски портал." },
      { status: 500 }
    );
  }
}
