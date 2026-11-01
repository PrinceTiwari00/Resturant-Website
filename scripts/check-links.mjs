#!/usr/bin/env node
/**
 * Static link + asset checker.
 *
 *   node scripts/check-links.mjs
 *
 * Verifies that every internal href, src, srcset candidate and CSS url()
 * points at a file that exists, and that anchor targets (#ids) really exist
 * on the page they point to. Exits non-zero when something is broken so it
 * can gate a deploy.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const PAGES = ["index.html", "menu.html", "order.html", "contact.html", "credits.html", "404.html", "admin.html"];
const problems = [];

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const pageIds = new Map(PAGES.map((p) => [p, existsSync(join(ROOT, p)) ? idsOf(read(p)) : new Set()]));

function checkTarget(fromPage, rawUrl, kind) {
  if (!rawUrl) return;
  const url = rawUrl.trim().replace(/&amp;/g, "&");
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(url)) return;
  if (url === "#") return;

  const [pathPart, hashPart] = url.split("#");
  const [filePart] = pathPart.split("?");
  const targetPage = filePart === "" ? fromPage : normalize(filePart).replace(/^\.\//, "");

  if (filePart && !existsSync(join(ROOT, targetPage))) {
    problems.push(`${fromPage}: ${kind} → missing file "${filePart}"`);
    return;
  }
  if (hashPart) {
    const ids = pageIds.get(targetPage);
    if (!ids) {
      problems.push(`${fromPage}: ${kind} → anchor target page "${targetPage}" is not a checked page`);
    } else if (!ids.has(hashPart)) {
      problems.push(`${fromPage}: ${kind} → missing anchor "#${hashPart}" on ${targetPage}`);
    }
  }
}

for (const page of PAGES) {
  if (!existsSync(join(ROOT, page))) {
    problems.push(`missing page: ${page}`);
    continue;
  }
  const html = read(page);

  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"/g)) checkTarget(page, m[1], "link");
  for (const m of html.matchAll(/<img\b[^>]*src="([^"]*)"/g)) checkTarget(page, m[1], "img");
  for (const m of html.matchAll(/<source\b[^>]*srcset="([^"]*)"/g))
    m[1].split(",").forEach((c) => checkTarget(page, c.trim().split(/\s+/)[0], "source"));
  for (const m of html.matchAll(/<script\b[^>]*src="([^"]*)"/g)) checkTarget(page, m[1], "script");
  for (const m of html.matchAll(/<link\b[^>]*href="([^"]*)"/g)) checkTarget(page, m[1], "link-tag");

  // duplicate ids break anchors and label associations
  const seen = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  [...seen].filter(([, n]) => n > 1).forEach(([id, n]) => problems.push(`${page}: duplicate id "${id}" (${n}×)`));

  // every label needs a control
  for (const m of html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)) {
    if (!html.includes(`id="${m[1]}"`)) problems.push(`${page}: <label for="${m[1]}"> has no matching input`);
  }
}

// CSS url() references
const css = read("assets/css/styles.css");
for (const m of css.matchAll(/url\((["']?)([^"')]+)\1\)/g)) {
  const url = m[2];
  if (/^(data:|https?:|%23)/.test(url)) continue;
  // skip fragments of inline SVG data URIs (they look like url(%23id))
  if (!/\.[a-z0-9]{2,5}$/i.test(url)) continue;
  const target = normalize(join("assets/css", url));
  if (!existsSync(join(ROOT, target))) problems.push(`styles.css: missing asset "${url}"`);
}

// menu data → page consistency
const menuData = JSON.parse(read("assets/data/menu.json"));
const menuHtml = read("menu.html");
for (const cat of menuData.categories) {
  for (const item of cat.items) {
    if (!menuHtml.includes(`data-item="${item.id}"`))
      problems.push(`menu.html: item "${item.id}" missing — run "npm run menu"`);
  }
}

if (problems.length) {
  console.error(`✖ ${problems.length} problem(s):`);
  problems.forEach((p) => console.error(`  · ${p}`));
  process.exit(1);
}
console.log(`✓ links, assets and anchors OK across ${PAGES.length} pages`);
