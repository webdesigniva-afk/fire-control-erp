"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  Edit3,
  ExternalLink,
  Eye,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { ContactLink } from "../../components/contact-link";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  DeleteConfirmDialog,
  type DeleteConfirmDialogState,
} from "../../components/ui/delete-confirm-dialog";
import { Input } from "../../components/ui/input";
import { readServiceCenters } from "../../lib/settings";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type DataRecord = Record<string, unknown>;

type Service = {
  id: string;
  name: string;
};

type ClientLocation = {
  id: string;
  qrCode: string;
  name: string;
  address: string;
  region: string;
  status: string;
  services: Service[];
};

type ClientProfile = {
  id: string;
  clientType: "corporate" | "private";
  name: string;
  companyName: string;
  firstName: string;
  lastName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bulstat: string;
  locations: ClientLocation[];
};

type ClientFormState = {
  clientType: "corporate" | "private";
  companyName: string;
  firstName: string;
  lastName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bulstat: string;
};

const clientsPerPage = 10;

const emptyForm: ClientFormState = {
  clientType: "corporate",
  companyName: "",
  firstName: "",
  lastName: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  bulstat: "",
};

function writePortalWindowMessage(portalWindow: Window, title: string, message: string) {
  portalWindow.document.title = title;
  portalWindow.document.body.replaceChildren();
  portalWindow.document.body.style.fontFamily = "Inter, Arial, sans-serif";
  portalWindow.document.body.style.padding = "32px";
  portalWindow.document.body.style.color = "#1f2a44";

  const heading = portalWindow.document.createElement("h1");
  heading.textContent = title;
  heading.style.fontSize = "22px";
  heading.style.margin = "0 0 12px";

  const paragraph = portalWindow.document.createElement("p");
  paragraph.textContent = message;
  paragraph.style.fontSize = "16px";
  paragraph.style.lineHeight = "1.5";
  paragraph.style.maxWidth = "680px";

  portalWindow.document.body.append(heading, paragraph);
}

function textValue(record: DataRecord | null | undefined, keys: string[]) {
  if (!record) return "";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return "";
}

function formFromClient(client: ClientProfile): ClientFormState {
  return {
    ...emptyForm,
    clientType: client.clientType,
    companyName: client.companyName || client.name,
    firstName: client.firstName,
    lastName: client.lastName,
    contactPerson: client.contactPerson,
    phone: client.phone,
    email: client.email,
    address: client.address,
    bulstat: client.bulstat,
  };
}

function privateClientName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function validPhone(value: string) {
  return /^[+\d][\d\s().-]{5,}$/.test(value.trim());
}

function validEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function clientDisplayName(form: ClientFormState) {
  return form.clientType === "private"
    ? privateClientName(form.firstName, form.lastName)
    : form.companyName.trim();
}

function validateClientForm(form: ClientFormState) {
  if (form.clientType === "corporate" && !form.companyName.trim()) {
    return "Име на фирма е задължително.";
  }

  if (form.clientType === "private") {
    if (!form.firstName.trim()) return "Име е задължително.";
    if (!form.lastName.trim()) return "Фамилия е задължителна.";
  }

  if (!form.phone.trim()) return "Телефон е задължителен.";
  if (!validPhone(form.phone)) return "Въведете валиден телефон.";
  if (!validEmail(form.email)) return "Въведете валиден имейл.";

  return "";
}

function clientPayload(form: ClientFormState) {
  const displayName = clientDisplayName(form);

  return {
    client_type: form.clientType,
    name: displayName,
    company_name: form.clientType === "corporate" ? form.companyName.trim() : "",
    first_name: form.clientType === "private" ? form.firstName.trim() : "",
    last_name: form.clientType === "private" ? form.lastName.trim() : "",
    contact_person: form.clientType === "corporate" ? form.contactPerson.trim() : "",
    phone: form.phone.trim(),
    email: form.email.trim(),
    address: form.address.trim(),
    bulstat: form.clientType === "corporate" ? form.bulstat.trim() : "",
    eik: form.clientType === "corporate" ? form.bulstat.trim() : "",
  };
}

function clientTypeLabel(type: ClientProfile["clientType"]) {
  return type === "private" ? "Частен" : "Корпоративен";
}

