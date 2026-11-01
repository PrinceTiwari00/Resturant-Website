#!/usr/bin/env node
/**
 * Headless behaviour tests for the site's JavaScript.
 *
 *   npm test
 *
 * Uses jsdom to load the real HTML files, stubs the few browser APIs that
 * matter (fetch, matchMedia, IntersectionObserver) and exercises the paths a
 * customer actually takes: filtering the menu, adding dishes, switching to
 * delivery, validating the order and handing it to WhatsApp.
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const menuJson = read("assets/data/menu.json");
const menuData = JSON.parse(menuJson);
const allItems = menuData.categories.flatMap((c) => c.items);
const VEG_COUNT = allItems.filter((i) => i.diet === "veg").length;

let failures = 0;
const results = [];

function check(name, fn) {
  return async () => {
    try {
      await fn();
      results.push(`  ✓ ${name}`);
    } catch (error) {
      failures += 1;
      results.push(`  ✗ ${name}\n      ${error.message}`);
    }
  };
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const eq = (actual, expected, what) =>
  assert(actual === expected, `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Build a DOM for a page with the site scripts running. */
async function loadPage(page) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => {
    if (!/Could not load|Not implemented/.test(e.message)) {
      failures += 1;
      results.push(`  ✗ console error on ${page}: ${e.message}`);
    }
  });

  const dom = new JSDOM(read(page), {
    url: `https://kungfunoodles.com.np/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.open = () => ({ closed: false });
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.fetch = async (url) => ({
    ok: String(url).includes("menu.json"),
    status: 200,
    json: async () => JSON.parse(menuJson),
  });
  window.setInterval = () => 0;
  window.HTMLElement.prototype.scrollIntoView = () => {};

  for (const file of ["main.js", "menu.js", "order.js", "contact.js"]) {
    if (page === "contact.html" && file === "contact.js") {
      window.eval(read("assets/js/contact.js"));
      continue;
    }
    if (page !== "contact.html" && file === "contact.js") continue;
    if (page === "menu.html" && file === "menu.js") window.eval(read("assets/js/menu.js"));
    else if (file !== "menu.js") window.eval(read(`assets/js/${file}`));
  }
  await sleep(20);
  return { dom, window, doc: window.document };
}

const tests = [];
const test = (name, fn) => tests.push(check(name, fn));

/* ---------------------------------------------------------------------- */
test("home page: header, listing and live opening status render", async () => {
  const { doc } = await loadPage("index.html");
  assert(doc.querySelector(".site-header"), "header missing");
  eq(doc.querySelectorAll(".dish-card").length, 4, "signature dish cards");
  const status = doc.querySelector("[data-open-status]").textContent.trim();
  assert(/Open now|Closed now/.test(status), `opening status text looks wrong: "${status}"`);
  assert(doc.querySelector("#order-drawer"), "order drawer missing");

  // the Google listing numbers are on the page
  const heroRating = doc.querySelector(".hero__rating").textContent.replace(/\s+/g, " ");
  assert(/4\.0/.test(heroRating) && /739/.test(heroRating), `hero rating missing listing data: ${heroRating}`);
  assert(doc.querySelectorAll(".quote__name").length === 3, "three reviews expected");
  assert(/Google/.test(doc.querySelector(".quote__src").textContent), "reviews should be attributed to Google");
  assert(/P866\+W3/.test(doc.body.textContent), "plus code missing from the hero aside");
  assert(/9 AM – 11 PM|9:00 AM – 11:00 PM/.test(doc.body.textContent), "hours should reflect the live listing");
  const year = doc.querySelector("[data-year]").textContent;
  assert(/^\d{4}$/.test(year), "footer year not filled");

  // the status badge uses the same schedule as the listing (9 AM – 11 PM)
  const badge = doc.querySelector("[data-open-status]").textContent;
  assert(/until 11:00 PM|opens 9:00 AM/.test(badge), `unexpected opening status text: ${badge}`);
});

test("menu page: server-rendered items are present and filterable", async () => {
  const { doc, window } = await loadPage("menu.html");
  eq(doc.querySelectorAll("[data-item]").length, allItems.length, "menu rows in the static HTML");

  const vegChip = doc.querySelector('[data-filter="veg"]');
  vegChip.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const visible = [...doc.querySelectorAll("[data-item]")].filter((r) => !r.hidden);
  eq(visible.length, VEG_COUNT, "vegetarian rows after filtering");
  assert(
    visible.every((r) => r.dataset.diet === "veg"),
    "a non-vegetarian row leaked through the filter"
  );

  const spicy = doc.querySelector('[data-filter="spicy"]');
  spicy.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const hot = [...doc.querySelectorAll("[data-item]")].filter((r) => !r.hidden);
  assert(hot.length > 0 && hot.every((r) => Number(r.dataset.heat) >= 2), "spicy filter is wrong");
  eq(doc.querySelectorAll("[data-cat-section][hidden]").length > 0, true, "empty categories hidden");

  // board numbers are rendered for the items the shop numbers
  const numbered = [...doc.querySelectorAll("[data-item]")].filter((r) => /^\d+$/.test(r.querySelector(".dish-row__no").textContent.trim()));
  eq(numbered.length, allItems.filter((i) => i.no).length, "rows showing a board number");
  assert(doc.querySelector('[data-item="kungfu-special"] .dish-row__no').textContent.trim() === "1", "Kungfu Special should be #1");

  // bilingual names straight from the shop's own board photos
  eq(doc.querySelectorAll(".dish-row__cn").length, allItems.filter((i) => i.cn).length, "rows with a Chinese name");
  assert(doc.querySelector('[data-item="three-vegetable"] .dish-row__cn').textContent.trim() === "三鲜蔬菜面", "三鲜蔬菜面 Chinese name wrong");
  assert(doc.querySelector('[data-item="wuhan-style"] .dish-row__cn').textContent.trim() === "武汉热干面", "武汉热干面 Chinese name wrong");

  // every price on the page is a board price: no estimate marker exists anywhere
  eq(doc.querySelectorAll(".dish-row__est").length, 0, "rows still marked as estimates");
  const board = doc.querySelector(".source-note");
  assert(board, "the note saying where the prices come from is missing");
  assert(board.textContent.includes(String(allItems.length)), "source note should state how many dishes were transcribed");

  // the two boards photograph the shop's own prices — no item may claim a non-board price
  const PRICES = new Set(menuData.meta.boardPrices);
  assert(
    allItems.every((i) => PRICES.has(i.price)),
    `an item has a price that is not printed on either board: ${allItems.filter((i) => !PRICES.has(i.price)).map((i) => `${i.name} ${i.price}`).join(", ")}`
  );
  assert(allItems.every((i) => i.source && i.source.length > 20), "every item needs a board transcription in its source field");
});

test("menu page: search narrows results and handles no matches", async () => {
  const { doc, window } = await loadPage("menu.html");
  const input = doc.querySelector("#menu-search");
  input.value = "buff";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(200);
  let visible = [...doc.querySelectorAll("[data-item]")].filter((r) => !r.hidden);
  assert(visible.length >= 3, `expected buff results, got ${visible.length}`);

  input.value = "number 14";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(200);
  visible = [...doc.querySelectorAll("[data-item]")].filter((r) => !r.hidden);
  eq(visible.length, 1, "searching by board number should find exactly one dish");

  input.value = "zzzzz";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(200);
  visible = [...doc.querySelectorAll("[data-item]")].filter((r) => !r.hidden);
  eq(visible.length, 0, "visible rows for a nonsense query");
  assert(doc.querySelector(".menu-empty").classList.contains("is-visible"), "empty state not shown");
});

test("order: adding a dish updates the cart, badge and total", async () => {
  const { doc, window } = await loadPage("menu.html");
  const btn = doc.querySelector('[data-add-to-order="kungfu-special"]');
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  eq(doc.querySelectorAll(".cart-line").length, 1, "cart lines");
  eq(doc.querySelector("[data-order-subtotal]").textContent.trim(), "Rs 350", "subtotal");
  eq(doc.querySelector("[data-order-count]").textContent, "1", "header badge");

  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(doc.querySelector("[data-order-subtotal]").textContent.trim(), "Rs 700", "subtotal after second add");
  eq(doc.querySelector(".cart-line output").textContent, "2", "quantity");

  const minus = doc.querySelector('[data-qty="-1"]');
  minus.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  eq(doc.querySelector("[data-order-subtotal]").textContent.trim(), "Rs 350", "subtotal after decrement");

  // the cart shows the board number, and the sticky bar mirrors it
  assert(doc.querySelector(".cart-line__no")?.textContent.trim() === "#1", "cart line should carry the board number");
  const bar = doc.querySelector("[data-order-bar]");
  assert(bar.classList.contains("is-visible"), "sticky order bar should appear when the cart has items");
  eq(bar.inert, false, "order bar must be reachable when visible");
  assert(/1 item · Rs 350/.test(bar.textContent), `order bar summary wrong: ${bar.textContent.replace(/\s+/g, " ").trim()}`);

  doc.querySelector("[data-clear-order]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(!bar.classList.contains("is-visible"), "order bar should hide when the cart is emptied");
  eq(bar.inert, true, "order bar must be inert when hidden");
});

test("order: drawer opens, delivery address appears, validation blocks empty submit", async () => {
  const { doc, window } = await loadPage("order.html");
  const openBtn = doc.querySelector("[data-drawer-open]");
  openBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(doc.querySelector("#order-drawer").classList.contains("is-open"), "drawer did not open");
  eq(doc.querySelector("#order-drawer").inert, false, "drawer should not be inert when open");

  const type = doc.querySelector("#cust-type");
  type.value = "Delivery";
  type.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert(!doc.querySelector("#address-field").hasAttribute("hidden"), "address field should show for delivery");

  doc.querySelector("#order-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const status = doc.querySelector("#order-status");
  assert(status.classList.contains("is-visible"), "validation message not shown");
  assert(/Add at least one dish/i.test(status.textContent), `unexpected message: ${status.textContent}`);
});

test("order: valid order produces a WhatsApp hand-off with every line", async () => {
  const { doc, window } = await loadPage("menu.html");
  let opened = null;
  window.open = (url) => {
    opened = url;
    return { closed: false };
  };

  doc.querySelector('[data-add-to-order="wuhan-style"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.querySelector('[data-add-to-order="spiced-buff"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  doc.querySelector("#cust-name").value = "Sita Rai";
  doc.querySelector("#cust-name").dispatchEvent(new window.Event("input", { bubbles: true }));
  doc.querySelector("#cust-phone").value = "9812345678";
  doc.querySelector("#cust-phone").dispatchEvent(new window.Event("input", { bubbles: true }));

  doc.querySelector("#order-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(10);

  assert(opened, "WhatsApp was never opened");
  const url = new URL(opened);
  eq(url.hostname, "wa.me", "hand-off host");
  assert(url.pathname.includes("9779851172950"), "wrong phone number in hand-off");
  const text = decodeURIComponent(url.searchParams.get("text") || "");
  assert(text.includes("#14 Wuhan Style") || text.includes("#14 Noodles, Wuhan Style"), `board number missing from message: ${text}`);
  assert(text.includes("Spiced Buff"), "cold counter dish missing from message");
  assert(text.includes("Rs 560"), `total wrong in message: ${text}`);
  assert(text.includes("Sita Rai") && text.includes("9812345678"), "customer details missing");
});

test("home page: a signature dish can be added straight from the card", async () => {
  const { doc, window } = await loadPage("index.html");
  const btn = doc.querySelector('.dish-card__add[data-add-to-order="kungfu-special"]');
  assert(btn, "no add button on the signature card");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(doc.querySelector("[data-order-subtotal]").textContent.trim() === "Rs 350", "subtotal after adding from home");
  assert(doc.querySelector("[data-order-count]").textContent === "1", "header badge after adding from home");
  assert(doc.querySelector("[data-order-bar]").classList.contains("is-visible"), "sticky bar should appear on home too");
});

test("order: empty cart disables the send button", async () => {
  const { doc } = await loadPage("order.html");
  await sleep(30);
  assert(doc.querySelector("#order-send").disabled, "send button should be disabled with an empty cart");
});

test("contact page: plus code, both emails, amenities and rating are shown", async () => {
  const { doc } = await loadPage("contact.html");
  const text = doc.body.textContent;
  assert(/P866\+W3/.test(text), "plus code missing");
  assert(/kungfurestaurant8@gmail\.com/.test(text), "second email missing");
  assert(/manojadhikari2950@gmail\.com/.test(text), "main email missing");
  assert(/739/.test(text), "review count missing");
  assert(doc.querySelectorAll(".amenities li").length >= 6, "amenity list missing");
  assert(/Street View/.test(text), "street view link missing");
});

test("contact: form validates then posts to the API", async () => {
  const { doc, window } = await loadPage("contact.html");
  let posted = null;
  window.fetch = async (url, options) => {
    posted = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 201 };
  };
  // contact.js was evaluated before we swapped fetch; re-run it against the new stub
  window.eval(read("assets/js/contact.js"));

  const form = doc.querySelector("#contact-form");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert(doc.querySelector("#contact-status").classList.contains("form-status--error"), "empty form should error");

  doc.querySelector("#c-name").value = "Ram Shrestha";
  doc.querySelector("#c-email").value = "ram@example.com";
  doc.querySelector("#c-message").value = "We are twelve people on Friday, can you seat us?";
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(30);

  assert(posted, "no POST was made");
  eq(posted.url, "/api/contact", "endpoint");
  eq(posted.body.name, "Ram Shrestha", "posted name");
  assert(doc.querySelector("#contact-status").classList.contains("is-visible"), "success message missing");
  assert(!doc.querySelector("#contact-status").classList.contains("form-status--error"), "success shown as error");
});

test("contact: falls back to WhatsApp when the API is unavailable", async () => {
  const { doc, window } = await loadPage("contact.html");
  window.fetch = async () => {
    throw new Error("offline");
  };
  window.eval(read("assets/js/contact.js"));

  doc.querySelector("#c-name").value = "Maya Gurung";
  doc.querySelector("#c-phone").value = "9800000000";
  doc.querySelector("#c-message").value = "Do you deliver to Patan on Saturdays?";
  doc.querySelector("#contact-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(30);

  const html = doc.querySelector("#contact-status").innerHTML;
  assert(html.includes("wa.me"), "no WhatsApp fallback link");
  assert(html.includes("+9779851172950"), "no phone fallback");
});

/* ---------------------------------------------------------------------- */
console.log("Running behaviour tests…\n");
for (const run of tests) await run();
console.log(results.join("\n"));
console.log(
  failures === 0
    ? `\n✓ all ${tests.length} tests passed`
    : `\n✖ ${failures} problem(s) across ${tests.length} tests`
);
process.exit(failures === 0 ? 0 : 1);
