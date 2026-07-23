"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Clipboard,
  Edit3,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ContactLink } from "../../components/contact-link";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { PinInput } from "../../components/ui/pin-input";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  getTeamMemberInitials,
  teamMemberSelect,
  teamRoles,
  type TeamMember,
  type TeamRole,
} from "../../lib/team-members";

type LoadState = "loading" | "ready" | "error";
type Notice = { type: "success" | "error"; text: string } | null;

type TeamForm = {
  name: string;
  role: TeamRole;
  phone: string;
  email: string;
  notes: string;
};

const emptyForm: TeamForm = {
  name: "",
  role: "Техник",
  phone: "",
  email: "",
  notes: "",
};

type PermissionKey =
  | "dashboard.view"
  | "sales.view"
  | "sales.manage"
  | "clients.view"
  | "clients.manage"
  | "team.view"
  | "team.manage"
  | "locations.view"
  | "locations.manage"
  | "map.view"
  | "tasks.view"
  | "tasks.manage"
  | "protocols.view"
  | "protocols.manage"
  | "photos.manage"
  | "settings.view"
  | "settings.manage"
  | "reports.view";

type PermissionItem = {
  key: PermissionKey;
  label: string;
};

type PermissionGroup = {
  title: string;
  items: PermissionItem[];
};

type AccessRole = {
  id: string;
  name: string;
  description: string;
  permissions: Record<PermissionKey, boolean>;
};

const permissionGroups: PermissionGroup[] = [
  {
    title: "Оперативен център",
    items: [
      { key: "dashboard.view", label: "Вижда dashboard" },
      { key: "reports.view", label: "Вижда справки и обобщения" },
    ],
  },
  {
    title: "Продажби и клиенти",
    items: [
      { key: "sales.view", label: "Вижда продажби" },
      { key: "sales.manage", label: "Създава и редактира продажби" },
      { key: "clients.view", label: "Вижда клиенти" },
      { key: "clients.manage", label: "Създава и редактира клиенти" },
    ],
  },
  {
    title: "Обекти и карта",
    items: [
      { key: "locations.view", label: "Вижда обекти" },
      { key: "locations.manage", label: "Създава и редактира обекти" },
      { key: "map.view", label: "Вижда карта" },
      { key: "photos.manage", label: "Качва снимки и медия" },
    ],
  },
  {
    title: "Задачи и протоколи",
    items: [
      { key: "tasks.view", label: "Вижда задачи" },
      { key: "tasks.manage", label: "Планира и приключва задачи" },
      { key: "protocols.view", label: "Вижда протоколи" },
      { key: "protocols.manage", label: "Създава, редактира и подписва протоколи" },
    ],
  },
  {
    title: "Администрация",
    items: [
      { key: "team.view", label: "Вижда екип" },
      { key: "team.manage", label: "Управлява екип, роли и ПИН" },
      { key: "settings.view", label: "Вижда настройки" },
      { key: "settings.manage", label: "Редактира настройки и каталози" },
    ],
  },
];

const allPermissionKeys = permissionGroups.flatMap((group) => group.items.map((item) => item.key));

function createPermissions(allowed: PermissionKey[]) {
  return allPermissionKeys.reduce(
    (permissions, key) => ({
      ...permissions,
      [key]: allowed.includes(key),
    }),
    {} as Record<PermissionKey, boolean>
  );
}

function allPermissions() {
  return createPermissions(allPermissionKeys);
}

const defaultAccessRoles: AccessRole[] = [
  {
    id: "admin",
    name: "Администратор",
    description: "Пълен достъп",
    permissions: allPermissions(),
  },
  {
    id: "manager",
    name: "Мениджър",
    description: "Клиенти, обекти, протоколи, екип, справки",
    permissions: createPermissions([
      "dashboard.view",
      "reports.view",
      "sales.view",
      "sales.manage",
      "clients.view",
      "clients.manage",
      "team.view",
      "team.manage",
      "locations.view",
      "locations.manage",
      "map.view",
      "tasks.view",
      "tasks.manage",
      "protocols.view",
      "protocols.manage",
      "photos.manage",
    ]),
  },
  {
    id: "office",
    name: "Офис",
    description: "Клиенти, обекти, график, протоколи",
    permissions: createPermissions([
      "dashboard.view",
      "sales.view",
      "clients.view",
      "clients.manage",
      "locations.view",
      "locations.manage",
      "map.view",
      "tasks.view",
      "tasks.manage",
      "protocols.view",
      "protocols.manage",
    ]),
  },
  {
    id: "technician",
    name: "Техник",
    description: "Назначени обекти, протоколи, снимки, проблеми",
    permissions: createPermissions([
      "dashboard.view",
      "locations.view",
      "map.view",
      "tasks.view",
      "tasks.manage",
      "protocols.view",
      "protocols.manage",
      "photos.manage",
    ]),
  },
];

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-black uppercase text-slate-400">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-full w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            aria-label="Затвори"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Няма вход";

  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildLoginText(employeeCode: string, pin: string) {
  return `Код служител: ${employeeCode}\nВременен ПИН: ${pin}`;
}

