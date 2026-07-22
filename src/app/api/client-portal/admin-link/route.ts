import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

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

function portalTableError(message: string) {
  if (
    message.toLowerCase().includes("unauthorized") ||
    message.includes("permission denied") ||
    message.includes("42501")
  ) {
    return "Таблиците за клиентски портал съществуват, но нямат права за достъп. Пусни обновения sql/client_portal.sql в Supabase и опитай пак.";
  }

  if (
    message.includes("client_portal_links") ||
    message.includes("client_portal_documents") ||
    message.toLowerCase().includes("does not exist")
  ) {
    return "Липсват таблиците за клиентски портал. Пусни SQL файла sql/client_portal.sql в Supabase и опитай пак.";
  }

  return message;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { clientId?: string };
    const clientId = clean(payload.clientId);

    if (!clientId) {
      return Response.json({ error: "Липсва клиент." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle<Record<string, unknown>>();

    if (clientError) throw new Error(clientError.message);
    if (!client) {
      return Response.json({ error: "Клиентът не е намерен." }, { status: 404 });
    }

    const { data: existingLink, error: existingLinkError } = await supabase
      .from("client_portal_links")
      .select("id,token")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Record<string, unknown>>();

    if (existingLinkError) {
      throw new Error(portalTableError(existingLinkError.message));
    }

    let token = textValue(existingLink, ["token"]);

    if (!token) {
      const { data: newLink, error } = await supabase
        .from("client_portal_links")
        .insert({ client_id: clientId })
        .select("token")
        .single<Record<string, unknown>>();

      if (error || !newLink) {
        throw new Error(portalTableError(error?.message || "Портал линкът не беше създаден."));
      }

      token = textValue(newLink, ["token"]);
    }

    return Response.json({
      token,
      portalPath: `/portal/${token}`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при клиентски портал." },
      { status: 500 }
    );
  }
}
