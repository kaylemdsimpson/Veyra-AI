import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Encrypt sensitive data (e.g., Shopify access tokens).
 */
export function encrypt(plaintext: string): string {
  const key = Buffer.from(env().ENCRYPTION_KEY, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt sensitive data.
 */
export function decrypt(ciphertext: string): string {
  const key = Buffer.from(env().ENCRYPTION_KEY, "hex");
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Generate HMAC for webhook verification.
 */
export function hmacVerify(body: string, signature: string, secret: string): boolean {
  const computed = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return computed === signature;
}
