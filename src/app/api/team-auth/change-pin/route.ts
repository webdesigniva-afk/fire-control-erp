import { isValidPin, teamMemberSelect, type TeamMember } from "../../../../lib/team-members";
import { hashPin } from "../../../../lib/team-pin";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

type ChangePinPayload = {
  memberId?: string;
  pin?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChangePinPayload;
    const memberId = clean(payload.memberId);
    const pin = clean(payload.pin);

    if (!memberId || !isValidPin(pin)) {
      return Response.json({ error: "Въведете нов 4-цифрен ПИН." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("team_members")
      .update({
        pin_hash: hashPin(pin),
        must_change_pin: false,
        updated_at: now,
      })
      .eq("id", memberId)
      .eq("is_active", true)
      .select(teamMemberSelect)
      .single<TeamMember>();

    if (error) throw new Error(error.message);

    return Response.json({ member: data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при запис на ПИН." },
      { status: 500 }
    );
  }
}
