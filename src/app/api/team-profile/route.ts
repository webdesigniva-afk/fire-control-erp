import { teamMemberProfileSelect, type TeamMember } from "../../../lib/team-members";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

type ProfilePayload = {
  memberId?: string;
  phone?: string;
  email?: string;
};

type ProfileActivity = {
  lastProtocol: string;
  assignedVisits: number | null;
  activeProblems: number | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function textValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function rowIdentifiers(row: Record<string, unknown>) {
  return uniqueValues([
    textValue(row, ["object_id"]),
    textValue(row, ["object_code"]),
    textValue(row, ["object_name"]),
  ]);
}

function protocolIdentifiers(row: Record<string, unknown>) {
  return uniqueValues([
    textValue(row, ["source_protocol_id"]),
    textValue(row, ["source_protocol_number"]),
    textValue(row, ["source_label"]),
  ]);
}

async function readActivity(member: TeamMember): Promise<ProfileActivity> {
  const supabase = createSupabaseServerClient();
  const activity: ProfileActivity = {
    lastProtocol: "",
    assignedVisits: null,
    activeProblems: null,
  };

  try {
    const { data } = await supabase
      .from("protocols")
      .select("protocol_number,number,protocol_date,created_at,updated_at")
      .eq("technician", member.name)
      .order("protocol_date", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const protocol = (data?.[0] ?? null) as Record<string, unknown> | null;
    if (protocol) {
      activity.lastProtocol = textValue(protocol, ["protocol_number", "number"]);
    }
  } catch {
    activity.lastProtocol = "";
  }

  try {
    const { count } = await supabase
      .from("service_tasks")
      .select("id", { count: "exact", head: true })
      .or(`status.eq.planned,status.eq.active,status.eq.OPEN,status.eq.IN_PROGRESS`)
      .ilike("activities", `%${member.name}%`);

    activity.assignedVisits = count ?? 0;
  } catch {
    activity.assignedVisits = null;
  }

  try {
    const [tasksResult, locationsResult, protocolsResult] = await Promise.all([
      supabase
        .from("service_tasks")
        .select("id,object_id,object_code,object_name,source_protocol_id,source_protocol_number,source_label,status,task_type")
        .or("task_type.eq.defect,task_type.eq.problem")
        .not("status", "in", "(completed,COMPLETED,resolved,RESOLVED,done,DONE)"),
      supabase
        .from("locations")
        .select("id,qr_code,code,name,object_name,title"),
      supabase
        .from("protocols")
        .select("id,protocol_number,number"),
    ]);

    if (tasksResult.error) throw new Error(tasksResult.error.message);

    const locationIdentifiers = new Set(
      ((locationsResult.data as Record<string, unknown>[] | null) ?? []).flatMap((row) =>
        uniqueValues([
          textValue(row, ["id"]),
          textValue(row, ["qr_code", "code"]),
          textValue(row, ["name", "object_name", "title"]),
        ])
      )
    );
    const protocolIdentifierSet = new Set(
      ((protocolsResult.data as Record<string, unknown>[] | null) ?? []).flatMap((row) =>
        uniqueValues([
          textValue(row, ["id"]),
          textValue(row, ["protocol_number", "number"]),
        ])
      )
    );

    const activeProblemRows = ((tasksResult.data as Record<string, unknown>[] | null) ?? [])
      .filter((row) => {
        const linkedLocation = rowIdentifiers(row).some((value) => locationIdentifiers.has(value));
        const linkedProtocol = protocolIdentifiers(row).some((value) =>
          Array.from(protocolIdentifierSet).some((protocolValue) => value.includes(protocolValue) || protocolValue.includes(value))
        );

        return linkedLocation || linkedProtocol;
      });

    activity.activeProblems = activeProblemRows.length;
  } catch {
    try {
      const { count } = await supabase
      .from("service_tasks")
      .select("id", { count: "exact", head: true })
      .or("task_type.eq.defect,task_type.eq.problem")
      .not("status", "in", "(completed,COMPLETED,resolved,RESOLVED,done,DONE)");

      activity.activeProblems = count ?? 0;
    } catch {
      activity.activeProblems = null;
    }
  }

  return activity;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = clean(searchParams.get("memberId"));

    if (!memberId) {
      return Response.json({ error: "Липсва потребител." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("team_members")
      .select(teamMemberProfileSelect)
      .eq("id", memberId)
      .eq("is_active", true)
      .single<TeamMember>();

    if (error) throw new Error(error.message);

    return Response.json({ member: data, activity: await readActivity(data) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Грешка при зареждане на профила." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as ProfilePayload;
    const memberId = clean(payload.memberId);
    const phone = clean(payload.phone);
    const email = clean(payload.email);

    if (!memberId) {
      return Response.json({ error: "Липсва потребител." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("team_members")
      .update({
        phone,
        email: email || null,
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
      { error: error instanceof Error ? error.message : "Грешка при запис на профила." },
      { status: 500 }
    );
  }
}
