#!/usr/bin/env node
/**
 * Generates the static menu markup + Menu JSON-LD from assets/data/menu.json
 * and injects it into menu.html between `build:` markers. Also writes
 * MENU-TO-CONFIRM.md — the owner's checklist of unverified items.
 *
 *   node scripts/build-menu.mjs
 *
 * Menu content lives in ONE place (the JSON). The generated HTML is real
 * markup — crawlable, readable without JavaScript. Client-side filtering
 * (assets/js/menu.js) only runs on top of it.
 *
 * Per item:
 *   no         number printed on the board in the shop (null if unnumbered)
 *   price      NPR
 *   confirmed  false → price is an estimate; rendered with an "est." marker
 *              and counted in the draft banner until the owner flips it
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "assets/data/menu.json"), "utf8"));
const allItems = data.categories.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name })));
const unconfirmed = allItems.filter((i) => !i.confirmed);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FLAME =
  '<svg class="flame" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

const DIET = {
  veg: { label: "Vegetarian", dot: "veg" },
  choice: { label: "Chicken or Buff", dot: "mix" },
  chicken: { label: "Chicken", dot: "meat" },
  buff: { label: "Buff", dot: "meat" },
  pork: { label: "Pork", dot: "meat" },
};

const heatMarkup = (heat) => {
  if (!heat) return "";
  const label = `Heat level ${heat} of 3`;
  let flames = "";
  for (let i = 1; i <= 3; i++) flames += FLAME.replace('class="flame"', `class="flame${i <= heat ? " is-on" : ""}"`);
  return `<span class="heat" role="img" aria-label="${label}" title="${label}">${flames}</span>`;
};

const dietMarkup = (diet) => {
  const d = DIET[diet] ?? DIET.veg;
  return `<span class="diet"><span class="diet__dot diet__dot--${d.dot}" aria-hidden="true"></span>${esc(d.label)}</span>`;
};

/* ------------------------------------------------------------- filters */
const filterMarkup = `<button class="chip-filter is-active" type="button" data-filter="all" aria-pressed="true">Everything</button>
${data.categories
  .map(
    (c) =>
      `<button class="chip-filter" type="button" data-filter="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`
  )
  .join("\n")}
<button class="chip-filter" type="button" data-filter="veg" aria-pressed="false">Vegetarian</button>
<button class="chip-filter" type="button" data-filter="spicy" aria-pressed="false">Spicy</button>`;

/* --------------------------------------------------------------- cards */
const cardMarkup = (item, cat) => {
  const haystack = `${item.no ? `number ${item.no} ` : ""}${item.name} ${item.cn ?? ""} ${item.desc} ${cat.name}`.toLowerCase();
  const noMarkup = item.no
    ? `<span class="dish-row__no" title="Number on the board in the shop">${item.no}</span>`
    : `<span class="dish-row__no dish-row__no--empty" aria-hidden="true">·</span>`;
  const priceMarkup = item.confirmed
    ? `<span class="dish-row__price">Rs ${item.price}</span>`
    : `<span class="dish-row__price">Rs ${item.price} <span class="dish-row__est" title="Price still to be confirmed with the kitchen">est.</span></span>`;

  return `        <article class="dish-row" data-item="${esc(item.id)}" data-name="${esc(item.name)}" data-cat="${esc(cat.id)}"
          data-heat="${item.heat || 0}" data-diet="${esc(item.diet)}" data-price="${item.price}" data-confirmed="${item.confirmed}"
          data-search="${esc(haystack)}">
          ${noMarkup}
          <div class="dish-row__main">
            <div class="dish-row__line">
              <h3 class="dish-row__name">${esc(item.name)}${
    item.cn ? ` <span class="dish-row__cn" lang="zh">${esc(item.cn)}</span>` : ""
  }${item.badge ? ` <span class="tag">${esc(item.badge)}</span>` : ""}</h3>
              <span class="dish-row__leader" aria-hidden="true"></span>
              ${priceMarkup}
            </div>
            <p class="dish-row__desc">${esc(item.desc)}</p>
            <div class="dish-row__meta">${dietMarkup(item.diet)}${heatMarkup(item.heat)}</div>
          </div>
          <button class="dish-row__add" type="button" data-add-to-order="${esc(item.id)}"
            aria-label="Add ${esc(item.name)}${item.no ? `, number ${item.no} on the board,` : ""} to your order">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </article>`;
};

let counter = 0;
const sections = data.categories
  .map((cat) => {
    counter += 1;
    const num = String(counter).padStart(2, "0");
    return `    <section class="menu-cat" id="cat-${esc(cat.id)}" data-cat-section="${esc(cat.id)}" aria-labelledby="title-${esc(
      cat.id
    )}">
      <header class="menu-cat__head">
        <span class="menu-cat__num">${num}</span>
        <div>
          <h2 class="menu-cat__title" id="title-${esc(cat.id)}">${esc(cat.name)} <span class="cn" lang="zh">${esc(
      cat.cn
    )}</span></h2>
          <p class="menu-cat__blurb">${esc(cat.blurb)}</p>
        </div>
      </header>
      <div class="menu-cat__grid">
