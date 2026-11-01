#!/usr/bin/env node
/**
 * Menu data guard.
 *
 *   node scripts/menu-check.mjs
 *
 * `assets/data/menu.json` is the single source of truth for the menu, and
 * `npm run menu` bakes it into `menu.html`. This script is the safety net for
 * whoever edits that JSON — it fails before a bad edit reaches a visitor.
 *
 * It checks two things:
 *
 *   1. The data itself: every row has the fields the generator needs, board
 *      numbers and ids are unique, and every price is one of the prices printed
 *      on the shop's boards (meta.boardPrices) — so a typo like 32 instead of
 *      320 cannot go live.
 *
 *   2. That the pages agree with the data in BOTH directions: an item added to
 *      the JSON but not yet regenerated is caught, and so is an item DELETED
 *      from the JSON that is still sitting in menu.html or on a hand-written
 *      card on another page.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const problems = [];
const fail = (msg) => problems.push(msg);

const data = JSON.parse(read("assets/data/menu.json"));
const meta = data.meta ?? {};
const boardPrices = meta.boardPrices;

if (!Array.isArray(boardPrices) || boardPrices.length < 2) {
  fail("menu.json: meta.boardPrices must list every price printed on the shop's boards");
}
if (!meta.currency && data.currency !== "NPR") fail('menu.json: currency must be "NPR"');

const DIETS = new Set(["veg", "egg", "meat", "chicken", "buff", "pork"]);
const ids = new Map();
const numbers = new Map();
const allItems = [];

for (const cat of data.categories ?? []) {
  if (!cat.id) fail("menu.json: a category is missing its id");
  if (!cat.name) fail(`menu.json: category "${cat.id}" is missing its name`);
  if (!cat.cn) fail(`menu.json: category "${cat.id}" is missing its Chinese label`);
  if (!Array.isArray(cat.items) || cat.items.length === 0) {
    fail(`menu.json: category "${cat.id}" has no items`);
    continue;
  }

  for (const item of cat.items) {
    const where = `${cat.id}/${item.id ?? "?"}`;
    allItems.push({ ...item, category: cat.id });

    // --- fields the generator and the page need
    for (const field of ["no", "id", "name", "cn", "desc", "price", "diet", "source"]) {
      if (item[field] === undefined || item[field] === null || item[field] === "") {
        fail(`${where}: missing "${field}"`);
      }
    }
    if (typeof item.no !== "number" || item.no < 1) fail(`${where}: "no" must be the board number as a number`);
    if (typeof item.price !== "number") fail(`${where}: "price" must be a number, not a string`);
    if (typeof item.heat !== "number" || item.heat < 0 || item.heat > 3) {
      fail(`${where}: "heat" must be the number of flames on the board, 0–3`);
    }
    if (!DIETS.has(item.diet)) fail(`${where}: "diet" must be one of ${[...DIETS].join(", ")}`);
    if (typeof item.cn === "string" && !/[\u4e00-\u9fff]/.test(item.cn)) {
      fail(`${where}: "cn" should be the Chinese name printed on the board`);
    }
    if (typeof item.source !== "string" || item.source.length < 20) {
      fail(`${where}: "source" must say which board tile the row was read from`);
    } else if (typeof item.no === "number" && !String(item.source).includes(String(item.no))) {
      fail(`${where}: "source" should quote the board number #${item.no} it was transcribed from`);
    }

    // --- the price has to be one that is actually printed on a board
    // only meaningfully checked once we know it is a number at all
    if (typeof item.price === "number" && Array.isArray(boardPrices) && !boardPrices.includes(item.price)) {
      fail(
        `${where}: Rs ${item.price} is not a price on either board ` +
          `(allowed: ${boardPrices.join(", ")}). If the shop has a new price, photograph the board and add it to meta.boardPrices.`
      );
    }

    // --- uniqueness
    if (ids.has(item.id)) fail(`${where}: duplicate id, also used by ${ids.get(item.id)}`);
    ids.set(item.id, where);
    if (numbers.has(item.no)) fail(`${where}: board number #${item.no} is already used by ${numbers.get(item.no)}`);
    numbers.set(item.no, where);
  }
}

/* ------------------------------------------------ data ↔ pages agreement */
const menuHtml = existsSync(join(root, "menu.html")) ? read("menu.html") : "";
const rendered = new Set([...menuHtml.matchAll(/data-item="([^"]+)"/g)].map((m) => m[1]));

for (const id of ids.keys()) {
  if (!rendered.has(id)) fail(`menu.html: "${id}" is in menu.json but not on the page — run "npm run menu"`);
}
for (const id of rendered) {
  if (!ids.has(id)) {
    fail(`menu.html: "${id}" is on the page but no longer in menu.json — it was deleted; run "npm run menu"`);
  }
}

// Hand-written "add to order" buttons on other pages carry their own price
// attributes. They must point at a dish that still exists, and the price must
// match the JSON, or the cart charges the wrong money.
const OTHER_PAGES = ["index.html", "order.html", "contact.html", "credits.html"];
for (const page of OTHER_PAGES) {
  if (!existsSync(join(root, page))) continue;
  const html = read(page);
  for (const m of html.matchAll(/<[^>]*data-add-to-order="([^"]+)"[^>]*>/g)) {
    const tag = m[0];
    const id = m[1];
    const item = allItems.find((i) => i.id === id);
    if (!item) {
      fail(`${page}: "add to order" button for "${id}", which is not in menu.json any more`);
      continue;
    }
    const priceAttr = tag.match(/data-price="(\d+)"/);
    if (priceAttr && Number(priceAttr[1]) !== item.price) {
      fail(`${page}: button for "${id}" says Rs ${priceAttr[1]} but the board price is Rs ${item.price}`);
    }
    const noAttr = tag.match(/data-no="(\d+)"/);
    if (noAttr && Number(noAttr[1]) !== item.no) {
      fail(`${page}: button for "${id}" says board #${noAttr[1]} but the board number is #${item.no}`);
    }
  }
}

/* ------------------------------------------------------------- the verdict */
if (problems.length) {
  console.error(`✖ ${problems.length} menu problem(s):`);
  problems.forEach((p) => console.error(`  · ${p}`));
  process.exit(1);
}
const cats = data.categories.length;
console.log(
  `✓ menu OK — ${allItems.length} items in ${cats} categories, ` +
    `all prices on the board (${boardPrices.join("/")}), pages in sync`
);
