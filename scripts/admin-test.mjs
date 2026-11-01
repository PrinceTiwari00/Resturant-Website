#!/usr/bin/env node
/**
 * Admin API tests.
 *
 *   node scripts/admin-test.mjs
 *
 * Spawns the real server on a free port against a throwaway copy of menu.json
 * and a throwaway credentials file, then tries to use the panel the way an
 * attacker would as well as the way the owner would.
 *
 * Writes never touch the real menu: MENU_JSON points at a temp file and
 * ADMIN_SKIP_BUILD stops the page rebuild.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "correct horse battery staple";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const freePort = () =>
  new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const dir = mkdtempSync(join(tmpdir(), "kf-admin-"));
const menuCopy = join(dir, "menu.json");
copyFileSync(join(ROOT, "assets/data/menu.json"), menuCopy);

const port = await freePort();
const base = `http://127.0.0.1:${port}`;

process.env.ADMIN_DATA_DIR = dir;
process.env.ADMIN_PASSWORD = PASSWORD;
const { setPassword } = await import("./lib/auth.mjs");
setPassword(PASSWORD);

const server = spawn(process.execPath, [join(ROOT, "server.mjs")], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    MENU_JSON: menuCopy,
    ADMIN_DATA_DIR: dir,
    ADMIN_SKIP_BUILD: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${serverLog}`);
}

const api = (path, { method = "GET", body, token, headers = {}, raw } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });

const json = async (res) => ({ status: res.status, body: await res.json().catch(() => null) });

try {
  await waitForServer();
  console.log("\nRunning admin tests…\n");

  /* ---------------------------------------------------------------- auth */
  {
    const { status, body } = await json(await api("/api/admin/menu"));
    check("menu requires a token", status === 401, `got ${status}`);
    check("no menu leaks without auth", !JSON.stringify(body).includes("Kungfu Noodles Special"));
  }

  {
    const res = await api("/api/admin/menu", { headers: { Authorization: "Bearer not-a-token" } });
    check("garbage token rejected", res.status === 401);
  }

  {
    const token = "v1.eyJqdGkiOiJhYmMiLCJleHAiOjk5OTk5OTk5OTk5OTl9.ZmFrZS1zaWduYXR1cmU";
    const res = await api("/api/admin/menu", { token });
    check("forged token rejected", res.status === 401);
  }

  {
    const { status, body } = await json(await api("/api/admin/login", { method: "POST", body: { password: "wrong" } }));
    check("wrong password rejected", status === 401, `got ${status}`);
    check("wrong password gives no token", !body?.token);
  }

  let token;
  {
    const { status, body } = await json(await api("/api/admin/login", { method: "POST", body: { password: PASSWORD } }));
    check("correct password signs in", status === 200 && typeof body?.token === "string");
    check("token expires in the future", body?.expiresAt > Date.now());
    token = body.token;
  }

  {
    const { status, body } = await json(await api("/api/admin/menu", { token }));
    check("menu loads with a token", status === 200 && body?.menu?.categories?.length >= 2);
    check("menu keeps the board price whitelist", Array.isArray(body?.menu?.meta?.boardPrices));
  }

  /* -------------------------------------------------------------- writes */
  const original = JSON.parse(readFileSync(menuCopy, "utf8"));
  const boardPrices = original.meta.boardPrices;

  {
    const doc = structuredClone(original);
    doc.categories[0].items.push({
      no: 4,
      id: "test-dish",
      name: "Test Dish",
      cn: "试菜",
      desc: "A dish added by the test suite.",
      price: boardPrices[0],
      heat: 1,
      diet: "veg",
      source: "Board in the shop, noodles #4",
    });
    const { status } = await json(await api("/api/admin/menu", { method: "PUT", token, body: { menu: doc } }));
    check("a valid new dish is saved", status === 200);
    const onDisk = JSON.parse(readFileSync(menuCopy, "utf8"));
    check("new dish reaches the JSON file", onDisk.categories[0].items.some((i) => i.id === "test-dish"));
  }

  {
    const doc = JSON.parse(readFileSync(menuCopy, "utf8"));
    const dish = doc.categories[0].items.find((i) => i.id === "test-dish");
    dish.price = 999;
    const { status, body } = await json(await api("/api/admin/menu", { method: "PUT", token, body: { menu: doc } }));
    check("a price not on the board is refused", status === 422, `got ${status}`);
    check("the refusal explains why", /not a price on either board/.test(body?.problems?.join(" ") || ""));
    const onDisk = JSON.parse(readFileSync(menuCopy, "utf8"));
    check("a refused save writes nothing", onDisk.categories[0].items.find((i) => i.id === "test-dish").price !== 999);
  }

  {
    const doc = JSON.parse(readFileSync(menuCopy, "utf8"));
    doc.categories[0].items.find((i) => i.id === "test-dish").no = 1; // already taken by the real #1
    const { status, body } = await json(await api("/api/admin/menu", { method: "PUT", token, body: { menu: doc } }));
    check("a duplicate board number is refused", status === 422);
    check("duplicate message names the clash", /already used/.test(body?.problems?.join(" ") || ""));
  }

  {
    const doc = JSON.parse(readFileSync(menuCopy, "utf8"));
    const dish = doc.categories[0].items.find((i) => i.id === "test-dish");
    delete dish.cn;
    const { status } = await json(await api("/api/admin/menu", { method: "PUT", token, body: { menu: doc } }));
    check("a dish without a Chinese name is refused", status === 422);
  }

  {
    const doc = JSON.parse(readFileSync(menuCopy, "utf8"));
    doc.categories[0].items = doc.categories[0].items.filter((i) => i.id !== "test-dish");
    const { status } = await json(await api("/api/admin/menu", { method: "PUT", token, body: { menu: doc } }));
    check("a dish can be deleted", status === 200);
    const onDisk = JSON.parse(readFileSync(menuCopy, "utf8"));
    check("deleted dish is gone from the file", !onDisk.categories[0].items.some((i) => i.id === "test-dish"));
  }

  /* ------------------------------------------------------------- uploads */
  {
    const notAnImage = Buffer.from("<html><script>alert(1)</script></html>");
    const res = await api("/api/admin/photo?id=kungfu-special", {
      method: "POST",
      token,
      raw: notAnImage,
      headers: { "Content-Type": "image/jpeg" },
    });
    check("a non-image upload is refused even with an image content-type", res.status === 415, `got ${res.status}`);
  }

  {
    const res = await api("/api/admin/photo?id=does-not-exist", { method: "POST", token, raw: Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
    check("upload to an unknown dish is refused", res.status === 404);
  }

  {
    const res = await api("/api/admin/photo?id=../../etc/passwd", { method: "POST", token, raw: Buffer.from([0xff, 0xd8, 0xff]) });
    check("path traversal in the dish id goes nowhere", res.status === 404);
  }

  {
    const res = await api("/api/admin/menu", { method: "PUT", token, body: { menu: original }, headers: { Origin: "https://evil.example" } });
    check("cross-origin writes are refused", res.status === 403, `got ${res.status}`);
  }

  {
    const res = await api("/api/admin/login", { method: "POST", body: { password: "again-wrong" } });
    check("a signed-in token is still not a login bypass", res.status === 401);
  }

  /* -------------------------------------------------------------- logout */
  {
    const res = await api("/api/admin/logout", { method: "POST", token });
    check("sign out succeeds", res.status === 200);
    const after = await api("/api/admin/menu", { token });
    check("a signed-out token stops working", after.status === 401);
  }

  /* -------------------------------------------------------- fail closed */
  {
    rmSync(join(dir, "admin.json"));
    const res = await api("/api/admin/login", { method: "POST", body: { password: "" } });
    check("with no password configured the panel refuses to open", res.status === 503, `got ${res.status}`);
    const menu = await api("/api/admin/menu");
    check("with no password configured no menu is served", menu.status === 503);
  }
} finally {
  server.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}

console.log("");
if (failures.length) {
  console.error(`✖ ${failures.length} problem(s) across ${passed + failures.length} admin tests:\n`);
  failures.forEach((f) => console.error(`  · ${f}`));
  process.exit(1);
}
console.log(`✓ all ${passed} admin tests passed`);
