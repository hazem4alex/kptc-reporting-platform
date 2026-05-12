import crypto from "node:crypto";

const iterations = 210000;
const keyLength = 32;
const digest = "sha256";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [scheme, storedIterations, salt, originalHash] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2" || !storedIterations || !salt || !originalHash) return false;

  const hash = crypto
    .pbkdf2Sync(password, salt, Number(storedIterations), keyLength, digest)
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}

export function createToken() {
  return crypto.randomBytes(32).toString("hex");
}
