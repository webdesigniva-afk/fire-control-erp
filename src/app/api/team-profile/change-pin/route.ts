import { hashPin, verifyPin } from "../../../../lib/team-pin";
import { isValidPin, teamMemberSelect, type TeamMember } from "../../../../lib/team-members";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

type ChangePinPayload = {
  memberId?: string;
  currentPin?: string;
  newPin?: string;
};

type PinLookupRow = TeamMember & {
  pin_hash: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChangePinPayload;
    const memberId = clean(payload.memberId);
    const currentPin = clean(payload.currentPin);
    const newPin = clean(payload.newPin);

    if (!memberId) {
      return Response.json({ error: "Липсва потребител." }, { status: 400 });
    }

    if (!isValidPin(newPin)) {
      return Response.json({ error: "ПИН кодът трябва да бъде 4 цифри." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const lookup = await supabase
      .from("team_members")
      .select(`${teamMemberSelect},pin_hash`)
      .eq("id", memberId)
      .eq("is_active", true)
      .single<PinLookupRow>();

    if (lookup.error) throw new Error(lookup.error.message);

    if (!lookup.data.pin_hash || !verifyPin(currentPin, lookup.data.pin_hash)) {
      return Response.json({ error: "Невалиден текущ ПИН." }, { status: 401 });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("team_members")
      .update({
        pin_hash: hashPin(newPin),
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
