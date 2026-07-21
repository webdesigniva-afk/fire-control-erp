export function createEquipmentQrCode() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  return `FC-EQ-${random.slice(0, 16).toUpperCase()}`;
}

export function isEquipmentQrCode(value: string) {
  return /^FC-EQ-[A-Z0-9]{6,}$/i.test(value.trim());
}

export function equipmentQrPath(code: string) {
  return `/equipment/${encodeURIComponent(code.trim())}`;
}
