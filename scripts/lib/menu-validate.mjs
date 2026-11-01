/**
 * One validator, used by the CLI guard (`scripts/menu-check.mjs`) and by the
 * admin API (`server.mjs`), so a dish can never be saved through the panel in a
 * state that `npm run check` would reject.
 *
 * Pure: takes the parsed menu document, returns a list of human-readable
 * problems. No filesystem, no globals.
 */

export const DIETS = ["veg", "egg", "meat", "chicken", "buff", "pork"];

/** The fields the generator, the page and the cart all rely on. */
const REQUIRED = ["no", "id", "name", "cn", "desc", "price", "diet", "source"];

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateMenu(data) {
  const problems = [];
  const fail = (msg) => problems.push(msg);

  if (!data || typeof data !== "object") return ["menu.json is not an object"];
  if (!Array.isArray(data.categories) || data.categories.length === 0) {
    return ["menu.json has no categories"];
  }

  const meta = data.meta ?? {};
  const boardPrices = meta.boardPrices;
  if (!Array.isArray(boardPrices) || boardPrices.length < 2) {
    fail("meta.boardPrices must list every price printed on the shop's boards");
  }
  if ((data.currency ?? "") !== "NPR") fail('currency must be "NPR"');

  const seenIds = new Map();
  const seenNumbers = new Map();
  const items = [];

  for (const cat of data.categories) {
    if (!cat.id || !ID_PATTERN.test(cat.id)) fail(`category id "${cat.id ?? ""}" must be lowercase-with-hyphens`);
    if (!cat.name) fail(`category "${cat.id}" has no name`);
    if (!cat.cn) fail(`category "${cat.id}" has no Chinese label`);
    if (!Array.isArray(cat.items) || cat.items.length === 0) {
      fail(`category "${cat.id}" has no items`);
      continue;
    }

    for (const item of cat.items) {
      const where = `${cat.id}/${item?.id || "?"}`;
      items.push({ ...item, category: cat.id });

      for (const field of REQUIRED) {
        if (item[field] === undefined || item[field] === null || item[field] === "") {
          fail(`${where}: missing "${field}"`);
        }
      }

      if (typeof item.no !== "number" || !Number.isInteger(item.no) || item.no < 1) {
        fail(`${where}: "no" must be the board number, as a whole number`);
      }
      if (typeof item.price !== "number" || !Number.isFinite(item.price)) {
        fail(`${where}: "price" must be a number, not text`);
      } else if (Array.isArray(boardPrices) && !boardPrices.includes(item.price)) {
        fail(
          `${where}: Rs ${item.price} is not a price on either board (allowed: ${boardPrices.join(", ")}). ` +
            "If the shop has a new price, photograph the board and add it to the board price list first."
        );
      }
      if (typeof item.heat !== "number" || item.heat < 0 || item.heat > 3) {
        fail(`${where}: "heat" must be the number of flames printed on the board, 0–3`);
      }
      if (!DIETS.includes(item.diet)) fail(`${where}: "diet" must be one of ${DIETS.join(", ")}`);
      if (typeof item.cn === "string" && item.cn && !/[\u4e00-\u9fff]/.test(item.cn)) {
        fail(`${where}: "cn" should be the Chinese name printed on the board`);
      }
      if (typeof item.id === "string" && !ID_PATTERN.test(item.id)) {
        fail(`${where}: id must be lowercase letters, numbers and hyphens`);
      }
      if (typeof item.source !== "string" || item.source.trim().length < 10) {
        fail(`${where}: "source" must say where the dish and its price came from`);
      } else if (typeof item.no === "number" && !item.source.includes(String(item.no))) {
        fail(`${where}: "source" should quote the board number #${item.no} it was read from`);
      }

      if (seenIds.has(item.id)) fail(`${where}: duplicate id, also used by ${seenIds.get(item.id)}`);
      seenIds.set(item.id, where);
      if (seenNumbers.has(item.no)) fail(`${where}: board number #${item.no} is already used by ${seenNumbers.get(item.no)}`);
      seenNumbers.set(item.no, where);
    }
  }

  return { problems, items };
}

/** Ids are slugified from the name, but the owner may type their own. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Suggests the next free board number in a category, for the "add dish" form. */
export function nextFreeNumber(data, categoryId) {
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) return 1;
  const used = new Set(cat.items.map((i) => i.no));
  const max = Math.max(0, ...used);
  for (let n = 1; n <= max + 1; n++) if (!used.has(n)) return n;
  return max + 1;
}
