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
import { createReadStream, existsSync, statSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const INBOX = join(ROOT, "data", "inquiries.jsonl");

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

/* ------------------------------------------------------------ handler --- */
const server = createServer(async (req, res) => {
  const url = req.url || "/";

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
