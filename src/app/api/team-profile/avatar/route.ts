import { teamMemberProfileSelect, type TeamMember } from "../../../../lib/team-members";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

const avatarBucket = "team-avatars";

type AvatarPayload = {
  memberId?: string;
  avatarDataUrl?: string;
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
    const payload = (await request.json()) as AvatarPayload;
    const memberId = clean(payload.memberId);
    const avatarDataUrl = clean(payload.avatarDataUrl);
    const parsed = parseDataUrl(avatarDataUrl);

    if (!memberId) {
      return Response.json({ error: "Липсва потребител." }, { status: 400 });
    }

    if (!parsed || parsed.buffer.length === 0) {
      return Response.json({ error: "Невалидна снимка." }, { status: 400 });
    }

    if (parsed.buffer.length > 2_500_000) {
      return Response.json({ error: "Снимката е твърде голяма." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const now = new Date().toISOString();
    const storagePath = `${memberId}/avatar.${parsed.extension}`;
    const upload = await supabase.storage
      .from(avatarBucket)
      .upload(storagePath, parsed.buffer, {
        contentType: parsed.contentType,
        upsert: true,
      });

    if (upload.error) throw new Error(upload.error.message);

    const { data: publicUrl } = supabase.storage
      .from(avatarBucket)
      .getPublicUrl(storagePath);

    const { data, error } = await supabase
      .from("team_members")
      .update({
        photo_url: publicUrl.publicUrl,
        photo_storage_path: storagePath,
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
      { error: error instanceof Error ? error.message : "Грешка при запис на снимка." },
      { status: 500 }
    );
  }
}
