import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const keyLength = 64;

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, keyLength).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
