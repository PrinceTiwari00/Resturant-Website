/* Site-wide behaviour: header, mobile nav, reveal, hours, map, misc. */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ---------------------------------------------------------------- header */
const header = $(".site-header");
const isHome = document.documentElement.classList.contains("page-home");

function onScroll() {
  if (!header) return;
  header.classList.toggle("is-stuck", window.scrollY > 24);
  const toTop = $(".to-top");
  if (toTop) toTop.classList.toggle("is-visible", window.scrollY > 700);
}
if (header) {
  if (!isHome) header.classList.add("is-stuck");
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ------------------------------------------------------------ mobile nav */
const navToggle = $(".nav-toggle");
const mobileNav = $(".mobile-nav");
let navOpen = false;

function setNav(open) {
  if (!navToggle || !mobileNav) return;
  navOpen = open;
  navToggle.setAttribute("aria-expanded", String(open));
  mobileNav.classList.toggle("is-open", open);
  mobileNav.inert = !open;
  document.body.classList.toggle("nav-open", open);
  if (open) {
    const first = $("a", mobileNav);
    first?.focus({ preventScroll: true });
  }
}
navToggle?.addEventListener("click", () => setNav(!navOpen));
$$(".mobile-nav a").forEach((a) => a.addEventListener("click", () => setNav(false)));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && navOpen) {
    setNav(false);
    navToggle?.focus();
  }
});
window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => {
  if (e.matches && navOpen) setNav(false);
});

/* -------------------------------------------------------------- reveal */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduceMotion && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  $$("[data-reveal]").forEach((el, i) => {
    el.style.setProperty("--reveal-delay", `${Math.min(i % 6, 5) * 70}ms`);
    io.observe(el);
  });
} else {
  $$("[data-reveal]").forEach((el) => el.classList.add("is-in"));
}

/* -------------------------------------------------------- opening hours */
const TZ = "Asia/Kathmandu";
/* Minutes since midnight, Kathmandu time. [open, close] */
/* Google Maps and Tripadvisor both list 9:00 AM – 11:00 PM every day. */
const SCHEDULE = {
  Sun: [540, 1380], // 09:00 – 23:00
  Mon: [540, 1380],
  Tue: [540, 1380],
  Wed: [540, 1380],
  Thu: [540, 1380],
  Fri: [540, 1380],
  Sat: [540, 1380],
};
const DELIVERY = [600, 1260]; // 10:00 – 21:00

function kathmanduNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { day: get("weekday"), minutes: hour * 60 + minute, label: `${get("hour")}:${get("minute")}` };
}

function openState() {
  const now = kathmanduNow();
  const [open, close] = SCHEDULE[now.day] ?? SCHEDULE.Sun;
  const isOpen = now.minutes >= open && now.minutes < close;
  const deliveryOpen = now.minutes >= DELIVERY[0] && now.minutes < DELIVERY[1];
  return { ...now, isOpen, deliveryOpen, close, open };
}

const fmtTime = (mins) => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};

function paintStatus() {
  const state = openState();
  $$("[data-open-status]").forEach((el) => {
    el.classList.toggle("is-open", state.isOpen);
    el.classList.toggle("is-closed", !state.isOpen);
    el.textContent = state.isOpen
      ? `Open now · until ${fmtTime(state.close)}`
      : `Closed now · opens ${fmtTime(state.open)}`;
  });
  $$("[data-delivery-status]").forEach((el) => {
    el.textContent = state.deliveryOpen
      ? "Delivery partner orders open now (10:00 AM – 9:00 PM)"
      : "Delivery partners take orders 10:00 AM – 9:00 PM — call us for takeaway";
  });
  $$("[data-today]").forEach((el) => {
    el.dataset.today = state.day;
  });
  const row = $(`[data-day="${state.day}"]`);
  row?.classList.add("is-today");
  row?.setAttribute("aria-current", "date");
}
paintStatus();
setInterval(paintStatus, 60_000);

/* ------------------------------------------------------------- map embed */
$$("[data-map-load]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const frame = $("#gmap");
    const consent = $("[data-map-consent]");
    if (!frame) return;
    frame.src = frame.dataset.src;
    frame.hidden = false;
    consent?.remove();
  });
});

/* ---------------------------------------------------------- back to top */
$(".to-top")?.addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
});

/* -------------------------------------------------------------- footer yr */
$$("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));

/* ----------------------------------------------- 404-ish local link guard */
$$('a[href^="#"]').forEach((a) => {
  const id = a.getAttribute("href");
  if (!id || id === "#") return;
  a.addEventListener("click", (e) => {
    const target = document.getElementById(id.slice(1));
    if (!target) {
      e.preventDefault();
      return;
    }
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    e.preventDefault();
  });
});