function RoleAccessSection({
  roles,
  selectedRoleId,
  newRoleName,
  newRoleDescription,
  onSelectRole,
  onNewRoleNameChange,
  onNewRoleDescriptionChange,
  onAddRole,
  onTogglePermission,
}: {
  roles: AccessRole[];
  selectedRoleId: string;
  newRoleName: string;
  newRoleDescription: string;
  onSelectRole: (roleId: string) => void;
  onNewRoleNameChange: (value: string) => void;
  onNewRoleDescriptionChange: (value: string) => void;
  onAddRole: () => void;
  onTogglePermission: (roleId: string, permission: PermissionKey) => void;
}) {
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const isAdministrator = selectedRole.id === "admin" || selectedRole.name === "Администратор";
  const enabledCount = isAdministrator
    ? allPermissionKeys.length
    : allPermissionKeys.filter((key) => selectedRole.permissions[key]).length;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Роли и права</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {roles.length} роли · {enabledCount} разрешени действия за избраната роля
                </p>
              </div>
            </div>
          </div>
          <Button type="button" variant="outline" disabled>
            <Save size={16} />
            Запази правила
          </Button>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5 xl:border-b-0 xl:border-r">
          <div className="space-y-2">
            {roles.map((role) => {
              const selected = role.id === selectedRole.id;
              const roleAllowedCount =
                role.id === "admin" || role.name === "Администратор"
                  ? allPermissionKeys.length
                  : allPermissionKeys.filter((key) => role.permissions[key]).length;

              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => onSelectRole(role.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selected
                      ? "border-orange-200 bg-white shadow-sm"
                      : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-slate-950">{role.name}</span>
                    <Badge variant={role.id === "admin" ? "danger" : "neutral"}>
                      {roleAllowedCount}/{allPermissionKeys.length}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    {role.description || "Без описание"}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">Нова роля</p>
            <div className="mt-3 space-y-3">
              <Input
                value={newRoleName}
                onChange={(event) => onNewRoleNameChange(event.target.value)}
                placeholder="Име на ролята"
              />
              <Input
                value={newRoleDescription}
                onChange={(event) => onNewRoleDescriptionChange(event.target.value)}
                placeholder="Кратко описание"
              />
              <Button type="button" variant="secondary" className="w-full" onClick={onAddRole}>
                <Plus size={16} />
                Добави роля
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950">{selectedRole.name}</h3>
              <p className="text-sm font-semibold text-slate-500">{selectedRole.description}</p>
            </div>
            {isAdministrator ? <Badge variant="danger">Всичко е позволено</Badge> : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {permissionGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-black text-slate-900">{group.title}</h4>
                <div className="mt-3 space-y-2">
                  {group.items.map((item) => {
                    const checked = isAdministrator || selectedRole.permissions[item.key];

                    return (
                      <label
                        key={item.key}
                        className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                          checked
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        } ${isAdministrator ? "cursor-default" : "cursor-pointer hover:border-orange-200 hover:bg-orange-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isAdministrator}
                          onChange={() => onTogglePermission(selectedRole.id, item.key)}
                          className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-200"
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<Notice>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [deactivateMember, setDeactivateMember] = useState<TeamMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);
  const [resetPinMember, setResetPinMember] = useState<TeamMember | null>(null);
  const [oneTimePin, setOneTimePin] = useState<{ employeeCode: string; pin: string; title: string } | null>(null);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [pinForm, setPinForm] = useState({ pin: "", repeatPin: "" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<TeamMember | null>(null);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>(defaultAccessRoles);
  const [selectedAccessRoleId, setSelectedAccessRoleId] = useState(defaultAccessRoles[0].id);
  const [newAccessRoleName, setNewAccessRoleName] = useState("");
  const [newAccessRoleDescription, setNewAccessRoleDescription] = useState("");

  const activeCount = useMemo(() => members.filter((member) => member.is_active).length, [members]);
  const canManageAccess = currentProfile?.role === "Администратор";

  const showNotice = useCallback((text: string, type: "success" | "error" = "success") => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const loadMembers = useCallback(async () => {
    setLoadState("loading");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("team_members")
        .select(teamMemberSelect)
        .order("employee_code", { ascending: true });

      if (error) throw new Error(error.message);
      setMembers((data ?? []) as TeamMember[]);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const rawProfile = localStorage.getItem("firecontrol:team-session");
    if (!rawProfile) return;

    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentProfile(JSON.parse(rawProfile) as TeamMember);
    } catch {
      localStorage.removeItem("firecontrol:team-session");
    }
  }, []);

  function addAccessRole() {
    const name = newAccessRoleName.trim();
    if (!name) {
      showNotice("Въведете име на ролята.", "error");
      return;
    }

    if (accessRoles.some((role) => role.name.toLowerCase() === name.toLowerCase())) {
      showNotice("Вече има роля с това име.", "error");
      return;
    }

    const role: AccessRole = {
      id: `custom-${Date.now()}`,
      name,
      description: newAccessRoleDescription.trim(),
      permissions: createPermissions([]),
    };

    setAccessRoles((items) => [...items, role]);
    setSelectedAccessRoleId(role.id);
    setNewAccessRoleName("");
    setNewAccessRoleDescription("");
  }

  function toggleAccessPermission(roleId: string, permission: PermissionKey) {
    setAccessRoles((items) =>
      items.map((role) => {
        if (role.id !== roleId || role.id === "admin" || role.name === "Администратор") {
          return role;
        }

        return {
          ...role,
          permissions: {
            ...role.permissions,
            [permission]: !role.permissions[permission],
          },
        };
      })
    );
  }

  function openCreate() {
    setForm(emptyForm);
    setPhotoFile(null);
    setPhotoPreview("");
    setCreateOpen(true);
  }

  function openEdit(member: TeamMember) {
    setForm({
      name: member.name,
      role: member.role,
      phone: member.phone,
      email: member.email ?? "",
      notes: member.notes ?? "",
    });
    setPhotoFile(null);
    setPhotoPreview(member.photo_url ?? "");
    setEditingMember(member);
  }

  async function compressAvatar(file: File) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Снимката не може да бъде прочетена."));
      img.src = URL.createObjectURL(file);
    });

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Снимката не може да бъде компресирана.");

    const sourceSize = Math.min(image.width, image.height);
    const sourceX = (image.width - sourceSize) / 2;
    const sourceY = (image.height - sourceSize) / 2;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    URL.revokeObjectURL(image.src);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Снимката не може да бъде компресирана."));
        },
        "image/jpeg",
        0.78
      );
    });
  }

  async function uploadMemberPhoto(member: TeamMember, file: File) {
    const supabase = createSupabaseBrowserClient();
    const blob = await compressAvatar(file);
    const path = `${member.id}/avatar-${Date.now()}.jpg`;
    const upload = await supabase.storage
      .from("team-avatars")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });

    if (upload.error) throw new Error(upload.error.message);

    const publicUrl = supabase.storage.from("team-avatars").getPublicUrl(path).data.publicUrl;
    const { data, error } = await supabase
      .from("team_members")
      .update({
        photo_url: publicUrl,
        photo_storage_path: path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id)
      .select(teamMemberSelect)
      .single();

    if (error) throw new Error(error.message);
    return data as TeamMember;
  }

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    if (!file) {
      setPhotoPreview(editingMember?.photo_url ?? "");
      return;
    }

    setPhotoPreview(URL.createObjectURL(file));
  }

  function Avatar({ member, size = "md" }: { member: Pick<TeamMember, "name" | "photo_url">; size?: "sm" | "md" | "lg" }) {
    const classes = size === "lg" ? "h-20 w-20 text-xl" : size === "sm" ? "h-10 w-10 text-sm" : "h-12 w-12 text-base";

    return (
      <div className={`${classes} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-orange-50 font-black text-orange-700`}>
        {member.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.photo_url} alt={member.name} className="h-full w-full object-cover" />
        ) : (
          getTeamMemberInitials(member.name)
        )}
      </div>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as {
        member?: TeamMember;
        temporaryPin?: string;
        error?: string;
      };

      if (!response.ok || !result.member || !result.temporaryPin) {
        throw new Error(result.error || "Грешка при създаване.");
      }

      let createdMember = result.member as TeamMember;
      if (photoFile) {
        createdMember = await uploadMemberPhoto(createdMember, photoFile);
      }

      setMembers((items) => [...items, createdMember].sort((a, b) => a.employee_code.localeCompare(b.employee_code)));
      setCreateOpen(false);
      setOneTimePin({
        employeeCode: createdMember.employee_code,
        pin: result.temporaryPin,
        title: "Потребителят е създаден.",
      });
      showNotice("Потребителят е създаден.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Грешка при създаване.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMember) return;
    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();
      if (!form.email.trim()) {
        throw new Error("Email е задължителен.");
      }

      const { data, error } = await supabase
        .from("team_members")
        .update({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          role: form.role,
          notes: form.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingMember.id)
        .select(teamMemberSelect)
        .single();

      if (error) throw new Error(error.message);
      let savedMember = data as TeamMember;
      if (photoFile) {
        savedMember = await uploadMemberPhoto(savedMember, photoFile);
      }

      const rawSession = localStorage.getItem("firecontrol:team-session");
      if (rawSession) {
        try {
          const sessionMember = JSON.parse(rawSession) as TeamMember;
          if (sessionMember.id === savedMember.id) {
            localStorage.setItem("firecontrol:team-session", JSON.stringify(savedMember));
          }
        } catch {
          localStorage.removeItem("firecontrol:team-session");
        }
      }

      setMembers((items) => items.map((item) => (item.id === editingMember.id ? savedMember : item)));
      setEditingMember(null);
      showNotice("Промените са записани.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Грешка при запис.", "error");
    } finally {
      setSaving(false);
    }
  }

  function openResetPin(member: TeamMember) {
    setPinForm({ pin: "", repeatPin: "" });
    setResetPinMember(member);
  }

  async function handleResetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetPinMember) return;

    if (!/^\d{4}$/.test(pinForm.pin) || pinForm.pin !== pinForm.repeatPin) {
      showNotice("Новият ПИН трябва да е 4 цифри и да съвпада.", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/team-members/${resetPinMember.id}/reset-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinForm.pin }),
      });
      const result = (await response.json()) as {
        member?: TeamMember;
        error?: string;
      };

      if (!response.ok || !result.member) {
        throw new Error(result.error || "Грешка при смяна на ПИН.");
      }

      setMembers((items) => items.map((item) => (item.id === resetPinMember.id ? (result.member as TeamMember) : item)));
      setResetPinMember(null);
      showNotice("ПИН е сменен и е активен.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Грешка при смяна на ПИН.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateMember) return;
    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("team_members")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", deactivateMember.id)
        .select(teamMemberSelect)
        .single();

      if (error) throw new Error(error.message);
      setMembers((items) => items.map((item) => (item.id === deactivateMember.id ? (data as TeamMember) : item)));
      setDeactivateMember(null);
      showNotice("Потребителят е деактивиран.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Грешка при деактивиране.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(member: TeamMember) {
    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("team_members")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", member.id)
        .select(teamMemberSelect)
        .single();

      if (error) throw new Error(error.message);
      setMembers((items) => items.map((item) => (item.id === member.id ? (data as TeamMember) : item)));
      showNotice("Профилът е активиран.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Грешка при активиране.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMember() {
    if (!deleteMember) return;
    if (currentProfile?.id === deleteMember.id) {
      showNotice("Не можете да изтриете собствения си профил.", "error");
      return;
    }

    setSaving(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (deleteMember.photo_storage_path) {
        await supabase.storage.from("team-avatars").remove([deleteMember.photo_storage_path]);
      }

      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", deleteMember.id);

      if (error) throw new Error(error.message);

      setMembers((items) => items.filter((item) => item.id !== deleteMember.id));
      setDeleteMember(null);
      showNotice("Профилът е изтрит.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Грешка при изтриване.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyCredentials(employeeCode: string, pin: string) {
    await navigator.clipboard.writeText(buildLoginText(employeeCode, pin));
    showNotice("Данните за вход са копирани.");
  }

  return (
    <AppShell title="Екип" description="Управление на вътрешни потребители, роли и достъп">
      <div className="space-y-6">
        {notice ? (
          <div
            className={`fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {notice.type === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
            {notice.text}
          </div>
        ) : null}

        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                <UsersRound size={21} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Екип</h2>
                <p className="text-sm font-semibold text-slate-500">
                  {loadState === "ready" ? `${members.length} души, ${activeCount} активни` : "Зареждане на екипа..."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {loadState === "error" ? <span className="text-sm font-bold text-red-600">Грешка при зареждане</span> : null}
              <Button type="button" onClick={openCreate}>
                <Plus size={16} />
                Добави човек
              </Button>
              <Button type="button" variant="outline" onClick={loadMembers} title="Обнови">
                <RefreshCw size={16} className={loadState === "loading" ? "animate-spin" : ""} />
                Обнови
              </Button>
            </div>
          </div>
        </Card>

        {canManageAccess ? (
          <RoleAccessSection
            roles={accessRoles}
            selectedRoleId={selectedAccessRoleId}
            newRoleName={newAccessRoleName}
            newRoleDescription={newAccessRoleDescription}
            onSelectRole={setSelectedAccessRoleId}
            onNewRoleNameChange={setNewAccessRoleName}
            onNewRoleDescriptionChange={setNewAccessRoleDescription}
            onAddRole={addAccessRole}
            onTogglePermission={toggleAccessPermission}
          />
        ) : null}

        {loadState === "loading" ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="animate-spin text-orange-500" size={30} />
          </div>
        ) : members.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
              <UsersRound size={28} />
            </div>
            <p className="mt-4 text-base font-black text-slate-600">Все още няма добавени хора в екипа.</p>
            <div className="mt-5 flex justify-center">
              <Button type="button" onClick={openCreate}>
                <Plus size={16} />
                Добави първия човек
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Име</th>
                    <th className="px-4 py-3">Код служител</th>
                    <th className="px-4 py-3">Телефон</th>
                    <th className="px-4 py-3">Роля</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Последен вход</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <tr key={member.id} className="align-middle">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar member={member} size="sm" />
                          <div className="min-w-0">
                            <div className="font-black text-slate-950">{member.name}</div>
                            {member.email ? (
                              <div className="mt-1 truncate text-xs font-semibold text-slate-500">
                                <ContactLink kind="email" value={member.email} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-sm font-black text-slate-700">{member.employee_code}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-600">
                        <ContactLink kind="phone" value={member.phone} fallback="—" />
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <Badge variant={member.role === "Администратор" ? "danger" : member.role === "Техник" ? "info" : "orange"}>
                            {member.role}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <Badge variant={member.is_active ? "success" : "neutral"}>
                            {member.is_active ? "Активен" : "Неактивен"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-500">{formatDateTime(member.last_login_at)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(member)}>
                            <Edit3 size={14} />
                            Редакция
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => openResetPin(member)} disabled={saving}>
                            <KeyRound size={14} />
                            Смени ПИН
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            className="text-[0px]"
                            onClick={() => setDeactivateMember(member)}
                            disabled={saving}
                          >
                            {member.is_active ? <UserRoundX size={14} /> : <UserCheck size={14} />}
                            <span className="ml-2 text-sm">{member.is_active ? "Деактивирай" : "Управление"}</span>
                            Деактивирай
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {isCreateOpen ? (
        <ModalShell title="Добави човек" subtitle="Кодът служител и временният ПИН се генерират автоматично." onClose={() => setCreateOpen(false)}>
          <form className="space-y-5" onSubmit={handleCreate}>
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-orange-50 text-xl font-black text-orange-700">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="Снимка" className="h-full w-full object-cover" />
                ) : (
                  getTeamMemberInitials(form.name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900">Снимка по желание</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Качената снимка се изрязва в квадрат и се компресира автоматично.</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  className="mt-3 block w-full text-sm font-semibold text-slate-600 file:mr-3 file:h-9 file:rounded-xl file:border-0 file:bg-white file:px-4 file:text-sm file:font-black file:text-slate-700"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Име" required>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </Field>
              <Field label="Роля" required>
                <select
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as TeamRole })}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  {teamRoles.map((role) => <option key={role}>{role}</option>)}
                </select>
              </Field>
              <Field label="Телефон" required>
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </Field>
            </div>
            <Field label="Бележки">
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
              />
            </Field>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Отказ</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Създай
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {editingMember ? (
        <ModalShell title="Редакция" subtitle={editingMember.employee_code} onClose={() => setEditingMember(null)}>
          <form className="space-y-5" onSubmit={handleEdit}>
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-orange-50 text-xl font-black text-orange-700">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="Снимка" className="h-full w-full object-cover" />
                ) : (
                  getTeamMemberInitials(form.name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900">Снимка по желание</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Ако изберете нов файл, той ще замени текущата снимка.</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  className="mt-3 block w-full text-sm font-semibold text-slate-600 file:mr-3 file:h-9 file:rounded-xl file:border-0 file:bg-white file:px-4 file:text-sm file:font-black file:text-slate-700"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Име" required>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </Field>
              <Field label="Роля" required>
                <select
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as TeamRole })}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  {teamRoles.map((role) => <option key={role}>{role}</option>)}
                </select>
              </Field>
              <Field label="Телефон" required>
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </Field>
            </div>
            <Field label="Бележки">
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
              />
            </Field>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setEditingMember(null)}>Отказ</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Запази
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {oneTimePin ? (
        <ModalShell title={oneTimePin.title} onClose={() => setOneTimePin(null)}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-black text-emerald-800">{oneTimePin.title}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-xs font-black uppercase text-slate-400">Код служител</p>
                  <p className="mt-1 font-mono text-lg font-black text-slate-950">{oneTimePin.employeeCode}</p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3">
                  <p className="text-xs font-black uppercase text-slate-400">Временен ПИН</p>
                  <p className="mt-1 font-mono text-lg font-black text-slate-950">{oneTimePin.pin}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setOneTimePin(null)}>Затвори</Button>
              <Button type="button" onClick={() => copyCredentials(oneTimePin.employeeCode, oneTimePin.pin)}>
                <Clipboard size={16} />
                Копирай данни за вход
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {resetPinMember ? (
        <ModalShell title="Смени ПИН" subtitle={`${resetPinMember.name} · ${resetPinMember.employee_code}`} onClose={() => setResetPinMember(null)}>
          <form className="space-y-5" onSubmit={handleResetPin}>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
              Въведете нов 4-цифрен ПИН. След запис това ще бъде активният ПИН за вход на потребителя.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Нов ПИН" required>
                <PinInput
                  value={pinForm.pin}
                  onChange={(event) => setPinForm((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  required
                />
              </Field>
              <Field label="Повтори ПИН" required>
                <PinInput
                  value={pinForm.repeatPin}
                  onChange={(event) => setPinForm((current) => ({ ...current, repeatPin: event.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  required
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setResetPinMember(null)}>Отказ</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                Запази ПИН
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {deactivateMember?.is_active ? (
        <ModalShell title="Деактивирай потребител" subtitle={deactivateMember.name} onClose={() => setDeactivateMember(null)}>
          <div className="space-y-5">
            <p className="text-sm font-semibold leading-6 text-slate-600">
              Сигурни ли сте, че искате да деактивирате този потребител? Той няма да може да влиза в системата.
            </p>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setDeactivateMember(null)}>Отказ</Button>
              <Button type="button" variant="danger" onClick={handleDeactivate} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <UserRoundX size={16} />}
                Деактивирай
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      {deactivateMember && !deactivateMember.is_active ? (
        <ModalShell title="Управление на неактивен профил" subtitle={deactivateMember.name} onClose={() => setDeactivateMember(null)}>
          <div className="space-y-5">
            <p className="text-sm font-semibold leading-6 text-slate-600">
              Профилът е неактивен. Можете да го активирате отново или да го изтриете окончателно от системата.
            </p>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setDeactivateMember(null)}>Отказ</Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await handleActivate(deactivateMember);
                  setDeactivateMember(null);
                }}
                disabled={saving}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                Активирай
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setDeleteMember(deactivateMember);
                  setDeactivateMember(null);
                }}
                disabled={saving}
              >
                <Trash2 size={16} />
                Изтрий
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {deleteMember ? (
        <ModalShell title="Изтрий профил" subtitle={deleteMember.name} onClose={() => setDeleteMember(null)}>
          <div className="space-y-5">
            <p className="text-sm font-semibold leading-6 text-slate-600">
              Това действие ще изтрие профила окончателно. Използвайте го само ако този човек не трябва да остава в списъка на екипа.
            </p>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <Button type="button" variant="outline" onClick={() => setDeleteMember(null)}>Отказ</Button>
              <Button type="button" variant="danger" onClick={handleDeleteMember} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Изтрий профила
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </AppShell>
  );
}
