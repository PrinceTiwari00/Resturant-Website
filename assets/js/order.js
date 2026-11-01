/* Order drawer: an itemised order that is handed off to the kitchen via
   WhatsApp (or a phone call). No payment, no accounts, no server required —
   the cart lives in localStorage so it survives page changes. */

const WHATSAPP = "9779851172950";
const PHONE_HREF = "tel:+9779851172950";
const STORE_KEY = "kungfu-order-v1";

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const state = {
  items: [], // [{ id, name, price, qty }]
  customer: { name: "", phone: "", type: "Pickup", address: "", notes: "" },
  catalog: new Map(),
};

/* ------------------------------------------------------------- catalogue */
const CATALOG_FALLBACK = new Map();
$$("[data-add-to-order]").forEach((btn) => {
  const id = btn.dataset.addToOrder;
  const row = btn.closest("[data-item]");
  if (!id || !row) return;
  CATALOG_FALLBACK.set(id, {
    name: row.dataset.name || $(".dish-row__name", row)?.textContent.trim() || id,
    price: Number(row.dataset.price) || 0,
  });
});

async function loadCatalog() {
  const url = $("[data-menu-source]")?.dataset.menuSource ?? "assets/data/menu.json";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    data.categories.forEach((cat) =>
      cat.items.forEach((item) => state.catalog.set(item.id, { name: item.name, price: item.price }))
    );
  } catch {
    /* Offline or file:// — fall back to data attributes baked into the markup. */
    CATALOG_FALLBACK.forEach((v, k) => state.catalog.set(k, v));
  }
  CATALOG_FALLBACK.forEach((v, k) => {
    if (!state.catalog.has(k)) state.catalog.set(k, v);
  });
}

/* --------------------------------------------------------------- storage */
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && Array.isArray(raw.items)) {
      state.items = raw.items.filter((i) => i && typeof i.id === "string" && Number(i.qty) > 0);
      Object.assign(state.customer, raw.customer || {});
    }
  } catch {
    /* corrupted storage — start fresh */
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: state.items, customer: state.customer }));
  } catch {
    /* private mode / quota — the order still works for this page view */
  }
}

const npr = (n) => `Rs ${Number(n).toLocaleString("en-IN")}`;
const count = () => state.items.reduce((sum, i) => sum + i.qty, 0);
const subtotal = () => state.items.reduce((sum, i) => sum + i.qty * i.price, 0);

/* ---------------------------------------------------------------- drawer */
const drawer = $("#order-drawer");
const backdrop = $(".drawer-backdrop");
let lastFocused = null;

