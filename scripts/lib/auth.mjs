/**
 * Admin authentication for the one person who runs the shop's menu.
 *
 * Deliberately small and dependency-free:
 *
 *   - The password is never stored, only a scrypt hash with a per-install salt.
 *   - A successful login returns a signed, expiring token. The browser keeps it
 *     and sends it as `Authorization: Bearer …`. There is NO cookie, so there is
 *     no ambient credential to ride — cross-site request forgery is structurally
 *     impossible here, and the panel still works when embedded in an iframe
 *     (browsers block third-party cookies, which would silently break a
 *     cookie-based session).
 *   - No password configured means no admin: the API answers 503 rather than
 *     falling back to a default password. Fail closed.
 *   - Verification is constant-time; login attempts are rate limited in server.mjs.
 */
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = process.env.ADMIN_DATA_DIR || join(ROOT, "data");
export const CREDENTIALS = join(DATA_DIR, "admin.json");

/** scrypt cost: ~50–100 ms per hash on a small VPS. Raise if the host is fast. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // a working day

function scrypt(password, salt, keylen = SCRYPT.keylen) {
  return scryptSync(password, salt, keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 });
}

export function hasPassword() {
  return existsSync(CREDENTIALS);
}

export function loadCredentials() {
  if (!existsSync(CREDENTIALS)) return null;
  try {
    const raw = JSON.parse(readFileSync(CREDENTIALS, "utf8"));
    if (!raw.salt || !raw.hash || !raw.secret) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Called by scripts/admin-passwd.mjs. Refuses short passwords outright. */
export function setPassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw new Error("Use a password of at least 10 characters.");
  }
  const salt = randomBytes(16);
  const hash = scrypt(password, salt);
  const record = {
    version: 1,
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    // separate key, so a stolen credentials file cannot also forge sessions
    // unless the attacker has both halves — which they do here, so the real
    // protection is the file permissions and never committing it.
    secret: randomBytes(32).toString("base64"),
    params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen },
    createdAt: new Date().toISOString(),
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CREDENTIALS, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(CREDENTIALS, 0o600);
  } catch {
    /* some filesystems (mounted volumes) refuse chmod — the app still works */
  }
  return record;
}

export function verifyPassword(password) {
  const creds = loadCredentials();
  if (!creds) return false;
  if (typeof password !== "string" || password.length === 0 || password.length > 512) return false;
  const expected = Buffer.from(creds.hash, "base64");
  const actual = scrypt(password, Buffer.from(creds.salt, "base64"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ------------------------------------------------------------------ tokens */
const revoked = new Set(); // jti of logged-out tokens (in-memory; process lifetime)

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sign = (secret, data) => createHmac("sha256", Buffer.from(secret, "base64")).update(data).digest();

export function issueToken() {
  const creds = loadCredentials();
  if (!creds) throw new Error("no credentials");
  const payload = b64url(JSON.stringify({ jti: randomBytes(12).toString("hex"), exp: Date.now() + TOKEN_TTL_MS }));
  const mac = b64url(sign(creds.secret, `v1.${payload}`));
  return { token: `v1.${payload}.${mac}`, expiresAt: Date.now() + TOKEN_TTL_MS };
}

export function verifyToken(token) {
  const creds = loadCredentials();
  if (!creds || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, mac] = parts;

  const expected = sign(creds.secret, `v1.${payload}`);
  let given;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims?.exp || Date.now() > claims.exp) return null;
  if (revoked.has(claims.jti)) return null;
  return claims;
}

export function revokeToken(token) {
  const claims = verifyToken(token);
  if (claims) revoked.add(claims.jti);
}

/** Bearer token from the request headers, or null. */
export function tokenFromRequest(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}
