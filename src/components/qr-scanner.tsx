"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { QrCode, X } from "lucide-react";
import { Button } from "./ui/button";

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorInstance;

type QrScannerButtonProps = {
  children: ReactNode;
  className?: string;
  buttonClassName?: string;
};

function getBarcodeDetector() {
  const detector = (window as unknown as {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }).BarcodeDetector;

  return detector ?? null;
}

function passportUrlFromScan(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/qr\/([^/?#]+)/);
    if (match?.[1]) {
      return `/qr/${encodeURIComponent(decodeURIComponent(match[1]))}?mode=erp`;
    }
  } catch {
    // Not a full URL. Continue with path/code parsing.
  }

  const pathMatch = trimmed.match(/\/qr\/([^/?#]+)/);
  if (pathMatch?.[1]) {
    return `/qr/${encodeURIComponent(decodeURIComponent(pathMatch[1]))}?mode=erp`;
  }

  return `/qr/${encodeURIComponent(trimmed)}?mode=erp`;
}

function QrScannerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [manualCode, setManualCode] = useState("");

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const openPassport = useCallback((rawValue: string) => {
    const url = passportUrlFromScan(rawValue);
    if (!url) return;

    stopCamera();
    window.location.assign(url);
  }, [stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let cancelled = false;

    async function startScanner() {
      setStatus("starting");
      setMessage("");

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Браузърът не позволява достъп до камера.");
        return;
      }

      const BarcodeDetector = getBarcodeDetector();
      if (!BarcodeDetector) {
        setStatus("error");
        setMessage(
          "Този браузър няма вграден QR scanner. Поставете QR кода ръчно долу."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        setStatus("scanning");

        async function scanFrame() {
          if (cancelled || !videoRef.current) return;

          try {
            const results = await detector.detect(videoRef.current);
            const rawValue = results.find((result) => result.rawValue)?.rawValue;
            if (rawValue) {
              openPassport(rawValue);
              return;
            }
          } catch {
            // Keep scanning. Some frames can fail while the camera is warming up.
          }

          animationRef.current = window.requestAnimationFrame(scanFrame);
        }

        scanFrame();
      } catch {
        setStatus("error");
        setMessage("Камерата не беше разрешена или не може да бъде стартирана.");
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, openPassport, stopCamera]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Сканирай QR</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Сканираният обект се отваря като вътрешен ERP паспорт.
            </p>
          </div>
          <button
            type="button"
            aria-label="Затвори"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.28)]" />
            {status !== "scanning" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/75 p-6 text-center text-white">
                <QrCode size={32} />
                <div className="text-sm font-bold">
                  {status === "starting" ? "Стартиране на камера..." : message}
                </div>
              </div>
            ) : null}
          </div>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              openPassport(manualCode);
            }}
          >
            <input
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="OBJ-523864 или /qr/OBJ-523864"
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 focus:border-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
            <Button type="submit" disabled={!manualCode.trim()}>
              Отвори
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function QrScannerButton({
  children,
  className,
  buttonClassName,
}: QrScannerButtonProps) {
  const [open, setOpen] = useState(false);
  const defaultClassName =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:shadow-md";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? `${defaultClassName} ${className ?? ""}`}
      >
        {children}
      </button>
      <QrScannerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
