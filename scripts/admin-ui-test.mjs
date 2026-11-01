#!/usr/bin/env node
/**
 * Admin panel UI tests (jsdom).
 *
 *   node scripts/admin-ui-test.mjs
 *
 * Loads the real admin.html, runs the real assets/js/admin.js against a stubbed
 * fetch, and checks the parts that matter:
 *
 *   - nothing is shown until you are signed in
 *   - the dish list renders from the API
 *   - a dish name containing HTML is rendered as text, never as markup
 *   - deleting asks for confirmation and issues the right request
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
const failures = [];
const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const menu = JSON.parse(read("assets/data/menu.json"));
// a dish whose name is an XSS attempt
const hostile = {
  ...menu.categories[0].items[0],
  id: "hostile",
  no: 99,
  name: '<img src=x onerror="window.__pwned=true">',
};
menu.categories[0].items = [hostile, ...menu.categories[0].items];

const calls = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => {
  if (!/Could not load|Not implemented/.test(e.message)) failures.push(`console error: ${e.message}`);
});
virtualConsole.on("error", (e) => failures.push(`console error: ${e}`));

const dom = new JSDOM(read("admin.html"), {
  url: "https://kungfunoodles.com.np/admin",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

window.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || "GET" });
  const body = JSON.parse(options.body || "{}");
  const reply = (status, payload) => ({ ok: status < 400, status, json: async () => payload });

  if (String(url).includes("/api/health")) {
    return { ok: true, status: 200, json: async () => ({ ok: true, uptime: 1 }) };
  }
  if (String(url).includes("/api/admin/login")) {
    return body.password === "right"
      ? reply(200, { ok: true, token: "tok-123", expiresAt: Date.now() + 3600e3 })
      : reply(401, { ok: false, error: "That password is not right." });
  }
  if (String(url).includes("/api/admin/menu") && (options.method || "GET") === "GET") {
    return reply(200, { ok: true, menu });
  }
  if (String(url).includes("/api/admin/menu") && options.method === "PUT") {
    return reply(200, { ok: true, menu: body.menu });
  }
  return reply(404, { ok: false, error: "unknown" });
};

// jsdom has no confirm(); default to "yes" and record the prompt
const confirms = [];
window.confirm = (message) => {
  confirms.push(message);
  return true;
};
window.sessionStorage.clear();

// run the real script
window.eval(read("assets/js/admin.js"));
await sleep(30);

const $ = (sel) => window.document.querySelector(sel);
const text = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ tests */
check("login screen is shown when signed out", $("#login-screen").hidden === false);
check("the editor is hidden when signed out", $("#admin-app").hidden === true);
check("no dish data is rendered before sign-in", !text($("#categories")).includes("Kungfu"));

{
  $("#admin-password").value = "wrong";
  $("#login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(40);
  check("a wrong password shows an error and stays on the login screen", $("#admin-app").hidden === true && !$("#login-msg").hidden);
}

{
  $("#admin-password").value = "right";
  $("#login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(80);
  check("a correct password opens the editor", $("#admin-app").hidden === false);
  check("token is kept in sessionStorage, not a cookie", window.sessionStorage.getItem("kf-admin-token") === "tok-123");
  check("no cookie was set by the panel", window.document.cookie === "");
  check("categories render", window.document.querySelectorAll(".admin-cat").length === menu.categories.length);
  check("every dish renders", window.document.querySelectorAll(".admin-row").length === menu.categories.flatMap((c) => c.items).length);
}

{
  const row = window.document.querySelector('[data-item="hostile"], .admin-row');
  const rows = [...window.document.querySelectorAll(".admin-row")];
  const hostileRow = rows.find((r) => text(r).includes("onerror"));
  check("a dish name containing HTML is displayed as text", Boolean(hostileRow));
  check("no element was created from that dish name", hostileRow?.querySelector("img[src='x']") == null);
  check("no inline event handler executed", window.__pwned !== true);
}

{
  const before = calls.length;
  const rows = [...window.document.querySelectorAll(".admin-row")];
  const target = rows.find((r) => text(r).includes("Kungfu Noodles Special"));
  const del = [...target.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete");
  del.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(60);
  check("deleting asks for confirmation first", confirms.some((c) => /Delete/.test(c)));
  const putCall = calls.slice(before).find((c) => c.method === "PUT");
  check("deleting sends a PUT with the updated menu", Boolean(putCall));
}

{
  // the edit form opens and offers the board prices
  const rows = [...window.document.querySelectorAll(".admin-row")];
  const target = rows.find((r) => text(r).includes("Noodles, Wuhan Style"));
  const edit = [...target.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit");
  edit.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(20);
  const priceList = [...window.document.querySelectorAll("datalist option")].map((o) => o.value);
  check("the price picker offers only board prices", priceList.length > 0 && priceList.every((v) => menu.meta.boardPrices.includes(Number(v))));
  const source = window.document.querySelector(".admin-editor input[name='source']");
  check("the edit form is prefilled with where the dish came from", Boolean(source?.value));
}

/* ------------------------------------------ hosted as plain files (GitHub Pages) */
{
  const staticConsole = new VirtualConsole();
  staticConsole.on("jsdomError", () => {});
  const staticDom = new JSDOM(read("admin.html"), {
    url: "https://someone.github.io/Resturant-Website/admin",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: staticConsole,
  });
  const w = staticDom.window;
  // a static host answers everything with 404 + the 404 page
  w.fetch = async () => ({ ok: false, status: 404, json: async () => { throw new Error("not json"); } });
  w.sessionStorage.clear();
  w.eval(read("assets/js/admin.js"));
  await sleep(50);

  const q = (sel) => w.document.querySelector(sel);
  check("on a static host the editor says so instead of asking for a password", q("#offline-note").hidden === false);
  check("on a static host the sign-in fields are hidden", q("#login-submit").hidden === true);
  check("the heading changes for static hosting", /No editor on this copy/.test(q("#login-title").textContent));
  check("it names the two ways to change the menu", /menu\.json/.test(q("#offline-note").textContent) && /npm start/.test(q("#offline-note").textContent));
  staticDom.window.close();
}

console.log("");
if (failures.length) {
  console.error(`✖ ${failures.length} problem(s) across ${passed + failures.length} panel tests:\n`);
  failures.forEach((f) => console.error(`  · ${f}`));
  process.exit(1);
}
console.log(`✓ all ${passed} panel tests passed`);
window.close();
