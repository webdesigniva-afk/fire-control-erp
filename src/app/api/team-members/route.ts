import { teamMemberSelect, generateTemporaryPin, isTeamRole, type TeamMember } from "../../../lib/team-members";
import { hashPin } from "../../../lib/team-pin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

type CreatePayload = {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  notes?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nextEmployeeCode(rows: Array<{ employee_code: string | null }>) {
  const next = rows.reduce((max, row) => {
    const match = String(row.employee_code ?? "").match(/^FC-(\d{4,})$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;

  return `FC-${next.toString().padStart(4, "0")}`;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreatePayload;
    const name = clean(payload.name);
    const phone = clean(payload.phone);
    const email = clean(payload.email);
    const notes = clean(payload.notes);
    const role = clean(payload.role);

    if (!name || !phone || !isTeamRole(role)) {
      return Response.json({ error: "Попълнете име, телефон и роля." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const temporaryPin = generateTemporaryPin();
    const pinHash = hashPin(temporaryPin);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await supabase.from("team_members").select("employee_code");
      if (existing.error) throw new Error(existing.error.message);

      const employeeCode = nextEmployeeCode(existing.data ?? []);
      const insert = await supabase
        .from("team_members")
        .insert({
          name,
          phone,
          email: email || null,
          role,
          notes: notes || null,
          employee_code: employeeCode,
          pin_hash: pinHash,
          must_change_pin: true,
          is_active: true,
        })
        .select(teamMemberSelect)
        .single<TeamMember>();

      if (!insert.error && insert.data) {
        return Response.json({ member: insert.data, temporaryPin });
      }

      if (!String(insert.error?.message ?? "").toLowerCase().includes("duplicate")) {
        throw new Error(insert.error?.message || "Грешка при създаване на потребител.");
      }
    }

    return Response.json({ error: "Неуспешно генериране на код служител." }, { status: 409 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при създаване на потребител." },
      { status: 500 }
    );
  }
}
