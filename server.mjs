#!/usr/bin/env node
/**
 * Tiny zero-dependency static server + contact endpoint for the Kungfu Noodles site.
 *
 *   node server.mjs            # http://localhost:3000
 *   PORT=8080 node server.mjs
 *
 * Why a server at all? The site is plain static files, but the contact form needs
 * somewhere to POST to. Everything else here (compression, caching, ETags) is what
 * you'd get for free from nginx or a CDN — bundled here so the preview is honest.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { verifyPassword, issueToken, revokeToken, verifyToken, tokenFromRequest, hasPassword, DATA_DIR } from "./scripts/lib/auth.mjs";
import { validateMenu, slugify, nextFreeNumber } from "./scripts/lib/menu-validate.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const INBOX = join(ROOT, "data", "inquiries.jsonl");
const MENU_FILE = process.env.MENU_JSON || join(ROOT, "assets/data/menu.json");
const RAW_DIR = join(ROOT, "assets/img/raw");
const execFileAsync = promisify(execFile);
const SKIP_BUILD = process.env.ADMIN_SKIP_BUILD === "1"; // test hook only

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
};

const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|xml)|image\/svg)/;
const compressCache = new Map(); // path -> { brotli, gzip, etag }

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
};

/* ------------------------------------------------------------------ utils */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = join(ROOT, clean);
  if (!full.startsWith(ROOT + sep) && full !== ROOT) return null;
  return full;
}

function resolveFile(urlPath) {
  let full = safePath(urlPath);
  if (!full) return null;
  if (existsSync(full) && statSync(full).isDirectory()) full = join(full, "index.html");
  if (!existsSync(full) && !extname(full) && existsSync(`${full}.html`)) full = `${full}.html`;
  if (!existsSync(full) || statSync(full).isDirectory()) return null;
  return full;
}

function headersFor(full, size) {
  const ext = extname(full).toLowerCase();
  const immutable = full.includes(`${sep}assets${sep}`);
  return {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": size,
    "Cache-Control": immutable ? "public, max-age=604800, stale-while-revalidate=86400" : "no-cache",
    ...SECURITY_HEADERS,
  };
}

function compress(full, body) {
  const cached = compressCache.get(full);
  if (cached && cached.size === body.length) return cached;
  const entry = {
    size: body.length,
    brotli: brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: body.length },
    }),
    gzip: gzipSync(body, { level: 6 }),
  };
  compressCache.set(full, entry);
  return entry;
}

function send(req, res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  if (req.method === "HEAD") return res.end();
  res.end(body);
}

function notFound(req, res) {
  const page = join(ROOT, "404.html");
  if (existsSync(page)) {
    const html = readFileSync(page);
    return send(req, res, 404, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  }
  send(req, res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
}


/* --------------------------------------------------------------- api ---- */
const rateBuckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const bucket = (rateBuckets.get(ip) || []).filter((t) => now - t < window);
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return bucket.length > 5;
}

function readJson(req, limit = 20_000) {
  return new Promise((resolvePromise, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error("payload-too-large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("invalid-json"));
      }
    });
    req.on("error", reject);
  });
}

async function handleContact(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    return send(req, res, 429, JSON.stringify({ ok: false, error: "Too many messages. Try again later." }), {
      "Content-Type": "application/json",
    });
  }

  let data;
  try {
    data = await readJson(req);
  } catch (error) {
    const status = error.message === "payload-too-large" ? 413 : 400;
    return send(req, res, status, JSON.stringify({ ok: false, error: "Could not read that message." }), {
      "Content-Type": "application/json",
    });
  }

  const trim = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
  const record = {
    at: new Date().toISOString(),
    name: trim(data.name, 120),
    email: trim(data.email, 160),
    phone: trim(data.phone, 40),
    topic: trim(data.topic, 80),
    message: trim(data.message, 4000),
    page: trim(data.page, 120),
    ip,
  };

  if (record.name.length < 2 || record.message.length < 10 || (!record.email && !record.phone)) {
    return send(req, res, 422, JSON.stringify({ ok: false, error: "Please check the required fields." }), {
      "Content-Type": "application/json",
    });
  }

  try {
    mkdirSync(join(ROOT, "data"), { recursive: true });
    appendFileSync(INBOX, `${JSON.stringify(record)}\n`);
  } catch (error) {
    console.error("[contact] could not persist inquiry:", error.message);
    return send(req, res, 500, JSON.stringify({ ok: false, error: "Could not save that message." }), {
      "Content-Type": "application/json",
    });
  }

  console.log(`[contact] ${record.topic} from ${record.name} <${record.email || record.phone}>`);
  send(req, res, 201, JSON.stringify({ ok: true }), { "Content-Type": "application/json" });
}

