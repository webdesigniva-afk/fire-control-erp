import { teamMemberProfileSelect, type TeamMember } from "../../../../lib/team-members";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const signatureBucket = "team-signatures";

type SignaturePayload = {
  memberId?: string;
  signatureDataUrl?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;

  const [, contentType, base64] = match;
  return {
    contentType,
    buffer: Buffer.from(base64, "base64"),
    extension: contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg",
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SignaturePayload;
    const memberId = clean(payload.memberId);
    const signatureDataUrl = clean(payload.signatureDataUrl);
    const parsed = parseDataUrl(signatureDataUrl);

    if (!memberId) {
      return Response.json({ error: "Липсва потребител." }, { status: 400 });
    }

    if (!parsed || parsed.buffer.length === 0) {
      return Response.json({ error: "Невалиден подпис." }, { status: 400 });
    }

    if (parsed.buffer.length > 1_500_000) {
      return Response.json({ error: "Подписът е твърде голям." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const now = new Date().toISOString();
    const storagePath = `${memberId}/signature.${parsed.extension}`;
    const upload = await supabase.storage
      .from(signatureBucket)
      .upload(storagePath, parsed.buffer, {
        contentType: parsed.contentType,
        upsert: true,
      });

    if (upload.error) throw new Error(upload.error.message);

    const { data: publicUrl } = supabase.storage
      .from(signatureBucket)
      .getPublicUrl(storagePath);

    const { data, error } = await supabase
      .from("team_members")
      .update({
        signature_url: publicUrl.publicUrl,
        signature_storage_path: storagePath,
        signature_updated_at: now,
        updated_at: now,
      })
      .eq("id", memberId)
      .eq("is_active", true)
      .select(teamMemberProfileSelect)
      .single<TeamMember>();

    if (error) throw new Error(error.message);

    return Response.json({ member: data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при запис на подпис." },
      { status: 500 }
    );
  }
}
