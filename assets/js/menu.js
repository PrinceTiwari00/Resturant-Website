/* Menu filtering & search. Works on top of server-rendered HTML so the page
   is fully readable (and crawlable) with JavaScript disabled. */

const rows = Array.from(document.querySelectorAll("[data-item]"));
const sections = Array.from(document.querySelectorAll("[data-cat-section]"));
const chips = Array.from(document.querySelectorAll("[data-filter]"));
const search = document.querySelector("#menu-search");
const counter = document.querySelector("[data-result-count]");
const empty = document.querySelector(".menu-empty");
const summary = document.querySelector("[data-filter-summary]");

if (rows.length) {
  let filter = "all";
  let query = "";

  const matches = (row) => {
    if (query && !row.dataset.search.includes(query)) return false;
    if (filter === "all") return true;
    if (filter === "veg") return row.dataset.diet === "veg";
    if (filter === "spicy") return Number(row.dataset.heat) >= 2;
    return row.dataset.cat === filter;
  };

  const describe = () => {
    if (query) return `“${search.value.trim()}”`;
    if (filter === "veg") return "vegetarian dishes";
    if (filter === "spicy") return "spicy dishes";
    if (filter !== "all") return chips.find((c) => c.dataset.filter === filter)?.textContent.trim();
    return "everything";
  };

  function apply() {
    let shown = 0;
    rows.forEach((row) => {
      const ok = matches(row);
      row.hidden = !ok;
      if (ok) shown += 1;
    });
    sections.forEach((section) => {
      section.hidden = !section.querySelector("[data-item]:not([hidden])");
    });
    if (counter) counter.textContent = String(shown);
    if (summary) summary.textContent = `Showing ${shown} ${shown === 1 ? "dish" : "dishes"} — ${describe()}`;
    if (empty) empty.classList.toggle("is-visible", shown === 0);
  }

  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      filter = chip.dataset.filter;
      chips.forEach((c) => {
        const active = c === chip;
        c.classList.toggle("is-active", active);
        c.setAttribute("aria-pressed", String(active));
      });
      apply();
      const firstVisible = sections.find((s) => !s.hidden);
      firstVisible?.scrollIntoView({ block: "start", behavior: "auto" });
    })
  );

  let debounce;
  search?.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      query = search.value.trim().toLowerCase();
      apply();
    }, 120);
  });

  // "/" focuses search, Escape clears it
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if (e.key === "/" && !typing) {
      e.preventDefault();
      search?.focus();
    }
    if (e.key === "Escape" && document.activeElement === search) {
      search.value = "";
      query = "";
      apply();
      search.blur();
    }
  });

  apply();
}
