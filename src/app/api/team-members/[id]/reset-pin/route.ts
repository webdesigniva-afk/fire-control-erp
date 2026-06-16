import { isValidPin, teamMemberSelect, type TeamMember } from "../../../../../lib/team-members";
import { hashPin } from "../../../../../lib/team-pin";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const payload = (await request.json().catch(() => ({}))) as { pin?: string };
    const pin = typeof payload.pin === "string" ? payload.pin.trim() : "";

    if (!isValidPin(pin)) {
      return Response.json({ error: "Въведете нов 4-цифрен ПИН." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("team_members")
      .update({
        pin_hash: hashPin(pin),
        must_change_pin: false,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(teamMemberSelect)
      .single<TeamMember>();

    if (error) throw new Error(error.message);

    return Response.json({ member: data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при смяна на ПИН." },
      { status: 500 }
    );
  }
}
