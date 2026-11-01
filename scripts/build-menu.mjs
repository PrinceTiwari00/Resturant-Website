#!/usr/bin/env node
/**
 * Generates the static menu markup + Menu JSON-LD from assets/data/menu.json
 * and injects it into menu.html between `build:` markers.
 *
 * Menu content lives in ONE place (the JSON). The generated HTML is real
 * markup — crawlable, linkable, and readable without JavaScript. Client-side
 * filtering (assets/js/menu.js) only runs on top of it.
 *
 *   node scripts/build-menu.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "assets/data/menu.json"), "utf8"));

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

const filterMarkup = `<button class="chip-filter is-active" type="button" data-filter="all" aria-pressed="true">Everything</button>
${data.categories
  .map(
    (c) =>
      `<button class="chip-filter" type="button" data-filter="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`
  )
  .join("\n")}
<button class="chip-filter" type="button" data-filter="veg" aria-pressed="false">Vegetarian</button>
<button class="chip-filter" type="button" data-filter="spicy" aria-pressed="false">Spicy</button>`;

const cardMarkup = (item, cat) => {
  const haystack = `${item.name} ${item.desc} ${cat.name}`.toLowerCase();
  return `        <article class="dish-row" data-item="${esc(item.id)}" data-name="${esc(item.name)}" data-cat="${esc(cat.id)}"
          data-heat="${item.heat || 0}" data-diet="${esc(item.diet)}" data-price="${item.price}"
          data-search="${esc(haystack)}">
          <div class="dish-row__main">
            <div class="dish-row__line">
              <h3 class="dish-row__name">${esc(item.name)}${
    item.badge ? ` <span class="tag">${esc(item.badge)}</span>` : ""
  }</h3>
              <span class="dish-row__leader" aria-hidden="true"></span>
              <span class="dish-row__price">Rs ${item.price}</span>
            </div>
            <p class="dish-row__desc">${esc(item.desc)}</p>
            <div class="dish-row__meta">${dietMarkup(item.diet)}${heatMarkup(item.heat)}</div>
          </div>
          <button class="dish-row__add" type="button" data-add-to-order="${esc(item.id)}"
            aria-label="Add ${esc(item.name)} to your order">
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

const allItems = data.categories.flatMap((c) => c.items);
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
      ...(i.diet === "veg" ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
      offers: { "@type": "Offer", price: i.price, priceCurrency: "NPR" },
    })),
  })),
};

const html = readFileSync(join(root, "menu.html"), "utf8");
const replaced = html
  .replace(/(<!-- build:menu-filters -->)[\s\S]*?(<!-- \/build:menu-filters -->)/, `$1\n${filterMarkup}\n$2`)
  .replace(/(<!-- build:menu-sections -->)[\s\S]*?(<!-- \/build:menu-sections -->)/, `$1\n${sections}\n$2`)
  .replace(
    /(<!-- build:menu-jsonld -->)[\s\S]*?(<!-- \/build:menu-jsonld -->)/,
    `$1\n<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n</script>\n$2`
  );

writeFileSync(join(root, "menu.html"), replaced);
console.log(
  `menu.html updated — ${data.categories.length} categories, ${allItems.length} items, ` +
    `${allItems.filter((i) => i.diet === "veg").length} vegetarian.`
);
