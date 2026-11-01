/* Menu admin.
 *
 * Talks to /api/admin/* with a bearer token kept in sessionStorage. There is no
 * cookie, so a hostile page can never ride this session.
 *
 * Everything that comes back from the server is written with textContent or
 * setAttribute — never innerHTML — so a dish called `<img onerror=…>` is just a
 * funny name in the list, not script.
 */

const TOKEN_KEY = "kf-admin-token";

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    // event handlers are listeners, never serialised into an attribute
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
};

const $ = (sel, root = document) => root.querySelector(sel);

/* A plain deep copy: structuredClone is not available in every environment the
   panel runs in (jsdom, older Safari), and the menu is pure JSON anyway. */
const clone = (value) => JSON.parse(JSON.stringify(value));

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || "",
  menu: null,
  editing: null, // dish id whose editor is open
  adding: null, // category id whose "add" form is open
  busy: false,
};

/* ------------------------------------------------------------------- api */
class AuthError extends Error {}

async function api(path, { method = "GET", body, raw, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${state.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(raw ? { "Content-Type": raw.type } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : raw,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.status === 401) {
    signOutLocally();
    throw new AuthError("Your session has expired. Sign in again.");
  }
  if (!res.ok || payload?.ok === false) {
    const problems = payload?.problems?.length ? payload.problems : [payload?.error || `Request failed (${res.status}).`];
    const error = new Error(problems.join(" "));
    error.problems = problems;
    throw error;
  }
  return payload;
}

/* ---------------------------------------------------------------- chrome */
const screens = {
  login: $("#login-screen"),
  app: $("#admin-app"),
};

function showLogin(message) {
  screens.login.hidden = false;
  screens.app.hidden = true;
  const msg = $("#login-msg");
  if (message) {
    msg.textContent = message;
    msg.hidden = false;
  }
  $("#admin-password").focus();
}

function showApp() {
  screens.login.hidden = true;
  screens.app.hidden = false;
}

function status(message, tone = "") {
  const node = $("#admin-status");
  node.textContent = message;
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

function signOutLocally() {
  state.token = "";
  state.menu = null;
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
}

/* ---------------------------------------------------------------- render */
const priceLabel = (n) => `Rs ${n}`;
const heatLabel = (h) => (h === 0 ? "not spicy" : `${h} flame${h === 1 ? "" : "s"}`);

function photoUrl(item, width = 420) {
  if (!item.photo) return null;
  // cache-buster: the file name stays the same when a photo is replaced
  return `assets/img/dish-${encodeURIComponent(item.id)}-${width}.jpg?v=${state.photoStamp || 0}`;
}

function thumb(item) {
  const url = photoUrl(item, 300);
  if (!url) {
    return el("span", { class: "admin-row__photo", "aria-hidden": "true", text: "no photo" });
  }
  return el("span", { class: "admin-row__photo" }, [el("img", { src: url, alt: "", width: "300", height: "225", loading: "lazy" })]);
}

function render() {
  const host = $("#categories");
  host.replaceChildren();

  for (const cat of state.menu.categories) {
    const section = el("section", { class: "admin-card admin-cat", "aria-labelledby": `cat-${cat.id}` }, [
      el("header", { class: "admin-cat__head" }, [
        el("h2", { id: `cat-${cat.id}` }, [cat.name, el("span", { text: `${cat.items.length} dishes · ${cat.cn}` })]),
        el("button", {
          class: "admin-btn admin-btn--ghost",
          type: "button",
          style: "border-color: var(--line); color: var(--ink-2)",
          text: "+ Add a dish",
          onclick: () => {
            state.editing = null;
            state.adding = state.adding === cat.id ? null : cat.id;
            render();
            if (state.adding) $(`#new-${cat.id}`)?.querySelector("input")?.focus();
          },
        }),
      ]),
    ]);

    for (const [index, item] of cat.items.entries()) {
      const editing = state.editing === item.id;

      section.append(
        el("div", { class: "admin-row" }, [
          thumb(item),
          el("span", { class: "admin-row__no", text: `#${item.no}` }),
          el("div", { class: "admin-row__body" }, [
            el("div", { class: "admin-row__name" }, [item.name, el("span", { class: "admin-row__cn", lang: "zh", text: item.cn })]),
            el("div", {
              class: "admin-row__meta",
              text: `${priceLabel(item.price)} · ${heatLabel(item.heat)} · ${item.diet}${item.photo ? " · has a photo" : " · no photo"}`,
            }),
          ]),
          el("div", { class: "admin-row__actions" }, [
            el("button", {
              class: "admin-btn",
              type: "button",
              text: editing ? "Close" : "Edit",
              "aria-expanded": editing ? "true" : "false",
              onclick: () => {
                state.adding = null;
                state.editing = editing ? null : item.id;
                render();
              },
            }),
            el("button", {
              class: "admin-btn",
              type: "button",
              text: "↑",
              "aria-label": `Move ${item.name} earlier`,
              disabled: index === 0,
              onclick: () => move(cat.id, item.id, -1),
            }),
            el("button", {
              class: "admin-btn",
              type: "button",
              text: "↓",
              "aria-label": `Move ${item.name} later`,
              disabled: index === cat.items.length - 1,
              onclick: () => move(cat.id, item.id, 1),
            }),
            el("button", {
              class: "admin-btn admin-btn--danger",
              type: "button",
              text: "Delete",
              onclick: () => removeDish(cat, item),
            }),
          ]),
        ])
      );

      if (editing) section.append(dishEditor(cat, item));
    }

    if (state.adding === cat.id) section.append(newDishForm(cat));
    host.append(section);
  }

  $("#board-prices").value = state.menu.meta.boardPrices.join(", ");
}

/* ---------------------------------------------------------------- editor */
function field(label, input) {
  return el("label", { class: "admin-field" }, [el("span", { text: label }), input]);
}

const selectOptions = (options, selected) =>
  options.map(([value, label]) => el("option", { value, selected: String(value) === String(selected), text: label }));

const DIET_LABELS = [
  ["veg", "Vegetarian"],
  ["egg", "Egg"],
  ["meat", "Minced meat"],
  ["chicken", "Chicken"],
  ["buff", "Buff"],
  ["pork", "Pork"],
];

function dishFields(item, cat, { isNew }) {
  const prices = state.menu.meta.boardPrices;
  const priceInput = el("input", {
    type: "number",
    name: "price",
    step: "1",
    min: "1",
    required: true,
    list: "board-price-list",
    value: item.price ?? "",
    inputmode: "numeric",
  });
  const noInput = el("input", {
    type: "number",
    name: "no",
    min: "1",
    step: "1",
    required: true,
    value: item.no ?? "",
    inputmode: "numeric",
  });
  const nameInput = el("input", { type: "text", name: "name", required: true, value: item.name ?? "", maxlength: "80" });
  const cnInput = el("input", { type: "text", name: "cn", required: true, value: item.cn ?? "", maxlength: "40", lang: "zh" });
  const descInput = el("textarea", { name: "desc", required: true, maxlength: "400" });
  descInput.value = item.desc ?? "";
  const sourceInput = el("input", { type: "text", name: "source", required: true, value: item.source ?? "", maxlength: "300" });
  const heatSelect = el("select", { name: "heat" }, selectOptions([[0, "no flames"], [1, "1 flame"], [2, "2 flames"], [3, "3 flames"]], item.heat ?? 0));
  const dietSelect = el("select", { name: "diet" }, selectOptions(DIET_LABELS, item.diet ?? "veg"));

  const datalist = el("datalist", { id: "board-price-list" }, prices.map((p) => el("option", { value: String(p) })));

  const grid = el("div", { class: "admin-grid" }, [
    field("Board number", noInput),
    field("Price (Rs)", priceInput),
    field("Chinese name", cnInput),
    field("Heat", heatSelect),
    field("Contains", dietSelect),
    datalist,
  ]);
  const full = el("div", { class: "admin-grid admin-grid--full" }, [
    field("Name in English", nameInput),
    field("Description", descInput),
    field("Where it came from (quote the board number)", sourceInput),
  ]);

  const form = el("form", { class: isNew ? `admin-editor admin-editor--new` : "admin-editor", novalidate: true }, [
    el("h3", { text: isNew ? `New dish in ${cat.name}` : `Editing #${item.no} · ${item.name}` }),
    grid,
    full,
  ]);

  const problems = el("ul", { class: "admin-problems", hidden: true });
  const foot = el("div", { class: "admin-editor__foot" }, [
    el("button", { class: "admin-btn", type: "submit", style: "background: var(--red); color: var(--paper)" , text: isNew ? "Add the dish" : "Save changes" }),
    el("button", {
      class: "admin-btn admin-btn--ghost",
      type: "button",
      style: "color: var(--ink-2); border-color: var(--line)",
      text: "Cancel",
      onclick: () => {
        state.editing = null;
        state.adding = null;
        render();
      },
    }),
    problems,
  ]);
  form.append(foot);

  const collect = () => ({
    no: Number(noInput.value),
    price: Number(priceInput.value),
    name: nameInput.value.trim(),
    cn: cnInput.value.trim(),
    desc: descInput.value.trim(),
    source: sourceInput.value.trim(),
    heat: Number(heatSelect.value),
    diet: dietSelect.value,
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    problems.hidden = true;
    await guard(async () => {
      if (isNew) {
        const next = clone(state.menu);
        const target = next.categories.find((c) => c.id === cat.id);
        const fields = collect();
        target.items.push({ ...fields, id: newId(fields.name, next) });
        await save(next, `Added “${fields.name}”.`);
        state.adding = null;
      } else {
        const next = clone(state.menu);
        const target = next.categories.find((c) => c.id === cat.id);
        const row = target.items.find((i) => i.id === item.id);
        Object.assign(row, collect());
        await save(next, `Saved “${row.name}”.`);
        state.editing = null;
      }
      render();
    }, problems);
  });

  return form;
}

function dishEditor(cat, item) {
  const wrap = el("div");
  const form = dishFields(item, cat, { isNew: false });

  const photoRow = el("div", { class: "admin-editor__photo" });
  const file = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": `Photo of ${item.name}` });
  const photoStatus = el("span", { class: "admin-row__meta" });

  photoRow.append(thumb(item), el("div", {}, [
    el("div", { class: "admin-field" }, [el("span", { text: "Photo of this dish" }), file]),
    photoStatus,
  ]));

  if (item.photo) {
    photoRow.append(
      el("button", {
        class: "admin-btn admin-btn--danger",
        type: "button",
        text: "Remove photo",
        onclick: () => removePhoto(item),
      })
    );
  }

  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    if (chosen.size > 12 * 1024 * 1024) {
      photoStatus.textContent = "That file is over 12 MB — resize it first.";
      return;
    }
    photoStatus.textContent = "Uploading and resizing…";
    await guard(async () => {
      await api(`/api/admin/photo?id=${encodeURIComponent(item.id)}`, { method: "POST", raw: chosen });
      state.photoStamp = Date.now();
      await refresh();
      state.editing = item.id;
      render();
      status(`Photo updated for ${item.name}.`, "ok");
    }, null, photoStatus);
  });

  form.append(photoRow);
  wrap.append(form);
  return wrap;
}

function newDishForm(cat) {
  const taken = new Set(cat.items.map((i) => i.no));
  let suggested = 1;
  while (taken.has(suggested)) suggested += 1;

  const draft = {
    no: suggested,
    name: "",
    cn: "",
    desc: "",
    source: `Board in the shop, ${cat.name} section #${suggested}`,
    price: state.menu.meta.boardPrices[0],
    heat: 0,
    diet: "veg",
  };
  const form = dishFields(draft, cat, { isNew: true });
  form.id = `new-${cat.id}`;
  return form;
}

/* --------------------------------------------------------------- actions */
function newId(name, doc) {
  const base =
    String(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "dish";
  const used = new Set(doc.categories.flatMap((c) => c.items.map((i) => i.id)));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

async function save(nextMenu, successMessage) {
  status("Saving…");
  const payload = await api("/api/admin/menu", { method: "PUT", body: { menu: nextMenu } });
  state.menu = payload.menu;
  status(successMessage, "ok");
}

async function guard(fn, problemsNode, messageNode) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
  } catch (error) {
    const text = (error.problems || [error.message]).join(" ");
    if (problemsNode) {
      problemsNode.replaceChildren(...(error.problems || [error.message]).map((p) => el("li", { text: p })));
      problemsNode.hidden = false;
    }
    if (messageNode) messageNode.textContent = text;
    status(text, "error");
  } finally {
    state.busy = false;
  }
}

async function move(categoryId, dishId, delta) {
  await guard(async () => {
    const next = clone(state.menu);
    const cat = next.categories.find((c) => c.id === categoryId);
    const index = cat.items.findIndex((i) => i.id === dishId);
    const target = index + delta;
    if (target < 0 || target >= cat.items.length) return;
    [cat.items[index], cat.items[target]] = [cat.items[target], cat.items[index]];
    await save(next, "Order updated.");
    render();
  });
}

async function removeDish(cat, item) {
  const ok = window.confirm(
    `Delete “${item.name}” (#${item.no})?\n\nIt disappears from the public menu immediately. The previous version stays in git, so it can be restored.`
  );
  if (!ok) return;
  await guard(async () => {
    const next = clone(state.menu);
    const target = next.categories.find((c) => c.id === cat.id);
    target.items = target.items.filter((i) => i.id !== item.id);
    await save(next, `Deleted “${item.name}”.`);
    if (state.editing === item.id) state.editing = null;
    render();
  });
}

async function removePhoto(item) {
  const ok = window.confirm(`Remove the photo for “${item.name}”?`);
  if (!ok) return;
  await guard(async () => {
    const payload = await api(`/api/admin/photo?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    state.menu = payload.menu;
    state.editing = item.id;
    render();
    status("Photo removed.", "ok");
  });
}

/* ------------------------------------------------------------------ boot */
async function refresh() {
  const payload = await api("/api/admin/menu");
  state.menu = payload.menu;
}

async function start() {
  if (!state.token) {
    showLogin();
    return;
  }
  try {
    await refresh();
    showApp();
    render();
    status("Menu loaded. Every change saves straight away.", "ok");
  } catch (error) {
    if (!(error instanceof AuthError)) {
      showLogin(error.message);
    }
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#admin-password").value;
  const button = $("#login-submit");
  const msg = $("#login-msg");
  msg.hidden = true;
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Could not sign in.");
    state.token = payload.token;
    sessionStorage.setItem(TOKEN_KEY, payload.token);
    $("#admin-password").value = "";
    await refresh();
    showApp();
    render();
    status("Signed in. Every change saves straight away.", "ok");
  } catch (error) {
    msg.textContent = error.message;
    msg.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

$("#sign-out").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch {
    /* signing out locally is enough */
  }
  signOutLocally();
  $("#admin-password").focus();
});

$("#prices-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await guard(async () => {
    const list = $("#board-prices")
      .value.split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!list.length) throw new Error("Give at least one price.");
    const next = clone(state.menu);
    next.meta.boardPrices = [...new Set(list)].sort((a, b) => a - b);
    await save(next, "Board prices updated.");
    render();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && (state.editing || state.adding)) {
    state.editing = null;
    state.adding = null;
    render();
  }
});

start();
