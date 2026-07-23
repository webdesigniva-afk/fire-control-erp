"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type BackButtonProps = {
  fallbackHref: string;
  className: string;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
};

export function BackButton({
  fallbackHref,
  className,
  children,
  title,
  ariaLabel,
}: BackButtonProps) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={className}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