function openDrawer() {
  if (!drawer) return;
  lastFocused = document.activeElement;
  drawer.classList.add("is-open");
  backdrop?.classList.add("is-open");
  drawer.inert = false;
  document.body.classList.add("drawer-open");
  drawer.addEventListener("keydown", trapFocus);
  setTimeout(() => $(".drawer__close")?.focus({ preventScroll: true }), 60);
}
function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove("is-open");
  backdrop?.classList.remove("is-open");
  drawer.inert = true;
  document.body.classList.remove("drawer-open");
  drawer.removeEventListener("keydown", trapFocus);
  if (lastFocused instanceof HTMLElement) lastFocused.focus({ preventScroll: true });
}
function trapFocus(e) {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeDrawer();
    return;
  }
  if (e.key !== "Tab") return;
  const focusables = $$(
    'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
    drawer
  ).filter((el) => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

$$("[data-drawer-open]").forEach((el) =>
  el.addEventListener("click", (e) => {
    e.preventDefault();
    openDrawer();
  })
);
$$("[data-drawer-close]").forEach((el) => el.addEventListener("click", closeDrawer));

/* --------------------------------------------------------------- render */
function lineMarkup(item) {
  return `<div class="cart-line" data-line="${item.id}">
      <div>
        <p class="cart-line__name">${escapeHtml(item.name)}</p>
        <div class="qty" role="group" aria-label="Quantity for ${escapeHtml(item.name)}">
          <button type="button" data-qty="-1" data-id="${item.id}" aria-label="Remove one ${escapeHtml(
            item.name
          )}">&minus;</button>
          <output>${item.qty}</output>
          <button type="button" data-qty="1" data-id="${item.id}" aria-label="Add one ${escapeHtml(
            item.name
          )}">+</button>
        </div>
      </div>
      <span class="cart-line__price">${npr(item.price * item.qty)}</span>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  const lines = $("#order-lines");
  const empty = $("#order-empty");
  if (!lines) return;

  lines.innerHTML = state.items.map(lineMarkup).join("");
  empty?.classList.toggle("is-hidden", state.items.length > 0);
  empty && (empty.hidden = state.items.length > 0);

  $$("[data-qty]").forEach((btn) =>
    btn.addEventListener("click", () => bump(btn.dataset.id, Number(btn.dataset.qty)))
  );

  const total = subtotal();
  $$("[data-order-subtotal]").forEach((el) => (el.textContent = npr(total)));
  $$("[data-order-count]").forEach((el) => {
    const c = count();
    el.textContent = String(c);
    el.dataset.count = String(c);
  });
  $$("[data-order-count-label]").forEach((el) => {
    const c = count();
    el.textContent = c === 0 ? "Your order is empty" : `${c} item${c === 1 ? "" : "s"} in your order`;
  });
  const send = $("#order-send");
  if (send) send.disabled = state.items.length === 0;
  save();
}

function add(id, qty = 1) {
  const meta = state.catalog.get(id);
  if (!meta) return;
  const existing = state.items.find((i) => i.id === id);
  if (existing) existing.qty += qty;
  else state.items.push({ id, name: meta.name, price: meta.price, qty });
  render();
  flashAdded(id);
  toast(`${meta.name} added — ${npr(meta.price * qty)}`);
}

function bump(id, delta) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.items = state.items.filter((i) => i.id !== id);
  render();
}

function flashAdded(id) {
  const btn = $(`[data-add-to-order="${id}"]`);
  if (!btn) return;
  btn.classList.add("is-added");
  setTimeout(() => btn.classList.remove("is-added"), 900);
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  if (!el) return;
  $("#toast-message", el).textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
}
$$("[data-toast-close]")?.forEach((b) => b.addEventListener("click", () => $("#toast")?.classList.remove("is-visible")));

$$("[data-add-to-order]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const id = btn.dataset.addToOrder;
    if (!state.catalog.has(id)) {
      const row = btn.closest("[data-item]");
      state.catalog.set(id, {
        name: row?.dataset.name || $(".dish-row__name", row)?.textContent.trim() || id,
        price: Number(row?.dataset.price) || 0,
      });
    }
    add(id, 1);
  })
);

/* ----------------------------------------------------------------- form */
const form = $("#order-form");
form?.addEventListener("input", () => {
  state.customer.name = $("#cust-name")?.value.trim() ?? "";
  state.customer.phone = $("#cust-phone")?.value.trim() ?? "";
  state.customer.type = $("#cust-type")?.value ?? "Pickup";
  state.customer.address = $("#cust-address")?.value.trim() ?? "";
  state.customer.notes = $("#cust-notes")?.value.trim() ?? "";
  $("#address-field")?.toggleAttribute("hidden", state.customer.type !== "Delivery");
  save();
});

function hydrateForm() {
  const map = { "#cust-name": "name", "#cust-phone": "phone", "#cust-type": "type", "#cust-address": "address", "#cust-notes": "notes" };
  Object.entries(map).forEach(([sel, key]) => {
    const el = $(sel);
    if (el && state.customer[key]) el.value = state.customer[key];
  });
  $("#address-field")?.toggleAttribute("hidden", state.customer.type !== "Delivery");
}

function validate() {
  const problems = [];
  const name = $("#cust-name");
  const phone = $("#cust-phone");
  const address = $("#cust-address");
  [name, phone, address].forEach((el) => el && el.removeAttribute("aria-invalid"));

  if (!state.items.length) problems.push("Add at least one dish to your order.");
  if (!state.customer.name) {
    problems.push("Please add your name.");
    name?.setAttribute("aria-invalid", "true");
  }
  if (!/^[+\d][\d\s-]{6,17}$/.test(state.customer.phone)) {
    problems.push("Please add a phone number we can call about your order.");
    phone?.setAttribute("aria-invalid", "true");
  }
  if (state.customer.type === "Delivery" && state.customer.address.length < 6) {
    problems.push("Please add a delivery address or a landmark.");
    address?.setAttribute("aria-invalid", "true");
  }
  return problems;
}

function buildMessage() {
  const lines = state.items.map((i) => `• ${i.qty} × ${i.name} — ${npr(i.price * i.qty)}`);
  const c = state.customer;
  const delivery = c.type === "Delivery";
  return [
    "Hello Kungfu Noodles! I'd like to place an order:",
    "",
    ...lines,
    "",
    `Total: ${npr(subtotal())}`,
    "",
    `Name: ${c.name}`,
    `Phone: ${c.phone}`,
    `Order type: ${c.type}${delivery && c.address ? ` — ${c.address}` : ""}`,
    ...(c.notes ? [`Notes: ${c.notes}`] : []),
    "",
    "Sent from kungfunoodles.com.np",
  ].join("\n");
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const problems = validate();
  const status = $("#order-status");
  if (problems.length) {
    if (status) {
      status.className = "form-status form-status--error is-visible";
      status.innerHTML = `<p>${problems.map(escapeHtml).join("<br>")}</p>`;
    }
    $("[aria-invalid='true']")?.focus();
    return;
  }
  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(buildMessage())}`;
  window.open(url, "_blank", "noopener");
  if (status) {
    status.className = "form-status is-visible";
    status.innerHTML =
      "<p><strong>WhatsApp should be opening now.</strong> Not seeing it? " +
      `<a href="${url}" target="_blank" rel="noopener">Tap here to send your order</a>, ` +
      `or call <a href="${PHONE_HREF}">+977 985-1172950</a>.</p>`;
  }
});

/* --------------------------------------------------------- copy & clear */
$("[data-copy-order]")?.addEventListener("click", async () => {
  const text = buildMessage();
  try {
    await navigator.clipboard.writeText(text);
    toast("Order copied to clipboard");
  } catch {
    toast(`Call us instead: +977 985-1172950`);
  }
});

$("[data-clear-order]")?.addEventListener("click", () => {
  state.items = [];
  render();
  toast("Order cleared");
});

/* ------------------------------------------------------------------ init */
load();
render();
loadCatalog().then(render);
hydrateForm();

/* Deep link: menu.html?add=special-kungfu */
const addParam = new URLSearchParams(location.search).get("add");
if (addParam) loadCatalog().then(() => add(addParam, 1));
