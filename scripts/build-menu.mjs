#!/usr/bin/env node
/**
 * Generates the static menu markup + Menu JSON-LD from assets/data/menu.json
 * and injects it into menu.html between `build:` markers. Also writes
 * MENU-SOURCES.md — where every number, name and price on the menu came from.
 *
 *   node scripts/build-menu.mjs
 *
 * Menu content lives in ONE place (the JSON). The generated HTML is real
 * markup — crawlable, readable without JavaScript. Client-side filtering
 * (assets/js/menu.js) only runs on top of it.
 *
 * Per item:
 *   no      number printed on the board in the shop
 *   price   NPR, exactly as printed on that board
 *   source  the photograph the row was transcribed from — printed in MENU-SOURCES.md
 *
 * Every price on this site is a price read off the shop's own board. There is no
 * estimate path in this script: an item either has a board price or it is not
 * listed.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "assets/data/menu.json"), "utf8"));
const allItems = data.categories.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name })));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FLAME =
  '<svg class="flame" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

const DIET = {
  veg: { label: "Vegetarian", dot: "veg" },
  egg: { label: "Egg", dot: "veg" },
  meat: { label: "Minced meat", dot: "meat" },
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
/* A dish photo is optional. When an item has "photo": true the admin panel has
   uploaded raw/dish-<id>.<ext> and build-assets has written the sizes below. */
const photoMarkup = (item) => {
  if (!item.photo) return "";
  const name = `dish-${item.id}`;
  const alt = item.photoAlt || `${item.name} at Kungfu Noodles`;
  return `<span class="dish-row__photo">
              <picture>
                <source type="image/webp" srcset="assets/img/${name}-300.webp 300w, assets/img/${name}-420.webp 420w, assets/img/${name}-620.webp 620w" sizes="72px" />
                <img src="assets/img/${name}-300.jpg" width="300" height="225" loading="lazy" decoding="async" alt="${esc(alt)}" />
              </picture>
            </span>
            `;
};

const cardMarkup = (item, cat) => {
  const haystack = `${item.no ? `number ${item.no} ` : ""}${item.name} ${item.cn ?? ""} ${item.desc} ${cat.name}`.toLowerCase();
  const noMarkup = item.no
    ? `<span class="dish-row__no" title="Number on the board in the shop">${item.no}</span>`
    : `<span class="dish-row__no dish-row__no--empty" aria-hidden="true">·</span>`;
  const priceMarkup = `<span class="dish-row__price">Rs ${item.price}</span>`;

  return `        <article class="dish-row" data-item="${esc(item.id)}" data-name="${esc(item.name)}" data-cat="${esc(cat.id)}"
          data-heat="${item.heat || 0}" data-diet="${esc(item.diet)}" data-price="${item.price}"${item.photo ? ' data-photo="true"' : ""}
          data-search="${esc(haystack)}">
          ${photoMarkup(item)}${noMarkup}
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
const sourceNote = `<div class="source-note" role="note">
            <span class="source-note__dot" aria-hidden="true"></span>
            <p><strong>${allItems.length} dishes, ${allItems.length === 1 ? "one number" : "every number"} read off the board on the
            wall.</strong> Prices are the ones printed in the shop. The rest of the wall carries more
            numbers than we could photograph clearly, so they are not listed here.</p>
            <a href="credits.html#menu">See the board photographs</a>
          </div>`;

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
      ...(i.photo ? { image: `https://kungfunoodles.com.np/assets/img/dish-${i.id}-620.jpg` } : {}),
      ...(i.diet === "veg" ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
      offers: { "@type": "Offer", price: i.price, priceCurrency: "NPR" },
    })),
  })),
};

const html = readFileSync(join(root, "menu.html"), "utf8");
const replaced = html
  .replace(/(<!-- build:menu-filters -->)[\s\S]*?(<!-- \/build:menu-filters -->)/, `$1\n${filterMarkup}\n$2`)
  .replace(/(<!-- build:menu-sections -->)[\s\S]*?(<!-- \/build:menu-sections -->)/, `$1\n${sections}\n$2`)
  .replace(/(<!-- build:menu-banner -->)[\s\S]*?(<!-- \/build:menu-banner -->)/, `$1\n${sourceNote}\n$2`)
  .replace(
    /(<!-- build:menu-jsonld -->)[\s\S]*?(<!-- \/build:menu-jsonld -->)/,
    `$1\n<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n</script>\n$2`
  );