function clientTypeVariant(type: ClientProfile["clientType"]) {
  return type === "private" ? "neutral" : "info";
}

function ClientField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-black uppercase text-slate-400">
        {label}
      </label>
      <Input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      />
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState<
    "all" | ClientProfile["clientType"]
  >("all");
  const [clientPage, setClientPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [editingClientId, setEditingClientId] = useState("");
  const [formMode, setFormMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "error" | "saving" | "deleting"
  >("loading");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [portalOpeningClientId, setPortalOpeningClientId] = useState("");
  const [deleteDialog, setDeleteDialog] =
    useState<DeleteConfirmDialogState | null>(null);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    const typeFilteredClients =
      clientTypeFilter === "all"
        ? clients
        : clients.filter((client) => client.clientType === clientTypeFilter);

    if (!query) return typeFilteredClients;

    return typeFilteredClients.filter((client) =>
      [
        client.name,
        clientTypeLabel(client.clientType),
        client.contactPerson,
        client.phone,
        client.email,
        client.bulstat,
        client.locations.map((location) => location.name).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [clients, search, clientTypeFilter]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;
  const editingClient =
    clients.find((client) => client.id === editingClientId) ?? null;

  const totalLocations = clients.reduce(
    (total, client) => total + client.locations.length,
    0
  );
  const showCorporateColumns = clientTypeFilter === "corporate";
  const showEmailColumn = clientTypeFilter !== "corporate";
  const clientTableColumnCount =
    5 + (showEmailColumn ? 1 : 0) + (showCorporateColumns ? 2 : 0);
  const totalClientPages = Math.max(
    1,
    Math.ceil(filteredClients.length / clientsPerPage)
  );
  const safeClientPage = Math.min(clientPage, totalClientPages);
  const clientPageStart = (safeClientPage - 1) * clientsPerPage;
  const pagedClients = filteredClients.slice(
    clientPageStart,
    clientPageStart + clientsPerPage
  );
  const visibleClientStart = filteredClients.length ? clientPageStart + 1 : 0;
  const visibleClientEnd = Math.min(
    clientPageStart + clientsPerPage,
    filteredClients.length
  );

  function updateForm(key: keyof ClientFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateForm() {
    setForm(emptyForm);
    setEditingClientId("");
    setFormMode("create");
    setMessage("");
    setErrorMessage("");
  }

  function toggleClientDetails(client: ClientProfile) {
    setSelectedClientId((current) => (current === client.id ? "" : client.id));
  }

  function openEditForm(client: ClientProfile) {
    setSelectedClientId("");
    setEditingClientId(client.id);
    setForm(formFromClient(client));
    setFormMode("edit");
    setMessage("");
    setErrorMessage("");
  }

  async function openClientPortal(client: ClientProfile) {
    setPortalOpeningClientId(client.id);
    setErrorMessage("");
    const portalWindow = window.open("", "_blank");

    if (portalWindow) {
      writePortalWindowMessage(portalWindow, "Клиентски портал", "Отваряне на клиентски портал...");
    }

    try {
      const response = await fetch("/api/client-portal/admin-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      });
      const payload = (await response.json()) as { portalPath?: string; error?: string };

      if (!response.ok || !payload.portalPath) {
        throw new Error(payload.error || "Клиентският портал не може да се отвори.");
      }

      if (portalWindow) {
        portalWindow.location.assign(payload.portalPath);
      } else {
        window.location.href = payload.portalPath;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Грешка при отваряне на клиентски портал.";
      if (portalWindow) {
        writePortalWindowMessage(portalWindow, "Порталът не може да се отвори", message);
      }
      setErrorMessage(message);
    } finally {
      setPortalOpeningClientId("");
    }
  }
  async function loadClients() {
    setLoadState("loading");
    setMessage("");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const [clientsResult, locationsResult] = await Promise.all([
        supabase.from("clients").select("*").order("name", { ascending: true }),
        supabase.from("locations").select("*").order("name", { ascending: true }),
      ]);

      if (
        clientsResult.error ||
        locationsResult.error
      ) {
        setErrorMessage(
          clientsResult.error?.message ||
            locationsResult.error?.message ||
            "Грешка при зареждане"
        );
        setLoadState("error");
        return;
      }

      const clientRows = (clientsResult.data as DataRecord[]) ?? [];
      const locationRows = (locationsResult.data as DataRecord[]) ?? [];
      const mappedServices = readServiceCenters()
        .filter((serviceCenter) => serviceCenter.active)
        .map((serviceCenter) => ({
          id: serviceCenter.id,
          name: serviceCenter.name,
        }));

      const mappedClients = clientRows.map((client) => {
        const clientId = textValue(client, ["id"]);
        const clientLocations = locationRows
          .filter((location) => textValue(location, ["client_id"]) === clientId)
          .map((location) => {
            const serviceNames = textValue(location, ["service"])
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);

            return {
              id: textValue(location, ["id"]),
              qrCode: textValue(location, ["qr_code", "code"]) || textValue(location, ["id"]),
              name: textValue(location, ["name", "object_name", "title"]),
              address: textValue(location, ["address", "full_address"]),
              region: textValue(location, ["region", "oblast", "area"]),
              status: textValue(location, ["status"]) || "изряден",
              services: mappedServices.filter((service) => serviceNames.includes(service.name)),
            };
          });

        const clientType: ClientProfile["clientType"] =
          textValue(client, ["client_type", "clientType"]) === "private"
            ? "private"
            : "corporate";
        const companyName = textValue(client, [
          "company_name",
          "companyName",
          "name",
          "organization",
        ]);
        const firstName = textValue(client, ["first_name", "firstName"]);
        const lastName = textValue(client, ["last_name", "lastName"]);

        return {
          id: clientId,
          clientType,
          name:
            clientType === "private"
              ? privateClientName(firstName, lastName) ||
                textValue(client, ["name", "person"])
              : companyName,
          companyName,
          firstName,
          lastName,
          contactPerson: textValue(client, [
            "contact_person",
            "contact",
            "representative",
            "person",
          ]),
          phone: textValue(client, ["phone", "telephone", "mobile"]),
          email: textValue(client, ["email"]),
          address: textValue(client, ["address"]),
          bulstat: textValue(client, ["bulstat", "eik", "vat_number"]),
          locations: clientLocations,
        };
      });

      setClients(mappedClients);
      setSelectedClientId("");
      setLoadState("ready");
    } catch {
      setErrorMessage("Грешка при връзка със Supabase");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    setClientPage(1);
  }, [search, clientTypeFilter]);

  useEffect(() => {
    if (clientPage > totalClientPages) {
      setClientPage(totalClientPages);
    }
  }, [clientPage, totalClientPages]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      openCreateForm();
    }
  }, []);


  async function createClient() {
    const supabase = createSupabaseBrowserClient();
    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .insert(clientPayload(form))
      .select("*")
      .single();

    if (clientError || !clientRow) {
      throw new Error(clientError?.message || "Клиентът не беше записан");
    }
  }

  async function updateClient() {
    if (!editingClient) return;

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("clients")
      .update(clientPayload(form))
      .eq("id", editingClient.id);

    if (error) {
      throw new Error(error.message || "Клиентът не беше обновен");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadState("saving");
    setMessage("");
    setErrorMessage("");

    try {
      const validationError = validateClientForm(form);
      if (validationError) {
        setLoadState("ready");
        setErrorMessage(validationError);
        return;
      }

      if (formMode === "edit") {
        await updateClient();
        setMessage("Клиентът е обновен успешно");
      } else {
        await createClient();
        setMessage("Клиентът е записан успешно");
      }

      setForm(emptyForm);
      setEditingClientId("");
      setFormMode("hidden");
      await loadClients();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Грешка при връзка със Supabase"
      );
      setLoadState("error");
    }
  }

  async function deleteClient(client: ClientProfile) {
    setLoadState("deleting");
    setMessage("");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("clients").delete().eq("id", client.id);

      if (error) {
        throw new Error(error.message || "Клиентът не беше изтрит");
      }

      setDeleteDialog(null);
      setMessage("Клиентът е изтрит успешно");
      setSelectedClientId("");
      await loadClients();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Грешка при връзка със Supabase"
      );
      setLoadState("error");
    }
  }

  function handleDeleteClient(client: ClientProfile) {
    setDeleteDialog({
      title: "Изтриване на клиент",
      itemLabel: `клиента ${client.name}`,
      details: "Това ще изтрие и свързаните му обекти.",
      onConfirm: () => deleteClient(client),
    });
  }

  return (
    <AppShell
      title="Клиенти"
      description="Управление на клиенти и свързаните им обекти"
    >
      <div className="space-y-5">
        <Card className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
            <div className="w-full text-sm font-bold text-slate-500">
              Клиенти <span className="font-black text-slate-900">{clients.length}</span>
              <span className="mx-2 text-slate-300">/</span>
              Обекти <span className="font-black text-slate-900">{totalLocations}</span>
              <span className="mx-2 text-slate-300">/</span>
              Показани <span className="font-black text-slate-900">{filteredClients.length}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center">
              <div className="relative w-full min-w-0 xl:min-w-[360px] xl:flex-1">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <Input
                  placeholder="Търсене по клиент, контакт, телефон, ЕИК или обект..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full pl-11"
                />
              </div>

              <div className="flex w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
                {[
                  { value: "all", label: "Всички" },
                  { value: "corporate", label: "Корпоративни" },
                  { value: "private", label: "Частни" },
                ].map((option) => {
                  const selected = clientTypeFilter === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setClientTypeFilter(
                          option.value as typeof clientTypeFilter
                        )
                      }
                      className={`h-9 rounded-lg px-3 text-xs font-black transition ${
                        selected
                          ? "bg-orange-50 text-orange-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row xl:ml-auto">
              <Button type="button" onClick={openCreateForm}>
                <Plus size={18} />
                Добави клиент
              </Button>
              <Button type="button" variant="outline" onClick={loadClients}>
                <RefreshCw size={17} />
                Обнови
              </Button>
            </div>
          </div>
        </Card>

        {message ? (
          <div className="rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">
            {message}
          </div>
        ) : null}

        {loadState === "error" ? (
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage || "Грешка при зареждане"}
          </div>
        ) : null}

        {formMode !== "hidden" ? (
          <Card className="p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-black">
                  {formMode === "edit" ? "Редакция на клиент" : "Нов клиент"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Основни данни за клиента. Обектите се управляват като отделни
                  записи към клиента.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormMode("hidden");
                  setForm(emptyForm);
                  setEditingClientId("");
                }}
              >
                Затвори
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                {[
                  {
                    value: "corporate",
                    label: "Корпоративен",
                    description: "Фирма с обекти, договори и контактно лице.",
                    icon: Building2,
                  },
                  {
                    value: "private",
                    label: "Частен",
                    description: "Физическо лице, телефон и имот/място по желание.",
                    icon: UserRound,
                  },
                ].map((option) => {
                  const selected = form.clientType === option.value;
                  const Icon = option.icon;

                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-orange-200 bg-white text-orange-700 shadow-sm"
                          : "border-transparent bg-transparent text-slate-600 hover:bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="clientType"
                        value={option.value}
                        checked={selected}
                        onChange={() =>
                          updateForm(
                            "clientType",
                            option.value as ClientFormState["clientType"]
                          )
                        }
                        className="h-4 w-4 accent-orange-600"
                      />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-900">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    {form.clientType === "corporate" ? (
                      <Building2 size={18} />
                    ) : (
                      <UserRound size={18} />
                    )}
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-950">
                      {form.clientType === "corporate" ? "Данни за фирмата" : "Данни за частен клиент"}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      {form.clientType === "corporate"
                        ? "Основни данни, контакт и адрес за документи и портал."
                        : "Име и телефон за напомняния; имот/адрес може да се добави и по-късно."}
                    </p>
                  </div>
                </div>

                {form.clientType === "corporate" ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="xl:col-span-2">
                      <ClientField
                        label="Име на фирма *"
                        value={form.companyName}
                        required
                        onChange={(value) => updateForm("companyName", value)}
                      />
                    </div>
                    <ClientField
                      label="ЕИК / Булстат"
                      value={form.bulstat}
                      onChange={(value) => updateForm("bulstat", value)}
                    />
                    <ClientField
                      label="Контактно лице"
                      value={form.contactPerson}
                      onChange={(value) => updateForm("contactPerson", value)}
                    />
                    <ClientField
                      label="Телефон *"
                      type="tel"
                      value={form.phone}
                      required
                      onChange={(value) => updateForm("phone", value)}
                    />
                    <ClientField
                      label="Имейл"
                      type="email"
                      value={form.email}
                      onChange={(value) => updateForm("email", value)}
                    />
                    <div className="md:col-span-2 xl:col-span-3">
                      <ClientField
                        label="Адрес"
                        value={form.address}
                        placeholder="Въведете град, улица и номер, за да се позиционира правилно на картата"
                        onChange={(value) => updateForm("address", value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ClientField
                      label="Име *"
                      value={form.firstName}
                      required
                      onChange={(value) => updateForm("firstName", value)}
                    />
                    <ClientField
                      label="Фамилия *"
                      value={form.lastName}
                      required
                      onChange={(value) => updateForm("lastName", value)}
                    />
                    <ClientField
                      label="Телефон *"
                      type="tel"
                      value={form.phone}
                      required
                      onChange={(value) => updateForm("phone", value)}
                    />
                    <ClientField
                      label="Имейл"
                      type="email"
                      value={form.email}
                      onChange={(value) => updateForm("email", value)}
                    />
                    <div className="md:col-span-2 xl:col-span-4">
                      <ClientField
                        label="Адрес по желание"
                        value={form.address}
                        placeholder="Въведете град, улица и номер, ако искате да се показва на картата"
                        onChange={(value) => updateForm("address", value)}
                      />
                    </div>
                  </div>
                )}
              </section>

              {errorMessage ? (
                <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    loadState === "saving" ||
                    !clientDisplayName(form) ||
                    !form.phone.trim()
                  }
                >
                  {formMode === "edit" ? (
                    <Edit3 size={18} />
                  ) : (
                    <Plus size={18} />
                  )}
                  {loadState === "saving"
                    ? "Записване..."
                    : formMode === "edit"
                      ? "Запази промени"
                      : "Запази клиент"}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        <div>
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black">Регистър клиенти</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Клиент</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Телефон</th>
                    {showEmailColumn ? <th className="px-4 py-3">Имейл</th> : null}
                    {showCorporateColumns ? (
                      <>
                        <th className="px-4 py-3">Контактно лице</th>
                        <th className="px-4 py-3">ЕИК / Булстат</th>
                      </>
                    ) : null}
                    <th className="px-4 py-3 text-center">Обекти</th>
                    <th className="px-4 py-3 text-center">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadState === "loading" ? (
                    <tr>
                      <td
                        colSpan={clientTableColumnCount}
                        className="px-4 py-8 text-center font-bold text-slate-400"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : null}

                  {loadState !== "loading" && filteredClients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={clientTableColumnCount}
                        className="px-4 py-8 text-center font-bold text-slate-400"
                      >
                        Няма намерени клиенти
                      </td>
                    </tr>
                  ) : null}

                  {pagedClients.map((client) => {
                    const selected = selectedClientId === client.id;

                    return (
                      <tr
                        key={client.id}
                        className={`transition hover:bg-orange-50/40 ${
                          selected ? "bg-orange-50/60" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleClientDetails(client)}
                            className="text-left"
                          >
                            <div className="font-black text-slate-900">
                              {client.name}
                            </div>
                            <div className="mt-1 max-w-[260px] truncate text-xs font-medium text-slate-500">
                              {client.address || "Няма адрес"}
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={clientTypeVariant(client.clientType)}>
                            {clientTypeLabel(client.clientType)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600">
                          <ContactLink kind="phone" value={client.phone} fallback="Няма телефон" />
                        </td>
                        {showEmailColumn ? (
                          <td className="px-4 py-3 font-medium text-slate-600">
                            <ContactLink kind="email" value={client.email} fallback="—" />
                          </td>
                        ) : null}
                        {showCorporateColumns ? (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-600">
                              {client.contactPerson || "Няма контакт"}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">
                              {client.bulstat || "няма"}
                            </td>
                          </>
                        ) : null}
                        <td className="px-4 py-3 text-center">
                          <Badge variant="orange">
                            {client.locations.length}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Преглед"
                              onClick={() => toggleClientDetails(client)}
                            >
                              <Eye size={16} />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Редакция"
                              onClick={() => openEditForm(client)}
                            >
                              <Edit3 size={16} />
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="icon"
                              aria-label="Изтриване"
                              disabled={loadState === "deleting"}
                              onClick={() => handleDeleteClient(client)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {loadState !== "loading" && filteredClients.length > 0 ? (
              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Показани {visibleClientStart}-{visibleClientEnd} от{" "}
                  {filteredClients.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safeClientPage <= 1}
                    onClick={() => setClientPage((page) => Math.max(1, page - 1))}
                  >
                    Предишна
                  </Button>
                  <div className="min-w-20 text-center text-xs font-black uppercase text-slate-400">
                    {safeClientPage} / {totalClientPages}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safeClientPage >= totalClientPages}
                    onClick={() =>
                      setClientPage((page) => Math.min(totalClientPages, page + 1))
                    }
                  >
                    Следваща
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          {selectedClient ? (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-slate-950/25 p-3 backdrop-blur-[2px] sm:p-5"
              onClick={() => setSelectedClientId("")}
            >
              <Card
                className="flex h-full w-full max-w-[460px] flex-col overflow-hidden p-0 shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black text-slate-900">
                        {selectedClient.name}
                      </h2>
                      <Badge variant={clientTypeVariant(selectedClient.clientType)}>
                        {clientTypeLabel(selectedClient.clientType)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      Детайли и обекти на клиента.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Затвори"
                    onClick={() => setSelectedClientId("")}
                  >
                    <X size={16} />
                  </Button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    {selectedClient.clientType === "corporate" ? (
                      <>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                          <UserRound size={16} />
                          {selectedClient.contactPerson || "Няма контактно лице"}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                          <Building2 size={16} />
                          {selectedClient.bulstat || "Няма ЕИК / БУЛСТАТ"}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                        <UserRound size={16} />
                        {selectedClient.name}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Phone size={16} />
                      <ContactLink kind="phone" value={selectedClient.phone} fallback="Няма телефон" />
                    </div>
                    {selectedClient.email ? (
                      <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                        <Mail size={16} />
                        <ContactLink kind="email" value={selectedClient.email} />
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-orange-700">
                      Клиентски портал
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-5 text-orange-900/70">
                      Админ преглед на клиентския портал, документите, обектите и историята.
                    </p>
                    <Button
                      type="button"
                      className="mt-3 w-full"
                      onClick={() => openClientPortal(selectedClient)}
                      disabled={portalOpeningClientId === selectedClient.id}
                    >
                      {portalOpeningClientId === selectedClient.id ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <ExternalLink size={16} />
                      )}
                      Клиентски портал
                    </Button>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-xs font-black uppercase text-slate-400">Обекти</div>
                      <Link
                        href={`/locations/new?clientId=${encodeURIComponent(selectedClient.id)}`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-400 px-3 text-xs font-black text-white shadow-sm transition hover:shadow-md"
                      >
                        <Plus size={15} />
                        Нов обект
                      </Link>
                    </div>

                    <div className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold text-slate-500">
                      Добавянето и редакцията на обекти се правят само от страницата „Обекти“.
                    </div>

                    <div className="space-y-3">
                      {selectedClient.locations.length ? (
                        selectedClient.locations.map((location) => (
                          <div
                            key={location.id}
                            className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                          >
                            <Link
                              href={`/locations/${location.qrCode}`}
                              className="min-w-0 block transition hover:text-orange-700"
                            >
                              <div className="font-black text-slate-800">{location.name}</div>
                              <div className="mt-1 text-sm font-medium text-slate-500">
                                {location.address || "Няма адрес"}
                              </div>
                            </Link>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">
                          Няма добавени обекти
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
      <DeleteConfirmDialog
        dialog={deleteDialog}
        busy={loadState === "deleting"}
        onCancel={() => {
          if (loadState !== "deleting") setDeleteDialog(null);
        }}
      />
    </AppShell>
  );
}










