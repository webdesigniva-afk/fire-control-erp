import type { ReactNode } from "react";

type ContactLinkKind = "phone" | "email";

type ContactLinkProps = {
  kind: ContactLinkKind;
  value: string;
  fallback?: ReactNode;
  className?: string;
  children?: ReactNode;
};

function phoneHref(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  const leadingPlus = normalized.startsWith("+") ? "+" : "";
  const digits = normalized.replace(/\D/g, "");
  return digits ? `tel:${leadingPlus}${digits}` : "";
}

function emailHref(value: string) {
  const normalized = value.trim();
  return normalized ? `mailto:${normalized}` : "";
}

export function contactHref(kind: ContactLinkKind, value: string) {
  return kind === "phone" ? phoneHref(value) : emailHref(value);
}

export function ContactLink({
  kind,
  value,
  fallback = null,
  className = "",
  children,
}: ContactLinkProps) {
  const trimmed = value.trim();
  const href = contactHref(kind, trimmed);

  if (!href) return <>{fallback}</>;

  return (
    <a
      href={href}
      className={`min-w-0 truncate underline-offset-4 transition hover:text-orange-600 hover:underline ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      {children ?? trimmed}
    </a>
  );
}