${cat.items.map((item) => cardMarkup(item, cat)).join("\n")}
      </div>
    </section>`;
  })
  .join("\n\n");

/* -------------------------------------------------------------- banner */
const draftBanner = unconfirmed.length
  ? `<div class="draft-banner" role="status">
            <span class="draft-banner__dot" aria-hidden="true"></span>
            <p><strong>Draft menu.</strong> ${unconfirmed.length} of ${allItems.length} prices are still to be
            confirmed with the kitchen — they're marked <span class="dish-row__est">est.</span>
            Numbers match the board in the shop.</p>
            <a href="contact.html#write">Tell us about a wrong price</a>
          </div>`
  : "";

/* --------------------------------------------------------------- jsonld */
const jsonld = {
  "@context": "https://schema.org",
  "@type": "Menu",
  name: "Kungfu Noodles Menu",
  inLanguage: "en",
  hasMenuSection: data.categories.map((c) => ({
    "@type": "MenuSection",
    name: c.name,
    description: c.blurb,
    hasMenuItem: c.items.map((i) => ({
      "@type": "MenuItem",
      name: i.name,
      description: i.desc,
      identifier: i.no ? String(i.no) : undefined,
      ...(i.diet === "veg" ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
      offers: { "@type": "Offer", price: i.price, priceCurrency: "NPR" },
    })),
  })),
};

const html = readFileSync(join(root, "menu.html"), "utf8");
const replaced = html
  .replace(/(<!-- build:menu-filters -->)[\s\S]*?(<!-- \/build:menu-filters -->)/, `$1\n${filterMarkup}\n$2`)
  .replace(/(<!-- build:menu-sections -->)[\s\S]*?(<!-- \/build:menu-sections -->)/, `$1\n${sections}\n$2`)
  .replace(/(<!-- build:menu-banner -->)[\s\S]*?(<!-- \/build:menu-banner -->)/, `$1\n${draftBanner}\n$2`)
  .replace(
    /(<!-- build:menu-jsonld -->)[\s\S]*?(<!-- \/build:menu-jsonld -->)/,
    `$1\n<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n</script>\n$2`
  );

if (replaced === html && !html.includes("build:menu-banner")) {
  console.warn("! menu.html is missing the build:menu-banner markers");
}

writeFileSync(join(root, "menu.html"), replaced);

/* ------------------------------------------- owner's verification list */
const report = [
  "# Menu items to confirm with the kitchen",
  "",
  `Generated from \`assets/data/menu.json\` on ${new Date().toISOString().slice(0, 10)}.`,
  "",
  "`confirmed: false` (or a manually flagged estimate) renders with an **est.** marker on the site and",
  "counts towards the draft banner on the menu page. Flip the flag to `true` once the price is right,",
  "then run `npm run menu` — the banner disappears when every item is confirmed.",
  "",
  `**${unconfirmed.length} of ${allItems.length} items still to confirm.**`,
  "",
  "| # | Item | Category | Listed price | Why it needs confirming |",
  "| --- | --- | --- | --- | --- |",
  ...unconfirmed.map(
    (i) => `| ${i.no ?? "—"} | ${i.name} | ${i.category} | Rs ${i.price} | ${i.source.replace(/\|/g, "\\|")} |`
  ),
  "",
  "## Everything else on the site that needs a human check",
  "",
  "- **Numbers.** Only #1, #3, #8, #11, #14 and #16 are confirmed from public sources. The board prints",
  "  numbers up to at least #16 and lists about 15 noodle dishes — add the rest (#2, #4–#7, #9, #10,",
  "  #12, #13, #15).",
  "- **Side dishes.** The shop lists about 20 sides; 13 are transcribed here. Photograph the side-dish",
  "  board and add the rest.",
  "- **Prices.** Confirmed in public sources: Kungfu Special Rs 380 (2022), Buff Sichuan Rs 320, Sesame",
  "  Wuhan Rs 320, Spicy Chicken Rs 240, Special Chinese Dry Noodles Rs 350, Agaric/Cucumber Rs 150 each,",
  "  canned tea Rs 250. Everything else is an educated estimate and is marked *est.* on the site.",
  "- **Hours.** The site now uses the live listings — Google and Tripadvisor both say 9:00 AM – 11:00 PM",
  "  daily. The client brief said 9:30 AM – 10:30 PM, so please confirm which is right; change `SCHEDULE`",
  "  in `assets/js/main.js`, the hours lists in `index.html` and `contact.html`, and the JSON-LD.",
  "- **Rating.** Shown as 4.0 from 739 Google reviews (and 4.5 from 21 Tripadvisor reviews), attributed",
  "  with links. It is deliberately **not** in the structured data as `aggregateRating`: Google's policy",
  "  does not allow third-party review counts to be marked up on your own site. If you collect reviews",
  "  yourselves, that can be added.",
  "- **Recipes/allergens.** The description text is written from reviews and photo captions, not from the",
  "  kitchen — read it before it goes live.",
  "",
].join("\n");

writeFileSync(join(root, "MENU-TO-CONFIRM.md"), report);

console.log(
  `menu.html updated — ${data.categories.length} categories, ${allItems.length} items ` +
    `(${allItems.length - unconfirmed.length} confirmed, ${unconfirmed.length} to confirm), ` +
    `${allItems.filter((i) => i.diet === "veg").length} vegetarian.`
);
console.log("MENU-TO-CONFIRM.md written.");
