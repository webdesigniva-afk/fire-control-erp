"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  Edit3,
  Eye,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
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
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bulstat: string;
  locations: ClientLocation[];
};

type ClientFormState = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bulstat: string;
};

const emptyForm: ClientFormState = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  bulstat: "",
};

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
    name: client.name,
    contactPerson: client.contactPerson,
    phone: client.phone,
    email: client.email,
    address: client.address,
    bulstat: client.bulstat,
  };
}

function ClientField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
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
        onChange={(event) => onChange(event.target.value)}
        className="w-full"
      />
    </div>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [formMode, setFormMode] = useState<"hidden" | "create" | "edit">("hidden");
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "error" | "saving" | "deleting"
  >("loading");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter((client) =>
      [
        client.name,
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
  }, [clients, search]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ??
    filteredClients[0] ??
    null;

  const totalLocations = clients.reduce(
    (total, client) => total + client.locations.length,
    0
  );

  function updateForm(key: keyof ClientFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreateForm() {
    setForm(emptyForm);
    setFormMode("create");
    setMessage("");
    setErrorMessage("");
  }

  function openEditForm(client: ClientProfile) {
    setSelectedClientId(client.id);
    setForm(formFromClient(client));
    setFormMode("edit");
    setMessage("");
    setErrorMessage("");
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

        return {
          id: clientId,
          name: textValue(client, ["name", "organization", "company_name"]),
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
      setSelectedClientId((current) => {
        if (mappedClients.some((client) => client.id === current)) return current;
        return mappedClients[0]?.id ?? "";
      });
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      openCreateForm();
    }
  }, []);


  async function createClient() {
    const supabase = createSupabaseBrowserClient();
    const { data: clientRow, error: clientError } = await supabase
      .from("clients")
      .insert({
        name: form.name,
        contact_person: form.contactPerson,
        phone: form.phone,
        email: form.email,
        address: form.address,
        bulstat: form.bulstat,
      })
      .select("*")
      .single();

    if (clientError || !clientRow) {
      throw new Error(clientError?.message || "Клиентът не беше записан");
    }
  }

  async function updateClient() {
    if (!selectedClient) return;

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("clients")
      .update({
        name: form.name,
        contact_person: form.contactPerson,
        phone: form.phone,
        email: form.email,
        address: form.address,
        bulstat: form.bulstat,
      })
      .eq("id", selectedClient.id);

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
      if (formMode === "edit") {
        await updateClient();
        setMessage("Клиентът е обновен успешно");
      } else {
        await createClient();
        setMessage("Клиентът е записан успешно");
      }

      setForm(emptyForm);
      setFormMode("hidden");
      await loadClients();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Грешка при връзка със Supabase"
      );
      setLoadState("error");
    }
  }

  async function handleDeleteClient(client: ClientProfile) {
    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да изтриете клиента "${client.name}"? Това ще изтрие и свързаните му обекти.`
    );

    if (!confirmed) return;

    setLoadState("deleting");
    setMessage("");
    setErrorMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("clients").delete().eq("id", client.id);

      if (error) {
        throw new Error(error.message || "Клиентът не беше изтрит");
      }

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

  return (
    <AppShell
      title="Клиенти"
      description="Управление на клиенти и свързаните им обекти"
      headerAction={
        <Button type="button" onClick={openCreateForm}>
          <Plus size={18} />
          Добави клиент
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatPill label="Клиенти" value={clients.length} />
          <StatPill label="Обекти" value={totalLocations} />
          <StatPill label="Показани" value={filteredClients.length} />
        </div>

        <Card className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xl">
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

            <div className="flex flex-col gap-2 sm:flex-row">
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
                }}
              >
                Затвори
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ClientField
                  label="Клиент / организация"
                  value={form.name}
                  required
                  onChange={(value) => updateForm("name", value)}
                />
                <ClientField
                  label="ЕИК / БУЛСТАТ"
                  value={form.bulstat}
                  onChange={(value) => updateForm("bulstat", value)}
                />
                <ClientField
                  label="Контактно лице"
                  value={form.contactPerson}
                  onChange={(value) => updateForm("contactPerson", value)}
                />
                <ClientField
                  label="Телефон"
                  value={form.phone}
                  onChange={(value) => updateForm("phone", value)}
                />
                <ClientField
                  label="Имейл"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateForm("email", value)}
                />
                <ClientField
                  label="Адрес на клиента"
                  value={form.address}
                  onChange={(value) => updateForm("address", value)}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={loadState === "saving" || !form.name.trim()}
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

        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_420px]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black">Регистър клиенти</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Клиент</th>
                    <th className="px-4 py-3">Контакт</th>
                    <th className="px-4 py-3">Телефон</th>
                    <th className="px-4 py-3">ЕИК</th>
                    <th className="px-4 py-3 text-center">Обекти</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadState === "loading" ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center font-bold text-slate-400"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : null}

                  {loadState !== "loading" && filteredClients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center font-bold text-slate-400"
                      >
                        Няма намерени клиенти
                      </td>
                    </tr>
                  ) : null}

                  {filteredClients.map((client) => {
                    const selected = selectedClient?.id === client.id;

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
                            onClick={() => setSelectedClientId(client.id)}
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
                        <td className="px-4 py-3 font-medium text-slate-600">
                          {client.contactPerson || "Няма контакт"}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600">
                          {client.phone || "Няма телефон"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">
                          {client.bulstat || "няма"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="orange">
                            {client.locations.length}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Преглед"
                              onClick={() => setSelectedClientId(client.id)}
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
          </Card>

                    <Card className="p-5">
            {selectedClient ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{selectedClient.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">Детайли и обекти на клиента.</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <UserRound size={16} />
                      {selectedClient.contactPerson || "Няма контактно лице"}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Phone size={16} />
                      {selectedClient.phone || "Няма телефон"}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Building2 size={16} />
                      {selectedClient.bulstat || "Няма ЕИК / БУЛСТАТ"}
                    </div>
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
                            <div className="mt-3 flex flex-wrap gap-2">
                              {location.services.length ? (
                                location.services.map((service) => (
                                  <Badge key={service.id} variant="neutral">
                                    <Wrench size={12} />
                                    {service.name}
                                  </Badge>
                                ))
                              ) : (
                                <Badge variant="warning">Без сервиз</Badge>
                              )}
                            </div>
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
              </>
            ) : (
              <div className="p-8 text-center text-sm font-bold text-slate-400">
                Изберете клиент от регистъра
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}










