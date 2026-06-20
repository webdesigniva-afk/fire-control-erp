export function createObjectQrCode() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  return `OBJ-${random.slice(0, 10).toUpperCase()}`;
}
