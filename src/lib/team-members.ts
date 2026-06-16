import { createSupabaseBrowserClient } from "./supabase/client";

export const teamRoles = [
  "Администратор",
  "Офис",
  "Техник",
  "Мениджър",
] as const;

export type TeamRole = (typeof teamRoles)[number];

export type TeamMember = {
  id: string;
  name: string;
  employee_code: string;
  phone: string;
  email: string | null;
  role: TeamRole;
  photo_url: string | null;
  photo_storage_path: string | null;
  must_change_pin: boolean;
  is_active: boolean;
  last_login_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const roleDescriptions: Record<TeamRole, string> = {
  Администратор: "Пълен достъп",
  Мениджър: "Клиенти, обекти, протоколи, екип, справки",
  Офис: "Клиенти, обекти, график, протоколи",
  Техник: "Назначени обекти, протоколи, снимки, проблеми",
};

export const teamMemberSelect =
  "id,name,employee_code,phone,email,role,photo_url,photo_storage_path,must_change_pin,is_active,last_login_at,notes,created_at,updated_at";

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && teamRoles.includes(value as TeamRole);
}

export function generateTemporaryPin() {
  const value = Math.floor(Math.random() * 10_000);
  return value.toString().padStart(4, "0");
}

export function isValidPin(value: string) {
  return /^\d{4}$/.test(value);
}

export function getTeamMemberInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "FC";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function readActiveTechnicianNamesFromTeamMembers() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("name")
    .eq("role", "Техник")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{ name?: string | null }>)
    .map((member) => String(member.name ?? "").trim())
    .filter(Boolean);
}
