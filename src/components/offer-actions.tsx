"use client";

import { FileText, Mail } from "lucide-react";
import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { Button } from "./ui/button";

type OfferActionsProps = {
  address: string;
  client: string;
  number: string;
  object: string;
  total: string;
};

const documentsStorageKey = "firecontrol:documents";

type StoredDocument = {
  id: string;
  kind: "offer";
  number: string;
  title: string;
  client: string;
  object: string;
  href: string;
  total: string;
  savedAt: number;
};

function readDocuments() {
  try {
    const raw = localStorage.getItem(documentsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredDocument[]) : [];
  } catch {
    return [];
  }
}

export function OfferActions({
  address,
  client,
  number,
  object,
  total,
}: OfferActionsProps) {
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  async function saveToDocuments() {
    try {
      const documentRecord: StoredDocument = {
        id: `offer-${number}`,
        kind: "offer",
        number,
        title: `Оферта ${number}`,
        client,
        object,
        href: window.location.pathname,
        total,
        savedAt: Date.now(),
      };
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("saved_documents").upsert(
        {
          id: documentRecord.id,
          kind: documentRecord.kind,
          number: documentRecord.number,
          title: documentRecord.title,
          client: documentRecord.client,
          object: documentRecord.object,
          href: documentRecord.href,
          total: documentRecord.total,
          payload: documentRecord,
          saved_at_ms: documentRecord.savedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) throw new Error(error.message);

      const nextDocuments = [
        documentRecord,
        ...readDocuments().filter((item) => item.id !== documentRecord.id),
      ];
      localStorage.setItem(documentsStorageKey, JSON.stringify(nextDocuments));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function sendByEmail() {
    const subject = `Оферта ${number} - ${client}`;
    const body = [
      `Здравейте,`,
      ``,
      `Изпращаме оферта ${number} за обект ${object}.`,
      `Адрес: ${address}`,
      `Обща стойност: ${total}`,
      ``,
      `Линк към офертата: ${window.location.href}`,
    ].join("\n");

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="button" variant="outline" onClick={saveToDocuments}>
        <FileText size={18} />
        {saveState === "saved" ? "Запазено" : "Запази в документи"}
      </Button>
      <Button type="button" variant="outline" onClick={sendByEmail}>
        <Mail size={18} />
        Изпрати по имейл
      </Button>
      {saveState === "error" ? (
        <span className="self-center text-xs font-bold text-red-600">
          Неуспешно запазване
        </span>
      ) : null}
    </div>
  );
}
