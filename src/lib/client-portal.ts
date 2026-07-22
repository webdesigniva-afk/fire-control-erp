import type { SupabaseClient } from "@supabase/supabase-js";

type PublishPortalDocumentInput = PortalOpportunityInput & {
  savedDocumentId: string;
  kind: "offer" | "contract";
  title: string;
  status?: "sent_to_portal" | "signed";
  requiresSignature?: boolean;
  signatureMethod?: "onsite" | "portal" | "paper";
  signedAt?: string | null;
  signedByName?: string;
  signatureDataUrl?: string;
};

export type PortalOpportunityInput = {
  opportunityId: string;
  clientName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  objectName: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function privateClientName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function portalClientPayload(input: PortalOpportunityInput, opportunity?: Record<string, unknown> | null) {
  const leadClientType = textValue(opportunity, ["lead_client_type"]);
  const firstName = textValue(opportunity, ["first_name"]);
  const lastName = textValue(opportunity, ["last_name"]);

  if (leadClientType === "private") {
    const name =
      privateClientName(firstName, lastName) ||
      clean(input.clientName) ||
      clean(input.contactName) ||
      "Клиент";

    return {
      client_type: "private",
      name,
      company_name: "",
      first_name: firstName,
      last_name: lastName,
      contact_person: "",
      phone: clean(input.phone),
      email: clean(input.email),
      address: clean(input.address),
      bulstat: "",
      eik: "",
    };
  }

  const clientName = clean(input.clientName) || clean(input.contactName) || "Клиент";
  return {
    client_type: "corporate",
    name: clientName,
    company_name: clientName,
    first_name: "",
    last_name: "",
    contact_person: clean(input.contactName),
    phone: clean(input.phone),
    email: clean(input.email),
    address: clean(input.address),
    bulstat: "",
    eik: "",
  };
}

async function connectOpportunityToClient(
  supabase: SupabaseClient,
  opportunityId: string,
  clientId: string
) {
  if (!clientId) return;

  await supabase
    .from("sales_opportunities")
    .update({ converted_client_id: clientId, updated_at: new Date().toISOString() })
    .eq("id", opportunityId);
}

async function findExistingClientId(supabase: SupabaseClient, clientName: string) {
  if (!clientName) return "";

  const { data: byName } = await supabase
    .from("clients")
    .select("id")
    .eq("name", clientName)
    .limit(1)
    .maybeSingle<Record<string, unknown>>();

  const byNameId = textValue(byName, ["id"]);
  if (byNameId) return byNameId;

  const { data: byCompany } = await supabase
    .from("clients")
    .select("id")
    .eq("company_name", clientName)
    .limit(1)
    .maybeSingle<Record<string, unknown>>();

  return textValue(byCompany, ["id"]);
}

async function resolvePortalClientId(
  supabase: SupabaseClient,
  input: PortalOpportunityInput
) {
  const { data: opportunity } = await supabase
    .from("sales_opportunities")
    .select("converted_client_id,lead_client_type,first_name,last_name")
    .eq("id", input.opportunityId)
    .maybeSingle<Record<string, unknown>>();

  const convertedClientId = textValue(opportunity, ["converted_client_id"]);
  if (convertedClientId) return convertedClientId;

  const clientPayload = portalClientPayload(input, opportunity);
  const clientName = textValue(clientPayload, ["name"]);
  const existingClientId = await findExistingClientId(supabase, clientName);
  if (existingClientId) {
    await supabase.from("clients").update(clientPayload).eq("id", existingClientId);
    await connectOpportunityToClient(supabase, input.opportunityId, existingClientId);
    return existingClientId;
  }

  const { data: newClient, error } = await supabase
    .from("clients")
    .insert(clientPayload)
    .select("id")
    .single<Record<string, unknown>>();

  if (error || !newClient) {
    throw new Error(error?.message || "Клиентът за портала не беше създаден.");
  }

  const newClientId = textValue(newClient, ["id"]);
  await connectOpportunityToClient(supabase, input.opportunityId, newClientId);

  return newClientId;
}

async function ensurePortalLink(supabase: SupabaseClient, clientId: string) {
  const { data: existingLink } = await supabase
    .from("client_portal_links")
    .select("id,token")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, unknown>>();

  const existingToken = textValue(existingLink, ["token"]);
  if (existingToken) return existingToken;

  const { data: newLink, error } = await supabase
    .from("client_portal_links")
    .insert({ client_id: clientId })
    .select("token")
    .single<Record<string, unknown>>();

  if (error || !newLink) {
    throw new Error(error?.message || "Портал линкът не беше създаден.");
  }

  return textValue(newLink, ["token"]);
}

export async function publishSavedDocumentToClientPortal(
  supabase: SupabaseClient,
  input: PublishPortalDocumentInput
) {
  const clientId = await resolvePortalClientId(supabase, input);
  const token = await ensurePortalLink(supabase, clientId);
  const now = new Date().toISOString();
  const status = input.status ?? "sent_to_portal";
  const requiresSignature = input.requiresSignature ?? status !== "signed";

  const { data: existingDocument } = await supabase
    .from("client_portal_documents")
    .select("id")
    .eq("client_id", clientId)
    .eq("saved_document_id", input.savedDocumentId)
    .maybeSingle<Record<string, unknown>>();

  const existingDocumentId = textValue(existingDocument, ["id"]);
  const payload = {
    client_id: clientId,
    saved_document_id: input.savedDocumentId,
    kind: input.kind,
    title: input.title,
    status,
    requires_signature: requiresSignature,
    signature_method: input.signatureMethod ?? (status === "signed" ? null : "portal"),
    signed_at: input.signedAt ?? null,
    signed_by_name: input.signedByName ?? "",
    signature_data_url: input.signatureDataUrl ?? "",
    metadata: {
      opportunityId: input.opportunityId,
      objectName: input.objectName,
    },
    updated_at: now,
  };

  if (existingDocumentId) {
    const { error } = await supabase
      .from("client_portal_documents")
      .update(payload)
      .eq("id", existingDocumentId);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("client_portal_documents")
      .insert({ ...payload, published_at: now });

    if (error) throw new Error(error.message);
  }

  return {
    clientId,
    token,
    portalPath: `/portal/${token}`,
  };
}

export async function ensureClientPortalForOpportunity(
  supabase: SupabaseClient,
  input: PortalOpportunityInput
) {
  const clientId = await resolvePortalClientId(supabase, input);
  const token = await ensurePortalLink(supabase, clientId);

  return {
    clientId,
    token,
    portalPath: `/portal/${token}`,
  };
}
