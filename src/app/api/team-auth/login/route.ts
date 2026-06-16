import { isValidPin, teamMemberSelect, type TeamMember } from "../../../../lib/team-members";
import { verifyPin } from "../../../../lib/team-pin";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

type LoginPayload = {
  pin?: string;
};

type LoginLookupRow = TeamMember & {
  pin_hash: string | null;
  failed_login_attempts: number | null;
  locked_until: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as LoginPayload;
    const pin = clean(payload.pin);

    if (!isValidPin(pin)) {
      return Response.json({ error: "Въведете 4-цифрен ПИН." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const lookup = await supabase
      .from("team_members")
      .select(`${teamMemberSelect},pin_hash,failed_login_attempts,locked_until`)
      .eq("is_active", true)
      .returns<LoginLookupRow[]>();

    if (lookup.error) throw new Error(lookup.error.message);

    const unlockedRows = (lookup.data ?? []).filter((row) => {
      const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
      return !lockedUntil || lockedUntil.getTime() <= Date.now();
    });

    const matches = unlockedRows.filter((row) => row.pin_hash && verifyPin(pin, row.pin_hash));

    if (matches.length === 0) {
      return Response.json({ error: "Невалиден ПИН." }, { status: 401 });
    }

    if (matches.length > 1) {
      return Response.json(
        { error: "Този ПИН се използва от повече от един потребител. Сменете ПИН през Екип." },
        { status: 409 }
      );
    }

    const member = matches[0];
    const now = new Date().toISOString();
    const update = await supabase
      .from("team_members")
      .update({
        last_login_at: now,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: now,
      })
      .eq("id", member.id)
      .select(teamMemberSelect)
      .single<TeamMember>();

    if (update.error) throw new Error(update.error.message);

    return Response.json({ member: update.data });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при вход." },
      { status: 500 }
    );
  }
}
