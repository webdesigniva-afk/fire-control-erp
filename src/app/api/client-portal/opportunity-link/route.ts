import { ensureClientPortalForOpportunity } from "../../../../lib/client-portal";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

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

function clientName(opportunity: DataRecord) {
  const type = textValue(opportunity, ["lead_client_type"]);
  if (type === "private") {
    return [textValue(opportunity, ["first_name"]), textValue(opportunity, ["last_name"])]
      .filter(Boolean)
      .join(" ") || textValue(opportunity, ["company_name"]);
  }

  return textValue(opportunity, ["company_name"]);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { opportunityId?: string };
    const opportunityId = clean(payload.opportunityId);

    if (!opportunityId) {
      return Response.json({ error: "Липсва продажба." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: opportunity, error } = await supabase
      .from("sales_opportunities")
      .select("*")
      .eq("id", opportunityId)
      .maybeSingle<DataRecord>();

    if (error) throw new Error(error.message);
    if (!opportunity) {
      return Response.json({ error: "Продажбата не е намерена." }, { status: 404 });
    }

    const portal = await ensureClientPortalForOpportunity(supabase, {
      opportunityId,
      clientName: clientName(opportunity),
      contactName: textValue(opportunity, ["contact_name"]),
      phone: textValue(opportunity, ["phone"]),
      email: textValue(opportunity, ["email"]),
      address: textValue(opportunity, ["object_address"]),
      objectName: textValue(opportunity, ["object_name"]),
    });

    return Response.json(portal);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при клиентски портал." },
      { status: 500 }
    );
  }
}