/* ------------------------------------------------------------- admin ---- */
/**
 * A single-operator CRUD API for the menu, guarded by a scrypt-hashed password
 * and short-lived bearer tokens (see scripts/lib/auth.mjs).
 *
 *   POST   /api/admin/login          { password }            → { token, expiresAt }
 *   POST   /api/admin/logout         (Bearer)                → { ok }
 *   GET    /api/admin/menu           (Bearer)                → { menu, categories, boardPrices }
 *   PUT    /api/admin/menu           (Bearer) { menu }       → validated, written, rebuilt
 *   POST   /api/admin/photo?id=…     (Bearer) raw image body → re-encoded, sized, added
 *   DELETE /api/admin/photo?id=…     (Bearer)                → removed
 *
 * Nothing here trusts the client: the menu document is re-validated with the
 * same rules as `npm run check`, ids come from the server, uploaded images are
 * checked by magic bytes and re-encoded through ImageMagick (which strips EXIF
 * and any embedded payload), and every path is built from a slug.
 */

const loginBuckets = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX = 8;

function loginRateLimited(ip) {
  const now = Date.now();
  const bucket = (loginBuckets.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  bucket.push(now);
  loginBuckets.set(ip, bucket);
  return bucket.length > LOGIN_MAX;
}

const json = (req, res, status, body) =>
  send(req, res, status, JSON.stringify(body), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

function requireAuth(req, res) {
  if (!hasPassword()) {
    json(req, res, 503, {
      ok: false,
      error: "No admin password is set on this server. Run `npm run admin:passwd` first.",
    });
    return null;
  }
  const token = tokenFromRequest(req);
  const claims = token ? verifyToken(token) : null;
  if (!claims) {
    json(req, res, 401, { ok: false, error: "Sign in first." });
    return null;
  }
  return claims;
}

/** Mutations are only accepted from this origin. Belt and braces: the API has
 *  no cookies, so a cross-site page has no credential to send anyway. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetch may omit it; curl/tests too
  try {
    const host = req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readMenuDoc() {
  return JSON.parse(readFileSync(MENU_FILE, "utf8"));
}

/* Saves are serialised and atomic: build the new file, validate, rename, then
   regenerate the page. Two quick clicks can never interleave and lose a row. */
let saveQueue = Promise.resolve();

function saveMenu(mutator) {
  const run = async () => {
    const doc = readMenuDoc();
    const next = mutator(doc) ?? doc;
    const { problems } = validateMenu(next);
    if (problems.length) return { ok: false, status: 422, problems };

    const tmp = `${MENU_FILE}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(tmp, MENU_FILE);

    if (!SKIP_BUILD) {
      try {
        await execFileAsync(process.execPath, [join(ROOT, "scripts/build-menu.mjs")]);
      } catch (error) {
        console.error("[admin] rebuild failed:", error.message);
        return { ok: false, status: 500, problems: ["Saved, but the page rebuild failed. Run `npm run menu`."] };
      }
    }
    return { ok: true, menu: readMenuDoc() };
  };
  const result = saveQueue.then(run, run);
  saveQueue = result.then(() => {}, () => {});
  return result;
}

const MAX_UPLOAD = 12 * 1024 * 1024;

function readBody(req, limit) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        // stop reading but leave the socket alive so the handler can answer 413
        req.pause();
        chunks.length = 0;
        reject(Object.assign(new Error("too-large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Content-type lies; the first bytes do not. */
function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

const PHOTO_WIDTHS = [620, 420, 300];

async function handleAdmin(req, res, url) {
  const path = url.split("?")[0];
  const query = new URLSearchParams(url.split("?")[1] || "");

  /* ---- login (the only unauthenticated endpoint) */
  if (path === "/api/admin/login") {
    if (req.method !== "POST") return json(req, res, 405, { ok: false, error: "POST only" });
    if (!hasPassword()) {
      return json(req, res, 503, {
        ok: false,
        error: "No admin password is set on this server yet. Run `npm run admin:passwd` on the host, then reload this page.",
      });
    }
    const ip = req.socket.remoteAddress || "unknown";
    if (loginRateLimited(ip)) {
      return json(req, res, 429, { ok: false, error: "Too many attempts. Wait ten minutes and try again." });
    }
    let body;
    try {
      body = await readJson(req, 4000);
    } catch {
      return json(req, res, 400, { ok: false, error: "Could not read that." });
    }
    if (!verifyPassword(body.password)) {
      return json(req, res, 401, { ok: false, error: "That password is not right." });
    }
    const { token, expiresAt } = issueToken();
    console.log(`[admin] sign-in from ${ip}`);
    return json(req, res, 200, { ok: true, token, expiresAt });
  }

  const claims = requireAuth(req, res);
  if (!claims) return;

  /* ---- sign out (drops this token server-side as well as in the browser) */
  if (path === "/api/admin/logout" && req.method === "POST") {
    const token = tokenFromRequest(req);
    if (token) revokeToken(token);
    return json(req, res, 200, { ok: true });
  }

  if (req.method !== "GET" && !sameOrigin(req)) {
    return json(req, res, 403, { ok: false, error: "Cross-origin request refused." });
  }

  /* ---- read the whole document */
  if (path === "/api/admin/menu" && req.method === "GET") {
    const doc = readMenuDoc();
    return json(req, res, 200, { ok: true, menu: doc });
  }

  /* ---- replace the whole document (add / edit / delete / reorder all use this) */
  if (path === "/api/admin/menu" && req.method === "PUT") {
    let body;
    try {
      body = await readJson(req, 2_000_000);
    } catch {
      return json(req, res, 400, { ok: false, error: "Could not read that menu." });
    }
    if (!body?.menu) return json(req, res, 400, { ok: false, error: "Missing `menu`." });
    const result = await saveMenu(() => body.menu);
    if (!result.ok) return json(req, res, result.status, { ok: false, problems: result.problems });
    return json(req, res, 200, { ok: true, menu: result.menu });
  }

  /* ---- dish photograph */
  if (path === "/api/admin/photo") {
    const id = query.get("id") || "";
    const doc = readMenuDoc();
    const item = doc.categories.flatMap((c) => c.items).find((i) => i.id === id);
    if (!item) return json(req, res, 404, { ok: false, error: "No such dish." });

    if (req.method === "POST") {
      if (!sameOrigin(req)) return json(req, res, 403, { ok: false, error: "Cross-origin request refused." });
      let raw;
      try {
        raw = await readBody(req, MAX_UPLOAD);
      } catch (error) {
        const tooBig = error.status === 413;
        json(req, res, error.status || 400, {
          ok: false,
          error: tooBig ? "That image is larger than 12 MB." : "Could not read the upload.",
        });
        // the client is still sending; drop the rest of the body
        if (tooBig) req.destroy();
        return;
      }
      if (!sniffImage(raw)) {
        return json(req, res, 415, { ok: false, error: "That is not a JPEG, PNG or WebP image." });
      }

      mkdirSync(RAW_DIR, { recursive: true });
      const incoming = join(RAW_DIR, `.upload-${id}-${Date.now()}`);
      const target = join(RAW_DIR, `dish-${id}.jpg`);
      writeFileSync(incoming, raw);
      try {
        // Re-encode: normalises the file, drops EXIF/GPS and anything appended
        // to the image, and caps the long edge.
        await execFileAsync("convert", [
          incoming,
          "-auto-orient",
          "-resize", "1600x1600>",
          "-strip",
          "-colorspace", "sRGB",
          "-quality", "88",
          target,
        ]);
      } catch (error) {
        console.error("[admin] image conversion failed:", error.message);
        rmSync(incoming, { force: true });
        return json(req, res, 500, { ok: false, error: "Could not process that image (is ImageMagick installed?)." });
      }
      rmSync(incoming, { force: true });

      const result = await saveMenu(() => {
        const fresh = readMenuDoc();
        const dish = fresh.categories.flatMap((c) => c.items).find((i) => i.id === id);
        dish.photo = true;
        return fresh;
      });
      if (!result.ok) return json(req, res, result.status, { ok: false, problems: result.problems });

      if (!SKIP_BUILD) {
        try {
          await execFileAsync(process.execPath, [join(ROOT, "scripts/build-assets.mjs"), "--only", `dish-${id}`]);
          await execFileAsync(process.execPath, [join(ROOT, "scripts/build-menu.mjs")]);
        } catch (error) {
          console.error("[admin] photo resize failed:", error.message);
          return json(req, res, 500, { ok: false, error: "Saved the image but could not resize it. Run `npm run build`." });
        }
      }
      return json(req, res, 200, { ok: true, menu: readMenuDoc() });
    }

    if (req.method === "DELETE") {
      for (const ext of ["jpg", "jpeg", "png", "webp"]) rmSync(join(RAW_DIR, `dish-${id}.${ext}`), { force: true });
      for (const w of PHOTO_WIDTHS) {
        for (const ext of ["webp", "jpg"]) rmSync(join(ROOT, "assets/img", `dish-${id}-${w}.${ext}`), { force: true });
      }
      const result = await saveMenu(() => {
        const fresh = readMenuDoc();
        const dish = fresh.categories.flatMap((c) => c.items).find((i) => i.id === id);
        delete dish.photo;
        delete dish.photoAlt;
        return fresh;
      });
      if (!result.ok) return json(req, res, result.status, { ok: false, problems: result.problems });
      return json(req, res, 200, { ok: true, menu: readMenuDoc() });
    }

    return json(req, res, 405, { ok: false, error: "POST or DELETE only" });
  }

  /* ---- helpers for the form: next free number in a category */
  if (path === "/api/admin/next-number" && req.method === "GET") {
    const doc = readMenuDoc();
    return json(req, res, 200, { ok: true, number: nextFreeNumber(doc, query.get("category") || "") });
  }

  if (path === "/api/admin/me" && req.method === "GET") {
    return json(req, res, 200, { ok: true, expiresAt: claims.exp });
  }

  return json(req, res, 404, { ok: false, error: "Unknown admin endpoint." });
}

/* ------------------------------------------------------------ handler --- */
const server = createServer(async (req, res) => {
  const url = req.url || "/";

  if (url.startsWith("/api/admin/")) return handleAdmin(req, res, url).catch((error) => {
    console.error("[admin]", error);
    json(req, res, 500, { ok: false, error: "Something went wrong on the server." });
  });
  if (req.method === "POST" && url.startsWith("/api/contact")) return handleContact(req, res);
  if (url === "/api/health") {
    return send(req, res, 200, JSON.stringify({ ok: true, uptime: process.uptime() }), {
      "Content-Type": "application/json",
    });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(req, res, 405, "Method not allowed", { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD, POST" });
  }
  if (url.startsWith("/api/")) return send(req, res, 404, JSON.stringify({ ok: false }), { "Content-Type": "application/json" });

  const full = resolveFile(url);
  if (!full) return notFound(req, res);

  if (full.endsWith(`${sep}admin.html`)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  }

  const info = statSync(full);
  const ext = extname(full).toLowerCase();
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const accept = req.headers["accept-encoding"] || "";
  const headers = headersFor(full, info.size);
  headers.ETag = etag;

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ...SECURITY_HEADERS, ETag: etag, "Cache-Control": headers["Cache-Control"] });
    return res.end();
  }

  const type = MIME[ext] || "";
  if (COMPRESSIBLE.test(type) && info.size > 1024) {
    const body = await readFile(full);
    const packed = compress(full, body);
    const useBrotli = /\bbr\b/.test(accept);
    const useGzip = /\bgzip\b/.test(accept);
    if (useBrotli || useGzip) {
      const encoded = useBrotli ? packed.brotli : packed.gzip;
      res.writeHead(200, {
        ...headers,
        "Content-Length": encoded.length,
        "Content-Encoding": useBrotli ? "br" : "gzip",
        Vary: "Accept-Encoding",
        ETag: etag,
      });
      res.end(req.method === "HEAD" ? undefined : encoded);
      return;
    }
  }

  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  createReadStream(full)
    .on("error", () => {
      res.destroy();
    })
    .pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Kungfu Noodles site running at http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