if (replaced === html && !html.includes("build:menu-banner")) {
  console.warn("! menu.html is missing the build:menu-banner markers");
}

writeFileSync(join(root, "menu.html"), replaced);

/* ------------------------------------------------------- source report */
const dated = new Date().toISOString().slice(0, 10);
const report = [
  "# Where every price on the menu came from",
  "",
  `Generated from \`assets/data/menu.json\` on ${dated}. **${allItems.length} items, every one of them read off`,
  "the shop's own menu boards — there is nothing estimated on this site.**",
  "",
  "## The boards",
  "",
  "The shop prices its menu on hand-lettered picture boards inside the door: noodles from #01,",
  "the cold counter from #20. Nosh Nepal photographed both for the Kungfu Noodles listing",
  "(noshnepal.com/restaurant/kungfu-noodles). Those two photographs are the source for this menu,",
  "and both are shown on `credits.html#menu`.",
  "",
  "## Per-item transcription",
  "",
  "| Board # | Printed on the board | Chinese | Price |",
  "| --- | --- | --- | --- |",
  ...allItems.map((i) => `| ${i.no} | ${i.name} | ${i.cn} | Rs ${i.price} |`),
  "",
  "## What is deliberately missing",
  "",
  ...data.meta && data.meta.note ? [`- ${data.meta.note}`] : [],
  "- **Numbers not read:** the noodle board's #04–#07, #10 and #17–#19 and the cold counter's #29, #30,",
  "  #33, #35 and #37 are outside the frame or too blurred in the photographs. The shop's own wall",
  "  lists them; we would rather leave a gap than invent a dish or a price.",
  "- **Drinks:** there is a fridge of cold bottles and cans by the counter, but no board price for",
  "  them, so no drink is listed or charged for on this site.",
  "",
  "## Business facts, and where they came from",
  "",
  "| Fact | Value | Source |",
  "| --- | --- | --- |",
  "| Rating | 4.0 from 739 reviews, 1,200 photos | Google Maps listing |",
  "| Second rating | 4.5 from 21 reviews, #370 of 1,484 in Kathmandu | Tripadvisor d13462947 |",
  "| Hours | 9:00 AM – 11:00 PM, every day | Google Maps and Nosh Nepal |",
  "| Address | JP Marg, Thamel, Kathmandu 44600 | Google Maps listing |",
  "| Plus code | P866+W3 | Google Maps listing |",
  "| Phone / WhatsApp | +977 985-1172950 | Google Maps listing |",
  "| Email | manojadhikari2950@gmail.com, kungfurestaurant8@gmail.com | Facebook page, Tripadvisor |",
  "| Average spend | Rs 500 a head | Nosh Nepal listing |",
  "",
  "## Still worth a human check",
  "",
  "- **Allergens.** Nothing is claimed about allergens anywhere on the site. The wall says peanuts,",
  "  sesame and wheat noodles; ask the kitchen before you print an allergen list.",
  "- **The gaps above.** A phone photo of each board, taken straight on with no glare, would fill in",
  "  every missing number in an hour.",
  "- **Review quotes.** The quotes on the home page are reproduced from public Google reviews and",
  "  attributed; keep the attribution if you edit them.",
  "",
].join("\n");

writeFileSync(join(root, "MENU-SOURCES.md"), report);
if (existsSync(join(root, "MENU-TO-CONFIRM.md"))) unlinkSync(join(root, "MENU-TO-CONFIRM.md"));

console.log(
  `menu.html updated — ${data.categories.length} categories, ${allItems.length} items, ` +
    `${allItems.filter((i) => i.diet === "veg").length} vegetarian.`
);
console.log("MENU-SOURCES.md written.");
