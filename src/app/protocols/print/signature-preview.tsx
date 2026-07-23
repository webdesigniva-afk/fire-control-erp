"use client";

import { useEffect, useState } from "react";

type SignatureRole = "technician" | "client";

type PrintSignatureLineProps = {
  previewId: string;
  role: SignatureRole;
  fallbackName: string;
  className?: string;
  imageClassName?: string;
  showFallbackName?: boolean;
  showNameWithSignature?: boolean;
  namePlacement?: "inline" | "below";
};

type PreviewSignaturePayload = {
  technicianSignatureDataUrl?: string;
  clientSignatureDataUrl?: string;
  photos?: ProtocolPreviewPhoto[];
};

type ProtocolPreviewPhoto = {
  id: string;
  name: string;
  dataUrl: string;
  fileUrl?: string;
  description?: string;
};

export function PrintSignatureLine({
  previewId,
  role,
  fallbackName,
  className = "inline-flex min-h-10 min-w-44 items-end border-b border-black align-bottom",
  imageClassName = "max-h-10 max-w-44 object-contain",
  showFallbackName = true,
  showNameWithSignature = false,
  namePlacement = "inline",
}: PrintSignatureLineProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState("");

  useEffect(() => {
    if (!previewId) return;

    const previewKey = `firecontrol:protocol-preview:${previewId}`;

    try {
      // The print preview opens in a new tab via target="_blank", which does
      // not share sessionStorage with the form tab. Try localStorage first
      // (cross-tab), then fall back to sessionStorage for same-tab usage.
      let storedPayload: string | null = null;
      try {
        storedPayload = localStorage.getItem(previewKey);
      } catch {
        storedPayload = null;
      }
      if (!storedPayload) {
        storedPayload = sessionStorage.getItem(previewKey);
      }

      if (!storedPayload) return;

      const payload = JSON.parse(storedPayload) as PreviewSignaturePayload;
      setSignatureDataUrl(
        role === "technician"
          ? payload.technicianSignatureDataUrl ?? ""
          : payload.clientSignatureDataUrl ?? ""
      );
    } catch {
      setSignatureDataUrl("");
    }
  }, [previewId, role]);

  return (
    <span className={namePlacement === "below" ? "inline-flex flex-col items-start align-bottom" : className}>
      <span className={namePlacement === "below" ? className : ""}>
        {signatureDataUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureDataUrl}
            alt={`Подпис - ${fallbackName}`}
            className={imageClassName}
          />
          {showNameWithSignature && fallbackName && namePlacement === "inline" ? (
            <span className="px-1 font-bold">{fallbackName}</span>
          ) : null}
        </>
        ) : showFallbackName && namePlacement === "inline" ? (
          <span className="px-1 font-bold">{fallbackName}</span>
        ) : (
          <span />
        )}
      </span>
      {fallbackName && namePlacement === "below" ? (
        <span className="mt-1 text-[9px] font-bold leading-none">{fallbackName}</span>
      ) : null}
    </span>
  );
}

type PrintPhotoAttachmentsProps = {
  previewId: string;
  protocolNumber: string;
  protocolDate: string;
  objectName: string;
  clientName: string;
  serviceName: string;
  technician: string;
};

export function PrintPhotoAttachments({
  previewId,
  protocolNumber,
  protocolDate,
  objectName,
  clientName,
  serviceName,
  technician,
}: PrintPhotoAttachmentsProps) {
  const [photos, setPhotos] = useState<ProtocolPreviewPhoto[]>([]);

  useEffect(() => {
    if (!previewId) return;

    const previewKey = `firecontrol:protocol-preview:${previewId}`;

    try {
      let storedPayload: string | null = null;
      try {
        storedPayload = localStorage.getItem(previewKey);
      } catch {
        storedPayload = null;
      }
      if (!storedPayload) {
        storedPayload = sessionStorage.getItem(previewKey);
      }

      if (!storedPayload) return;

      const payload = JSON.parse(storedPayload) as PreviewSignaturePayload;
      setPhotos(
        Array.isArray(payload.photos)
          ? payload.photos.filter(
              (photo) =>
                typeof photo?.dataUrl === "string" &&
                (photo.dataUrl.startsWith("data:image/") ||
                  photo.dataUrl.startsWith("http"))
            )
          : []
      );
    } catch {
      setPhotos([]);
    }
  }, [previewId]);

  if (!photos.length) return null;

  return (
    <section className="photo-attachments mx-auto mt-5 w-[210mm] max-w-full bg-white px-[12mm] py-[12mm] text-black shadow-sm print:m-0 print:mt-0 print:w-auto print:max-w-none print:p-0 print:shadow-none">
      <header className="attachment-header border-b border-black pb-3 text-[11px] leading-tight">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-[16px] font-bold leading-tight">
              Приложение: Снимки към протокола
            </h2>
            <div className="mt-1">
              Протокол № <span className="font-bold">{protocolNumber}</span> /{" "}
              {protocolDate}
            </div>
          </div>
          <div className="text-right">
            <div>
              Сервиз: <span className="font-bold">{serviceName}</span>
            </div>
            <div>
              Техник: <span className="font-bold">{technician}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            Обект: <span className="font-bold">{objectName}</span>
          </div>
          <div>
            Клиент: <span className="font-bold">{clientName}</span>
          </div>
        </div>
      </header>

      <div className="attachment-grid mt-4 grid grid-cols-2 gap-4">
        {photos.map((photo, index) => (
          <figure
            key={photo.id || `${photo.name}-${index}`}
            className="photo-item break-inside-avoid border border-black p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.dataUrl}
              alt={photo.name || `Снимка ${index + 1}`}
              className="h-[92mm] w-full object-contain"
            />
            <figcaption className="mt-1 truncate text-[10px] leading-tight">
              {index + 1}. {photo.description || photo.name || "Снимка"}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
